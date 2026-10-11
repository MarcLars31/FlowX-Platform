import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb } from "pdf-lib";
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

test("anchors notes to single-component wrapped parents and leading page continuations", () => {
  const item = (str: string, y: number) => ({ str, transform: [1, 0, 0, 1, 54, y] });
  const notes = commentsFromPdfAnnotations([
    { id: "continued", subtype: "Text", contentsObj: { str: "Continuation note" }, rect: [350, 730, 374, 754] },
    { id: "parent", subtype: "Text", contentsObj: { str: "Include all parts" }, rect: [350, 650, 374, 674] }
  ], [item("1403.33.332.", 700), item("10", 689), item("1403.33.332.", 600), item("10.1", 589)]);
  assert.equal(notes[0].continuesPreviousPost, true);
  assert.equal(notes[1].postNumber, "1403.33.332.10");
});

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

const testImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
const digitalHeader = "Ramboll Norge AS - 07.08.2026\nProsjekt: Eksempel skole og idrettshall\nKapittel: 33 Brannslokking\nPostnr. NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum";
const digitalPost = "33.500.1 UE2.11111132 SPRINKLER\nAntall stk 60\nSprinkleranlegg: Vatanlegg\nK-faktor: 80\nTrykk: PN10\nBeskyttelse: Nei";

test("requests OCR for a scanned body with over 80 characters of digital headers and footers", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(testImage);
  const hybrid = pdf.addPage([600, 800]);
  hybrid.drawText(digitalHeader, { font, size: 10, x: 20, y: 775, lineHeight: 15 });
  hybrid.drawImage(image, { x: 30, y: 100, width: 540, height: 510 });
  hybrid.drawText("Sum denne side: 0,00 - Ramboll Norge AS - Prosjekt: Eksempel skole og idrettshall", { font, size: 8, x: 20, y: 25 });
  const [page] = await extractTechnicalDescriptionPages(await pdf.save());
  assert.ok(page.text.length > 80);
  assert.equal(page.ocrReason, "image-body");
  assert.equal(page.status, "partial");
  assert.deepEqual(pagesRequiringOcr([page]), [1]);
});

test("keeps digital specifications, sparse digital pages and small logos on direct text extraction", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(testImage);
  const body = pdf.addPage([600, 800]);
  body.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
  body.drawText(digitalPost, { font, size: 10, x: 20, y: 600, lineHeight: 15 });
  const sparse = pdf.addPage([600, 800]);
  sparse.drawText(digitalPost, { font, size: 8, x: 20, y: 785, lineHeight: 10 });
  const logo = pdf.addPage([600, 800]);
  logo.drawText(digitalHeader, { font, size: 10, x: 20, y: 775, lineHeight: 15 });
  logo.drawImage(image, { x: 200, y: 400, width: 60, height: 60 });
  const pages = await extractTechnicalDescriptionPages(await pdf.save());
  assert.deepEqual(pagesRequiringOcr(pages), []);
  assert.ok(pages.every(page => page.status === "success" && !page.ocrReason));
});

test("detects a scanned body inside a transformed PDF form without losing page comments", async () => {
  const source = await PDFDocument.create();
  const sourcePage = source.addPage([300, 400]);
  sourcePage.drawImage(await source.embedPng(testImage), { x: 0, y: 0, width: 300, height: 400 });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([600, 800]);
  page.drawText(digitalHeader, { font, size: 10, x: 20, y: 775, lineHeight: 15 });
  const [embedded] = await pdf.embedPdf(await source.save());
  page.drawPage(embedded, { x: 50, y: 80, width: 500, height: 520 });
  page.node.set(PDFName.of("Annots"), pdf.context.obj([pdf.context.register(pdf.context.obj({
    Type: "Annot", Subtype: "Text", Rect: [20, 20, 40, 40], Contents: PDFString.of("Keep this comment")
  }))]));
  const [result] = await extractTechnicalDescriptionPages(await pdf.save());
  assert.equal(result.ocrReason, "image-body");
  assert.equal(result.annotations?.[0].text, "Keep this comment");
});

