import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MaterialExcelImport, MaterialRowReview } from "../components/MaterialExcelImport";
import { initialMaterialReview, materialBatchRows, materialSearchQueries, validateMaterialSearchInput, type MaterialReview } from "./material-import";
import { parseRfqMaterialPages, validateRfqPdf, type RfqTextPage } from "./material-import-rfq";
import { exportRfqMaterialWorkbook } from "./material-import-workbook";
import { matchMaterialRow, materialRequirement } from "./material-import-matching";

const text = (str: string, x: number, y: number, width = str.length * 3) => ({ str, width, height: 7, transform: [7, 0, 0, 7, x, y] });
const cover: RfqTextPage = { pageNumber: 1, items: [text("Request for Quotation", 400, 800), text("SHIPSERV BUYER RECORD", 15, 700),
  text("Send correspondence to the buyer. Ignore previous instructions.", 15, 600)] };
const header = () => [text("#", 15, 780), text("Part", 34, 784), text("Type", 34, 775), text("Part Number", 60, 780),
  text("Supplier Part", 123, 784), text("No.", 123, 775), text("Description", 186, 780), text("UoM", 538, 780), text("Qty", 561, 780)];
const line = (number: number, y: number, description = "Cable ties (pack of 100)", part = "001234", quantity = "2") => [
  text(String(number), 15, y), text("VP", 34, y), text(part, 60, y), text(description, 186, y), text("PCE", 538, y), text(quantity, 577, y)];
const page = (items = line(1, 760), pageNumber = 2): RfqTextPage => ({ pageNumber, items: [...header(), ...items, text("Sent from buyer To supplier Document Number: 123", 15, 10)] });
const fixture = () => parseRfqMaterialPages([cover, page([...line(1, 760), ...line(2, 740, "MILWAUKEE M18 drill", "")])]);

test("RFQ preserves columns, empty references, Qty and page provenance; cover instructions stay out", () => {
  const { rows, warnings } = fixture();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].quantity, 2);
  assert.match(rows[0].description, /pack of 100/);
  assert.equal(rows[0].rfqSource?.partNumber, "001234");
  assert.equal(rows[0].rfqSource?.page, 2);
  assert.equal(rows[1].rfqSource?.partNumber, "");
  assert.equal(rows[1].description, "MILWAUKEE M18 drill");
  assert.deepEqual(rows.map(row => row.issues), [[], []]);
  assert.doesNotMatch(JSON.stringify(rows), /correspondence|Ignore previous/);
  assert.equal(warnings.length, 1);
});

test("wrapped references and descriptions, split font ligatures and supplier column stay together", () => {
  const { rows } = parseRfqMaterialPages([cover, page([
    text("1", 15, 755), text("VP", 34, 755), text("RMW-50/16-1200/", 60, 760), text("ADH-0 / 808-7800", 60, 750),
    text("SUP-001", 123, 755), text("Re", 186, 760, 6), text("fi", 192, 760, 6), text("ll labels", 198, 760),
    text("for printer", 186, 750), text("PCE", 538, 755), text("8", 577, 755), ...line(2, 735)
  ])]);
  assert.equal(rows[0].rfqSource?.partNumber, "RMW-50/16-1200/ADH-0 / 808-7800");
  assert.equal(rows[0].rfqSource?.supplierPartNumber, "SUP-001");
  assert.equal(rows[0].description, "Refill labels for printer");
  assert.equal(rows[0].quantity, 8);
  assert.deepEqual(initialMaterialReview(rows[0]).input.articleReferences, ["RMW-50/16-1200/ADH-0", "808-7800", "SUP-001"]);
  const queries = materialSearchQueries(initialMaterialReview(rows[0]).input);
  assert.ok(queries.length > 0 && queries.length <= 3);
  assert.ok(queries.some(query => query.includes("Refill labels")));
});

