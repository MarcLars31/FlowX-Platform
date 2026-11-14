import assert from "node:assert/strict";
import test from "node:test";
import {
  detectProductDocumentLanguage,
  mergeExtractorPageDetails,
  prepareProductDocumentPages
} from "./product-document-page-mapping";

test("maps text, OCR and isolated page errors to the staging contract", () => {
  const pages = prepareProductDocumentPages(
    [
      {
        pageNumber: 1,
        text: "Readable product table",
        method: "text",
        confidence: 0.98,
        status: "success"
      },
      {
        pageNumber: 2,
        text: "",
        method: "ocr",
        confidence: 0,
        status: "failed",
        errorCode: "ocr_failed",
        errorMessage: "OCR returned no text"
      }
    ],
    "en"
  );

  assert.deepEqual(pages, [
    {
      page_number: 1,
      status: "success",
      extraction_method: "text",
      language_code: "en",
      extracted_text: "Readable product table",
      extracted_tables: [],
      source_coordinates: []
    },
    {
      page_number: 2,
      status: "failed",
      extraction_method: "ocr",
      language_code: "en",
      extracted_text: "",
      extracted_tables: [],
      source_coordinates: [],
      error_code: "ocr_failed",
      error_message: "OCR returned no text"
    }
  ]);
});

test("drops invalid page numbers before database staging", () => {
  const pages = prepareProductDocumentPages([
    { pageNumber: 0, text: "invalid", method: "text", confidence: 1 },
    { pageNumber: 3, text: "valid", method: "text", confidence: 1 }
  ]);

  assert.deepEqual(pages.map((page) => page.page_number), [3]);
});

test("detects a supported document language from extracted page text", () => {
  assert.equal(
    detectProductDocumentLanguage([
      { text: "Technical product data and maximum pressure approval" }
    ]),
    "en"
  );
  assert.equal(detectProductDocumentLanguage([{ text: "1234 DN 50" }]), null);
});

test("preserves extractor table rows, headers and page coordinates", () => {
  const base = prepareProductDocumentPages([
    { pageNumber: 2, text: "SIN K-factor", method: "text", confidence: 0.98 }
  ]);
  const merged = mergeExtractorPageDetails(
    base,
    [
      {
        pageNumber: 2,
        tables: [{ headers: ["SIN", "K"], rows: [["V2703", "5.6"]] }],
        sourceCoordinates: [{ x: 10, y: 20, width: 300, height: 80 }]
      }
    ],
    "en"
  );

  assert.equal(merged[0]?.extraction_method, "mixed");
  assert.equal(merged[0]?.language_code, "en");
  assert.deepEqual(merged[0]?.extracted_tables, [
    { headers: ["SIN", "K"], rows: [["V2703", "5.6"]] }
  ]);
  assert.equal(merged[0]?.source_coordinates.length, 1);
});
