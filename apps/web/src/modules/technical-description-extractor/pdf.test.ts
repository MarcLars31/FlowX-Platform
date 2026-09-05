import assert from "node:assert/strict";
import test from "node:test";
import { pagesRequiringOcr } from "./pdf";
import type { TechnicalDescriptionPage } from "./types";

test("renders only short text pages for OCR in mixed technical PDFs", () => {
  const pages: TechnicalDescriptionPage[] = [
    textPage(1, "A".repeat(125)),
    textPage(2, "B".repeat(1_573)),
    textPage(8, "Short cover"),
    textPage(24, "D".repeat(4_137))
  ];

  assert.deepEqual(pagesRequiringOcr(pages), [8]);
});

function textPage(pageNumber: number, text: string): TechnicalDescriptionPage {
  return {
    pageNumber,
    text,
    method: "text",
    confidence: 0.98,
    status: "success"
  };
}