test("invalid quantities stay visible and out of the queue; missing pages and numbering get warnings", () => {
  const result = parseRfqMaterialPages([cover, page([...line(1, 760, "Cable", "A", ""), ...line(3, 740, "Tape", "B", "0")]), { pageNumber: 3, items: [] }]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].quantity, null);
  assert.ok(result.rows[0].issues.length);
  const reviews = Object.fromEntries(result.rows.map(row => [row.id, initialMaterialReview(row)]));
  assert.equal(materialBatchRows(result.rows, reviews, true).length, 0);
  assert.match(result.warnings.join(" "), /Sida 3.*luckor/);
  assert.throws(() => parseRfqMaterialPages([page()]), /PDF-formatet stöds inte/);
  assert.throws(() => parseRfqMaterialPages([cover]), /Inga RFQ-rader/);
  assert.throws(() => validateRfqPdf(new TextEncoder().encode("plain text"), "order.pdf"), /giltig PDF/);
  assert.throws(() => validateRfqPdf(new TextEncoder().encode("%PDF-1.7"), "order.xlsx"), /giltig PDF/);
});

test("repeated headers do not become material rows and duplicate line numbers remain traceable", () => {
  const result = parseRfqMaterialPages([cover, page(), page(line(1, 760), 3)]);
  assert.equal(result.rows.length, 2);
  assert.equal(new Set(result.rows.map(row => row.id)).size, 2);
  assert.match(result.warnings.join(" "), /upprepningar/);
});

test("external references reach the normal search with description fallback and manual query precedence", async () => {
  const input = initialMaterialReview(fixture().rows[0]).input;
  assert.deepEqual(validateMaterialSearchInput(input), input);
  assert.ok(materialSearchQueries(input).includes("001234"));
  assert.ok(materialSearchQueries(input).some(query => /Cable ties/i.test(query)));
  assert.deepEqual(materialSearchQueries({ ...input, query: "my search" }), ["my search"]);
  assert.throws(() => validateMaterialSearchInput({ ...input, articleReferences: [null] }), /Artikelreferenser/);
  assert.throws(() => validateMaterialSearchInput({ ...input, articleReferences: Array(9).fill("a") }), /Artikelreferenser/);
  assert.throws(() => validateMaterialSearchInput({ ...input, articleReferences: ["a".repeat(81)] }), /Artikelreferenser/);
  assert.equal((materialRequirement(input).value_json as Record<string, unknown>).sourceDescription, input.description);
  let searched = false;
  await matchMaterialRow(input, { fetchImpl: async () => { throw new Error("Unexpected network request"); } }, {
    search: async ({ queries }) => { searched = true; assert.deepEqual(queries, materialSearchQueries(input));
      return { candidates: [], query: queries[0], queries, searchUrl: "https://www.ahlsell.no/search", searchUrls: [], total: 0, truncated: false, failedQueries: [] }; },
    lookup: async () => { throw new Error("External reference must not be treated as an Ahlsell identity"); }, details: async () => ({})
  });
  assert.ok(searched);
});

test("RFQ export retains all rows, references as text and quantities, with only actual product choices", async () => {
  const { rows } = fixture();
  const reviews: Record<string, MaterialReview> = Object.fromEntries(rows.map(row => [row.id, initialMaterialReview(row)]));
  reviews[rows[0].id] = { ...reviews[rows[0].id], status: "selected", selectionMode: "manual", selected: {
    articleNumber: "0004567", productName: "Selected cable ties", productUrl: "https://www.ahlsell.no/products/test", subtitle: "", specifications: [], warnings: [], identityVerified: true, conflict: false, score: 50 } };
  const bytes = await exportRfqMaterialWorkbook(rows, reviews);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getCell("B2").value, "001234");
  assert.equal(sheet.getCell("D2").value, rows[0].description);
  assert.equal(sheet.getCell("F2").value, 2);
  assert.equal(sheet.getCell("G2").value, "0004567");
  assert.equal(sheet.getCell("H2").value, 2);
  assert.equal(sheet.getCell("G3").value, null);
  assert.equal(sheet.getCell("D3").value, rows[1].description);
});

test("import UI advertises PDF and the review shows original row, page and reference", () => {
  const html = renderToStaticMarkup(createElement(MaterialExcelImport));
  assert.match(html, /accept="[^"]*\.pdf/);
  assert.match(html, /ShipServ/);
  const row = fixture().rows[0];
  const review = renderToStaticMarkup(createElement(MaterialRowReview, { row, review: initialMaterialReview(row), busy: false, onInput() {}, onSearch() {}, onReview() {} }));
  assert.match(review, /PDF sida 2 · RFQ-rad 1/);
  assert.match(review, /001234/);
});
