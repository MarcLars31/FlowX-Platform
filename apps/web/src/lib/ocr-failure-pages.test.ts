import assert from "node:assert/strict";
import test from "node:test";
import { extractOcrWithFailurePages } from "./ocr-failure-pages";
import type { ClientOcrPage } from "./technical-description-ocr-payload";
import { resumeOcrImport } from "./ocr-batches";

test("a recognizer crash retains completed pages and sends failed pages for server fallback", async () => {
  const result = await extractOcrWithFailurePages(async (_file, _pages, _progress, onPage) => {
    await onPage!({ pageNumber: 1, text: "read", confidence: .9 }); throw new Error("OCR worker crashed");
  }, new File(["pdf"], "test.pdf"), [1, 2, 3], () => {});
  assert.deepEqual(result, [{ pageNumber: 1, text: "read", confidence: .9 }, { pageNumber: 2, text: "", confidence: 0 }, { pageNumber: 3, text: "", confidence: 0 }]);
});

test("delivery errors remain errors rather than fabricated OCR failures", async () => {
  const pages: ClientOcrPage[] = [];
  await assert.rejects(extractOcrWithFailurePages(async (_file, _numbers, _progress, onPage) => {
    await onPage!({ pageNumber: 1, text: "read", confidence: .9 }); return [];
  }, new File(["pdf"], "test.pdf"), [1, 2], () => {}, async page => { pages.push(page); throw new Error("checkpoint unavailable"); }), /checkpoint unavailable/);
  assert.equal(pages.length, 1);
});

test("failed browser initialization still completes OCR checkpoints and resumes the background job", async () => {
  const saved: ClientOcrPage[] = [];
  const response = await resumeOcrImport(new File(["pdf"], "test.pdf"), "job", [4, 5], async () => { throw new Error("WASM failed"); },
    async (_url, options) => { saved.push(...JSON.parse(options!.body as string)); return Response.json({ status: "queued" }); });
  assert.equal(response.status, 202);
  assert.deepEqual(saved.map(page => [page.pageNumber, page.confidence]), [[4, 0], [5, 0]]);
});
