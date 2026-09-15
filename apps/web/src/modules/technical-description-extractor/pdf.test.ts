import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { extractTechnicalDescriptionPages, pagesRequiringOcr } from "./pdf";
import { commentsFromPdfAnnotations } from "./pdf-annotations";

test("anchors note icons to wrapped product rows using the lower edge instead of the previous row", () => {
  const item = (str: string, y: number) => ({ str, transform: [1, 0, 0, 1, 54, y] });
  const comments = commentsFromPdfAnnotations([
    { id: "first", subtype: "Text", contentsObj: { str: "1001012" }, rect: [444, 689, 468, 713] },
    { id: "second", subtype: "Text", contentsObj: { str: "1118631" }, rect: [444, 661, 468, 685] },
    { id: "unplaced", subtype: "Text", contentsObj: { str: "Review" } }
  ], [item("0.33.332.3", 700), item("322.1.1", 689), item("0.33.332.3", 667), item("322.1.2", 656)]);
  assert.deepEqual(comments.map(comment => comment.postNumber), ["0.33.332.3322.1.1", "0.33.332.3322.1.2", undefined]);
});
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

test("reads digital text and comments without OCR while preserving vector-only pages for OCR", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const digital = pdf.addPage();
  digital.drawText("33.500.1 SPRINKLER\nAntall stk 39\nSprinkleranlegg: Vatanlegg\nK-faktor: 80\nTrykk: 12 bar\nBeskyttelse: Nei", { font, size: 11, x: 20, y: 700 });
  const comment = pdf.context.register(pdf.context.obj({
    Type: "Annot", Subtype: "Text", Rect: [20, 20, 40, 40],
    Contents: PDFString.of("Review proposed article 9257423")
  }));
  digital.node.set(PDFName.of("Annots"), pdf.context.obj([comment]));
  pdf.addPage().drawSvgPath("M 10 10 L 20 40 L 30 10 Z");

  const pages = await extractTechnicalDescriptionPages(await pdf.save());
  assert.equal(pages[0].method, "text");
  assert.match(pages[0].text, /Antall stk 39/);
  assert.equal(pages[0].annotations?.length, 1);
  assert.equal(pages[0].annotations?.[0].text, "Review proposed article 9257423");
  assert.doesNotMatch(pages[0].text, /9257423/);
  assert.deepEqual(pagesRequiringOcr(pages), [2]);
});

test("ignores duplicate popup contents and actions but preserves distinct comments with the same text", () => {
  const comments = commentsFromPdfAnnotations([
    { id: "1R", subtype: "Text", contentsObj: { str: " 9253636\r\nVerify \0" }, rect: [0, 0, 10, 10] },
    { id: "1R", subtype: "Text", contentsObj: { str: "duplicate" } },
    { id: "2R", subtype: "Popup", contentsObj: { str: "9253636" } },
    { id: "3R", subtype: "Link", contentsObj: { str: "run script" } },
    { id: "4R", subtype: "Text", contentsObj: { str: "9253636\nVerify" } }
  ]);
  assert.equal(comments.length, 2);
  assert.equal(comments[0].text, "9253636\nVerify");
  assert.equal(comments[1].text, comments[0].text);
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