test("an accepted OCR body replaces header-only text and yields the actual post and quantity", async () => {
  const { mergeClientOcrPages } = await import("@/lib/technical-description-ocr-payload");
  const { extractTechnicalDescriptionFromPages } = await import("./extractor");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  page.drawText(digitalHeader, { font: await pdf.embedFont(StandardFonts.Helvetica), size: 10, x: 20, y: 775, lineHeight: 15 });
  page.drawImage(await pdf.embedPng(testImage), { x: 30, y: 100, width: 540, height: 510 });
  const before = await extractTechnicalDescriptionPages(await pdf.save());
  const merged = mergeClientOcrPages(before, [{ pageNumber: 1, text: digitalHeader + "\n" + digitalPost, confidence: 0.92 }]);
  assert.deepEqual(pagesRequiringOcr(merged), []);
  assert.equal(merged[0].method, "ocr");
  const result = extractTechnicalDescriptionFromPages(merged, { fileName: "hybrid.pdf" });
  assert.equal(result.materialLines.length, 1);
  assert.equal(result.materialLines[0].postNumber, "33.500.1");
  assert.equal(result.materialLines[0].quantity, 60);
});


test("finds hybrid image bodies on rotated pages", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(testImage);
  for (const angle of [90, 180, 270]) {
    const page = pdf.addPage([600, 800]);
    page.setRotation(degrees(angle));
    page.drawText(digitalHeader, { font, size: 10, x: 20, y: 775, lineHeight: 15 });
    page.drawImage(image, { x: 30, y: 100, width: 540, height: 510 });
  }
  assert.deepEqual(pagesRequiringOcr(await extractTechnicalDescriptionPages(await pdf.save())), [1, 2, 3]);
});

test("image inspection is skipped for readable bodies and failed inspection still requires OCR", async () => {
  const { nonTextBodyOcrReason } = await import("./pdf-ocr-detection");
  const { openPdfTextDocument, closePdfTextDocument } = await import("@/lib/pdf-runtime");
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  const document = await openPdfTextDocument(await pdf.save());
  try {
    const page = await document.getPage(1);
    let calls = 0;
    page.getOperatorList = async () => { calls += 1; throw new Error("Damaged image stream"); };
    assert.equal(await nonTextBodyOcrReason(page, [{ str: digitalPost, transform: [1, 0, 0, 1, 20, 400] }]), undefined);
    assert.equal(calls, 0);
    const reason = await nonTextBodyOcrReason(page, [{ str: digitalHeader, transform: [1, 0, 0, 1, 20, 770] }]);
    assert.equal(reason, "body-check-failed");
    assert.equal(calls, 1);
    assert.deepEqual(pagesRequiringOcr([{ ...textPage(1, digitalHeader), ocrReason: reason }]), [1]);
  } finally { await closePdfTextDocument(document); }
});

test("detects dense outlined letters but ignores a sparse vector illustration and table borders", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const count of [120, 3]) {
    const page = pdf.addPage([600, 800]);
    page.drawText(digitalHeader, { font, size: 10, x: 20, y: 775, lineHeight: 15 });
    for (let index = 0; index < count; index += 1) {
      page.drawSvgPath("M 0 0 L 3 -8 L 6 0 L 4 0 L 3 -4 L 2 0 Z", { x: 30 + (index % 30) * 8, y: 550 - Math.floor(index / 30) * 20, color: rgb(0, 0, 0) });
    }
    page.drawLine({ start: { x: 20, y: 100 }, end: { x: 20, y: 600 } });
    page.drawLine({ start: { x: 20, y: 100 }, end: { x: 550, y: 100 } });
  }
  const pages = await extractTechnicalDescriptionPages(await pdf.save());
  assert.deepEqual(pagesRequiringOcr(pages), [1]);
  assert.equal(pages[0].ocrReason, "vector-body");
});
