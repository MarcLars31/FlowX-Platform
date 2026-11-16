import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { TechnicalDescriptionPage } from "@/modules/technical-description-extractor/types";
import { PRICE_COLUMN_VERSION } from "@/modules/technical-description-extractor/pdf-price-columns";
import { layoutTextFromOcrBlocks } from "@/modules/technical-description-extractor/pdf-layout";
import type { ClientOcrPage } from "./technical-description-ocr-payload";
import { applyDoclingOcr, DOCLING_OCR_VERSION, failedOcrPageNumbers } from "./docling-ocr-fallback";

export type DoclingConfig = { url: string; token: string; timeoutMs: number };
export class DoclingBusyError extends Error {}
export type DoclingCell = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
export type DoclingInput = { buffer: Buffer; hash: string; original: TechnicalDescriptionPage[];
  pages: TechnicalDescriptionPage[]; attempted: ClientOcrPage[] };

export function doclingConfig(env: Record<string, string | undefined> = process.env): DoclingConfig | undefined {
  if (!env.DOCLING_OCR_URL || !env.DOCLING_OCR_TOKEN) return undefined;
  const url = new URL(env.DOCLING_OCR_URL);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    || env.DOCLING_OCR_TOKEN.length < 32) throw new Error("DOCLING_CONFIG_INVALID");
  const timeoutMs = Number(env.DOCLING_OCR_TIMEOUT_MS ?? 90_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) throw new Error("DOCLING_CONFIG_INVALID");
  return { url: url.toString(), token: env.DOCLING_OCR_TOKEN, timeoutMs };
}

export async function readDoclingPage(pdf: Uint8Array, pageNumber: number, config: DoclingConfig,
  fetcher: typeof fetch = fetch): Promise<ClientOcrPage> {
  const hash = createHash("sha256").update(pdf).digest("hex");
  const response = await fetcher(config.url, { method: "POST", redirect: "error", cache: "no-store",
    headers: { "Content-Type": "application/pdf", Authorization: `Bearer ${config.token}` },
    body: new Uint8Array(pdf), signal: AbortSignal.timeout(config.timeoutMs) });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 503 && response.headers.get("X-Docling-Status") === "busy") throw new DoclingBusyError("DOCLING_BUSY");
    throw new Error("DOCLING_SERVICE_UNAVAILABLE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("DOCLING_INVALID_RESPONSE");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw new Error("DOCLING_RESPONSE_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    version?: unknown; sourceSha256?: unknown; status?: unknown; cells?: unknown };
  if (data.version !== DOCLING_OCR_VERSION || data.sourceSha256 !== hash || data.status !== "success"
    || !Array.isArray(data.cells) || data.cells.length > 10_000) throw new Error("DOCLING_INVALID_RESPONSE");
  let totalText = 0;
  const cells: DoclingCell[] = data.cells.map(value => {
    const cell = value as DoclingCell;
    if (!cell || typeof cell.text !== "string" || cell.text.length > 10_000 || !cell.bbox
      || !Number.isFinite(cell.confidence) || cell.confidence < 0 || cell.confidence > 1
      || ![cell.bbox.x0, cell.bbox.y0, cell.bbox.x1, cell.bbox.y1].every(n => Number.isFinite(n) && n >= 0 && n <= 20_000)
      || cell.bbox.x1 < cell.bbox.x0 || cell.bbox.y1 < cell.bbox.y0) throw new Error("DOCLING_INVALID_CELL");
    totalText += cell.text.length;
    if (totalText > 300_000) throw new Error("DOCLING_RESPONSE_TOO_LARGE");
    return { ...cell, text: cell.text.replace(/\0/g, "").trim() };
  });
  // Use the existing positioned OCR reader. TableFormer row assignments and
  // Markdown price columns must not become authoritative post quantities.
  const text = layoutTextFromOcrBlocks([{ paragraphs: [{ lines: [{ words: cells }] }] }]);
  const weight = cells.reduce((sum, cell) => sum + cell.text.length, 0);
  const confidence = weight ? cells.reduce((sum, cell) => sum + cell.confidence * cell.text.length, 0) / weight : 0;
  return { pageNumber, text, confidence, words: cells.map(cell => ({ text: cell.text, bbox: cell.bbox })) };
}

export async function recoverFailedOcr(input: DoclingInput, dependencies: {
  config?: DoclingConfig | (() => DoclingConfig | undefined);
  cached: () => Promise<TechnicalDescriptionPage[]>;
  save: (page: TechnicalDescriptionPage) => Promise<void>;
  beforePage: (timeoutMs: number) => Promise<void>;
  fetcher?: typeof fetch;
}) {
  const numbers = failedOcrPageNumbers(input.original, input.pages, input.attempted);
  if (!numbers.length) return input.pages;
  let config: DoclingConfig | undefined;
  try { config = typeof dependencies.config === "function" ? dependencies.config() : dependencies.config; }
  catch { console.warn("docling_ocr_configuration_invalid"); return input.pages; }
  if (!config) return input.pages;
  const cached = new Map((await dependencies.cached()).map(page => [page.pageNumber, page]));
  const pages = new Map(input.pages.map(page => [page.pageNumber, page]));
  let pdf: PDFDocument | undefined;
  let serviceUnavailable = false;
  for (const pageNumber of numbers) {
    const saved = cached.get(pageNumber);
    if (saved?.ocrFallback?.version === DOCLING_OCR_VERSION && saved.priceColumns?.version === PRICE_COLUMN_VERSION) { pages.set(pageNumber, saved); continue; }
    if (serviceUnavailable) continue; // Do not multiply timeouts during a service outage.
    await dependencies.beforePage(config.timeoutMs);
    const original = input.original.find(page => page.pageNumber === pageNumber)!;
    const current = pages.get(pageNumber)!;
    let result: TechnicalDescriptionPage;
    try {
      pdf ??= await PDFDocument.load(input.buffer, { updateMetadata: false });
      const single = await PDFDocument.create();
      const [page] = await single.copyPages(pdf, [pageNumber - 1]);
      single.addPage(page);
      const candidate = await readDoclingPage(await single.save(), pageNumber, config, dependencies.fetcher);
      result = applyDoclingOcr(original, current, candidate);
    } catch (error) {
      if (error instanceof DoclingBusyError) throw error;
      serviceUnavailable = true;
      result = { ...current, ocrFallback: { version: DOCLING_OCR_VERSION, status: "unavailable", reason: "service_failed" } };
      console.warn("docling_ocr_unavailable", { pageNumber });
    }
    // Authorization/storage failures must abort the job, never look like OCR failures.
    await dependencies.save(result);
    pages.set(pageNumber, result);
  }
  return input.pages.map(page => pages.get(page.pageNumber)!);
}
