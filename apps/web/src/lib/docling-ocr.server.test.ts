import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { doclingConfig, DoclingBusyError, readDoclingPage, recoverFailedOcr, type DoclingCell, type DoclingInput } from "./docling-ocr.server";
import { DOCLING_OCR_VERSION } from "./docling-ocr-fallback";
import type { TechnicalDescriptionPage } from "@/modules/technical-description-extractor/types";
import { extractTechnicalDescriptionFromPages } from "@/modules/technical-description-extractor";

const config = { url: "http://127.0.0.1:8090/v1/ocr/page", token: "x".repeat(40), timeoutMs: 1000 };
const cell = (text: string, x: number, y: number): DoclingCell => ({ text, confidence: .95, bbox: { x0: x, x1: x + text.length * 4, y0: y, y1: y + 8 } });
const cells = [cell("Postnr", 10, 10), cell("Beskrivelse", 100, 10), cell("Enh.", 350, 10), cell("Mengde", 400, 10), cell("Pris", 460, 10), cell("Sum", 530, 10),
  cell("30.1.2", 10, 30), cell("UB1.111", 100, 30), cell("Rørledning i teknisk rom", 100, 45),
  cell("Materiale: stål. Andre krav: komplett levering.", 100, 60), cell("Lengde", 100, 75), cell("m", 350, 75), cell("12,5", 400, 75), cell("0,00", 460, 75), cell("0,00", 530, 75)];
const reply = (bytes: Uint8Array, overrides = {}) => Response.json({ version: DOCLING_OCR_VERSION, status: "success",
  sourceSha256: createHash("sha256").update(bytes).digest("hex"), cells, ...overrides });

async function input(): Promise<DoclingInput> {
  const pdf = await PDFDocument.create(); pdf.addPage([500, 600]); pdf.addPage([700, 800]);
  const original: TechnicalDescriptionPage[] = [1, 2].map(pageNumber => ({ pageNumber, text: "", method: "text", confidence: 0, status: "failed" }));
  return { buffer: Buffer.from(await pdf.save()), hash: "a".repeat(64), original, pages: original,
    attempted: original.map(page => ({ pageNumber: page.pageNumber, text: "", confidence: 0 })) };
}

test("service configuration is private, opt-in and requires secure transport", () => {
  assert.equal(doclingConfig({}), undefined);
  assert.equal(doclingConfig({ DOCLING_OCR_URL: config.url }), undefined);
  assert.equal(doclingConfig({ DOCLING_OCR_URL: config.url, DOCLING_OCR_TOKEN: config.token })?.timeoutMs, 90_000);
  for (const url of ["http://service.example/", "https://user:pass@service.example/", "https://service.example/?token=secret"]) {
    assert.throws(() => doclingConfig({ DOCLING_OCR_URL: url, DOCLING_OCR_TOKEN: config.token }), /CONFIG/);
  }
});

test("only the failed page is transmitted; checkpoints resume without duplicate OCR", async () => {
  const data = await input();
  data.attempted = [data.attempted[1]];
  const saved: TechnicalDescriptionPage[] = [];
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++; assert.equal(url, config.url); assert.equal(options?.redirect, "error");
    assert.equal(new Headers(options?.headers).get("Authorization"), `Bearer ${config.token}`);
    const bytes = options!.body as Uint8Array;
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1); assert.equal(pdf.getPage(0).getWidth(), 700);
    return reply(bytes);
  };
  const deps = { config, cached: async () => saved, save: async (page: TechnicalDescriptionPage) => { saved.push(page); }, beforePage: async () => {}, fetcher };
  const result = await recoverFailedOcr(data, deps);
  assert.equal(calls, 1); assert.equal(result[0], data.pages[0]);
  assert.equal(result[1].ocrFallback?.status, "accepted");
  assert.match(result[1].text, /Lengde m 12,5/);
  const extracted = extractTechnicalDescriptionFromPages(result);
  assert.equal(extracted.materialLines.find(line => line.postNumber === "30.1.2")?.quantity, 12.5);
  assert.ok(extracted.materialLines.find(line => line.postNumber === "30.1.2")?.reviewFlags.includes("ocr-source"));
  assert.deepEqual(await recoverFailedOcr(data, deps), result); assert.equal(calls, 1);
});

test("disabled fallback and successful OCR require no cache or service access", async () => {
  const data = await input();
  const unexpected = async (): Promise<never> => { throw new Error("unexpected I/O"); };
  const deps = { cached: unexpected, save: unexpected, beforePage: unexpected, fetcher: unexpected };
  assert.equal(await recoverFailedOcr(data, deps), data.pages);
  data.pages = data.pages.map(page => ({ ...page, method: "ocr", status: "success", confidence: .99, text: "Readable source text. ".repeat(10) }));
  assert.equal(await recoverFailedOcr(data, { ...deps, config }), data.pages);
  assert.equal(await recoverFailedOcr(data, { ...deps, config: () => { throw new Error("unexpected config access"); } }), data.pages);
});

test("outages preserve source and stop further requests; storage errors still propagate", async () => {
  const data = await input(); let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error("offline"); };
  const deps = { config, cached: async () => [], save: async () => {}, beforePage: async () => {}, fetcher };
  const result = await recoverFailedOcr(data, deps);
  assert.equal(calls, 1); assert.equal(result[0].text, ""); assert.equal(result[0].status, "failed");
  assert.equal(result[0].ocrFallback?.status, "unavailable"); assert.equal(result[1], data.pages[1]);
  await assert.rejects(recoverFailedOcr(data, { ...deps, save: async () => { throw new Error("storage failed"); } }), /storage failed/);
});

test("budget continuation saves completed pages and resumes the next one", async () => {
  const data = await input(); const saved: TechnicalDescriptionPage[] = []; let calls = 0; let checks = 0;
  const deps = { config, cached: async () => saved, save: async (page: TechnicalDescriptionPage) => { saved.push(page); },
    beforePage: async () => { if (++checks === 2) throw new Error("time budget"); },
    fetcher: (async (_url, options) => { calls++; return reply(options!.body as Uint8Array); }) as typeof fetch };
  await assert.rejects(recoverFailedOcr(data, deps), /time budget/);
  assert.deepEqual(saved.map(page => page.pageNumber), [1]);
  const result = await recoverFailedOcr(data, { ...deps, beforePage: async () => {} });
  assert.equal(calls, 2); assert.ok(result.every(page => page.ocrFallback?.status === "accepted"));
});

test("a busy reserve service defers the job without caching a failed page", async () => {
  const data = await input(); let saves = 0;
  await assert.rejects(recoverFailedOcr(data, { config, cached: async () => [],
    save: async () => { saves++; }, beforePage: async () => {},
    fetcher: async () => Response.json({ error: "busy" }, { status: 503, headers: { "X-Docling-Status": "busy" } }) }), DoclingBusyError);
  assert.equal(saves, 0);
});

test("invalid identity, coordinates, confidence and oversized responses are rejected", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  for (const overrides of [{ sourceSha256: "wrong" }, { version: "other" }, { cells: [{ ...cells[0], confidence: 7 }] },
    { cells: [{ ...cells[0], bbox: { x0: 0, x1: -1, y0: 0, y1: 5 } }] }]) {
    await assert.rejects(readDoclingPage(bytes, 1, config, async () => reply(bytes, overrides)), /DOCLING/);
  }
  await assert.rejects(readDoclingPage(bytes, 1, config, async () => new Response(" ".repeat(2_000_001))), /TOO_LARGE/);
});
