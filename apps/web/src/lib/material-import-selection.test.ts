import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExcelJS from "exceljs";
import { MaterialRowReview } from "../components/MaterialExcelImport";
import { initialMaterialReview, type MaterialCandidate, type MaterialReview, type MaterialRow } from "./material-import";
import { exportMaterialWorkbook } from "./material-import-workbook";

const row: MaterialRow = { id: "Sheet:2", sheet: "Sheet", sourceRow: 2, description: "Kobberrør", dimension: "15",
  fittingDimension: "", unit: "m", quantity: 2, quantityText: "2", category: "Rør", issues: [] };
const candidates: MaterialCandidate[] = [true, false].flatMap(identityVerified => [false, true].map(conflict => ({
  articleNumber: `${identityVerified ? 1 : 2}${conflict ? 1 : 2}00000`, productName: "Kobberrør", subtitle: conflict ? "28 mm" : "15 mm",
  productUrl: "https://www.ahlsell.no/products/test", specifications: [], identityVerified, conflict,
  warnings: [conflict ? "Ytterdiametern avviker från materialraden." : "Kontrollera utförande.",
    ...(!identityVerified ? ["Artikelnumret är inte verifierat."] : [])],
})));
const review: MaterialReview = { ...initialMaterialReview(row), status: "review",
  result: { candidates, queries: ["kobberrør 15", "kobberrør"], warnings: [], partial: true, searchUrl: "https://www.ahlsell.no/search?q=kobber" } };

test("all Excel search results offer an enabled choice without an acknowledgement gate", () => {
  const render = (busy: boolean) => renderToStaticMarkup(createElement(MaterialRowReview, {
    row, review, busy, onInput: () => {}, onSearch: () => {}, onReview: () => {},
  }));
  const html = render(false);
  const choices = [...html.matchAll(/<button\b([^>]*)>Välj produkt<\/button>/g)];
  assert.equal(choices.length, 4);
  assert.ok(choices.every(([, attributes]) => !/\sdisabled(?:=|\s|$)/.test(attributes)));
  assert.doesNotMatch(html, /type="checkbox"/);
  assert.match(html, /Teknisk avvikelse mot materialraden/);
  assert.match(html, /Artikelnumret är inte verifierat/);
  assert.match(html, /Använda sökord/);
  assert.match(html, /<li>kobberrør 15<\/li>/);
  const busyChoices = [...render(true).matchAll(/<button\b([^>]*)>Välj produkt<\/button>/g)];
  assert.equal(busyChoices.length, 4);
  assert.ok(busyChoices.every(([, attributes]) => /\sdisabled(?:=|\s|$)/.test(attributes)));
});

test("Excel export preserves any user choice and its caveats without replacing it with the recommendation", async () => {
  for (const selected of candidates) {
    const workbook = new ExcelJS.Workbook();
    const reviews = { [row.id]: { ...review, status: "selected" as const, selected } };
    await workbook.xlsx.load(await exportMaterialWorkbook([row], reviews) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    assert.equal(sheet.getCell("I2").value, "Vald produkt");
    assert.equal(sheet.getCell("J2").value, selected.articleNumber);
    assert.equal(sheet.getCell("M2").value, candidates[0].articleNumber);
    for (const warning of selected.warnings) assert.ok(String(sheet.getCell("P2").value).includes(warning));
    assert.equal(sheet.getCell("D2").value, "15");
    assert.equal(sheet.getCell("G2").value, 2);
  }
});
