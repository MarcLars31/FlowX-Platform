import assert from "node:assert/strict";
import test from "node:test";
import { applyDoclingOcr, failedOcrPageNumbers } from "./docling-ocr-fallback";
import { mergeClientOcrPages } from "./technical-description-ocr-payload";
import type { TechnicalDescriptionPage } from "@/modules/technical-description-extractor/types";

const source: TechnicalDescriptionPage = { pageNumber: 4, text: "Digital header", method: "text", confidence: .5, status: "partial", ocrReason: "image-body" };
const full = "30.1.2 UB1.111\nRørledning. Materiale: stål. Lokalisering: teknisk rom. Andre krav: komplett levering.\nLengde m 12,5";

test("fallback selects only attempted OCR pages that remain unreadable", () => {
  const original = [source, { ...source, pageNumber: 5 }, { ...source, pageNumber: 6 },
    { ...source, pageNumber: 7, text: full, ocrReason: undefined, status: "success" as const, confidence: .98 }];
  const attempted = [{ pageNumber: 4, text: "", confidence: 0 }, { pageNumber: 5, text: full, confidence: .9 },
    { pageNumber: 7, text: "", confidence: 0 }];
  assert.deepEqual(failedOcrPageNumbers(original, mergeClientOcrPages(original, attempted), attempted), [4]);
  assert.deepEqual(failedOcrPageNumbers(original, original, []), []);
  const low = [{ pageNumber: 4, text: full, confidence: .4 }];
  assert.deepEqual(failedOcrPageNumbers([source], mergeClientOcrPages([source], low), low), [4]);
});

test("valid reserve OCR keeps both readings and normal OCR review semantics", () => {
  const primary = { pageNumber: 4, text: "30.1.2 UB1.111\nRørledning", confidence: .4 };
  const [current] = mergeClientOcrPages([source], [primary]);
  const result = applyDoclingOcr(source, current, { pageNumber: 4, text: full, confidence: .95 });
  assert.equal(result.ocrFallback?.status, "accepted");
  assert.equal(result.method, "ocr");
  assert.equal(result.status, "success");
  assert.equal(result.sourceReadings?.primaryOcr, primary.text);
  assert.equal(result.sourceReadings?.digital, source.text);
  assert.equal(result.sourceReadings?.docling, full);
  assert.equal(result.postTable, undefined);
});

test("low confidence, mismatched pages, dropped post IDs/codes and header-only results cannot replace existing text", () => {
  const [current] = mergeClientOcrPages([source], [{ pageNumber: 4, text: full, confidence: .4 }]);
  for (const candidate of [
    { pageNumber: 4, text: full, confidence: .5 },
    { pageNumber: 3, text: full, confidence: .99 },
    { pageNumber: 4, text: full.replace("30.1.2", "30.1.3"), confidence: .99 },
    { pageNumber: 4, text: full.replace("UB1.111", "UB1.112"), confidence: .99 },
    { pageNumber: 4, text: source.text, confidence: .99 }
  ]) {
    const result = applyDoclingOcr(source, current, candidate);
    assert.equal(result.ocrFallback?.status, "rejected");
    assert.equal(result.text, current.text);
    assert.equal(result.status, current.status);
  }
});
