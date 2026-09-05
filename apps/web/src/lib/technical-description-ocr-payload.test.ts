import assert from "node:assert/strict";
import test from "node:test";
import {
  ClientOcrPayloadError,
  mergeClientOcrPages,
  parseClientOcrPages
} from "./technical-description-ocr-payload";

test("validates and clamps browser OCR pages", () => {
  const pages = parseClientOcrPages(
    JSON.stringify([{ pageNumber: 2, text: "  sprinkler  ", confidence: 1.4 }]),
    3
  );
  assert.deepEqual(pages, [
    { pageNumber: 2, text: "sprinkler", confidence: 1 }
  ]);
});

test("rejects duplicate and out-of-range OCR pages", () => {
  assert.throws(
    () =>
      parseClientOcrPages(
        JSON.stringify([
          { pageNumber: 1, text: "first", confidence: 0.8 },
          { pageNumber: 1, text: "duplicate", confidence: 0.8 }
        ]),
        2
      ),
    ClientOcrPayloadError
  );
  assert.throws(
    () =>
      parseClientOcrPages(
        JSON.stringify([{ pageNumber: 3, text: "outside", confidence: 0.8 }]),
        2
      ),
    ClientOcrPayloadError
  );
});

test("keeps readable server text and fills image-only pages with OCR", () => {
  const merged = mergeClientOcrPages(
    [
      {
        pageNumber: 1,
        text: "A".repeat(120),
        method: "text",
        confidence: 0.98,
        status: "success"
      },
      {
        pageNumber: 2,
        text: "",
        method: "text",
        confidence: 0,
        status: "failed",
        errorCode: "ocr_failed"
      }
    ],
    [
      { pageNumber: 1, text: "must not replace text", confidence: 0.7 },
      { pageNumber: 2, text: "B".repeat(140), confidence: 0.87 }
    ]
  );

  assert.equal(merged[0].method, "text");
  assert.equal(merged[0].text, "A".repeat(120));
  assert.equal(merged[1].method, "ocr");
  assert.equal(merged[1].status, "success");
  assert.equal(merged[1].confidence, 0.87);
});
