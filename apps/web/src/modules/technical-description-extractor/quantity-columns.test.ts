import assert from "node:assert/strict";
import test from "node:test";
import { findTableQuantity, normalizedPageLines, parseStructuredPostStart } from "./document-parser";
import { layoutTextFromPdfItems, layoutTextFromOcrBlocks, shouldPreferPdfLayoutText } from "./pdf-layout";
import { extractTechnicalDescriptionFromPages } from "./extractor";

const item = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [10, 0, 0, 10, x, y], width });
const header = [item("Postnr.", 40, 700), item("Beskrivelse", 100, 700), item("Enh.", 360, 700),
  item("Mengde", 400, 700), item("Pris", 470, 700), item("Sum", 540, 700)];

test("price and sum cells never become trailing quantity zeroes", () => {
  for (const [amount, expected] of [["2", 2], ["0", 0], ["1 234,50", 1234.5], ["1 000 000", 1000000]] as const) {
    const text = `Antall\tstk\t${amount}\t000\t000`;
    assert.equal(findTableQuantity(normalizedPageLines(text))?.quantity, expected);
    assert.equal(findTableQuantity([text])?.quantity, expected);
    assert.equal(parseStructuredPostStart([`33.332.1 Rørdel\tstk\t${amount}\t000\t000`], 0)?.quantity?.quantity, expected);
  }
  assert.equal(findTableQuantity(normalizedPageLines("Antall\tstk\t\t0,00\t0,00")), undefined);
});

test("digital and OCR layouts preserve blank amount cells ahead of zero prices", () => {
  for (const amount of ["2", "", "1 234,50", "0"]) {
    const items = [...header, item("33.332.1", 40, 670), item("UB1.341711434100034 Rørdel", 100, 670),
      item("Antall", 100, 645), item("stk", 360, 645), ...(amount ? [item(amount, 405, 645, 40)] : []),
      item("000", 480, 645), item("000", 545, 645)];
    const words = items.map(i => ({ text: i.str, bbox: { x0: i.transform[4], x1: i.transform[4] + i.width,
      y0: 800 - i.transform[5], y1: 810 - i.transform[5] } }));
    for (const text of [layoutTextFromPdfItems(items), layoutTextFromOcrBlocks([{ paragraphs: [{ lines: [{ words }] }] }])]) {
      assert.equal(shouldPreferPdfLayoutText("Postnr. Mengde Pris Sum", text), true);
      const result = extractTechnicalDescriptionFromPages([{ pageNumber: 1, text, method: "text", confidence: .98 }]);
      const row = result.materialLines.find(row => row.postNumber === "33.332.1");
      assert.ok(row);
      assert.equal(row.quantity, amount === "" ? undefined : Number(amount.replace(" ", "").replace(",", ".")));
      assert.doesNotMatch(row.quantityText ?? "", /000 000/);
    }
  }
});

test("ordinary decimal prices keep the existing stream without a structured post row", () => {
  const text = "Prosjekt: Teknisk beskrivelse for rørinstallasjoner\nPostnr.\tBeskrivelse\tEnh.\tMengde\tPris\tSum\nRørdel\nAntall\tstk\t2\t0,00\t0,00";
  assert.equal(shouldPreferPdfLayoutText(text.replaceAll("\t", " "), text), false);
  assert.equal(shouldPreferPdfLayoutText(text.replaceAll("\t", " "), text.replace("stk\t2", "stk\t")), true);
});

test("split square and cubic metre exponents belong to the unit, never the quantity", () => {
  for (const [label, units, expectedUnit] of [
    ["Areal", ["m2", "m²", "m 2", "m\u00a02", "m\u202f2"], "m2"],
    ["Volum", ["m3", "m³", "m 3"], "m3"],
  ] as const) {
    for (const unit of units) {
      for (const text of [`${label} ${unit} 2300,00 0,00 0,00`, `${label}\t${unit}\t2300,00\t000\t000`]) {
        for (const lines of [[text], normalizedPageLines(text)]) {
          const result = findTableQuantity(lines);
          assert.equal(result?.quantity, 2300, text);
          assert.equal(result?.unit, expectedUnit, text);
        }
      }
      assert.equal(findTableQuantity(normalizedPageLines(`${label}\t${unit}\t\t0,00\t0,00`)), undefined);
    }
  }
  const length = findTableQuantity(["Lengde m 2 0,00 0,00"]);
  assert.equal(length?.quantity, 2);
  assert.equal(length?.unit, "m");
});

test("physical split area unit cells preserve a blank or zero quantity before price columns", () => {
  for (const amount of ["2300,00", "", "0"]) {
    const items = [...header, item("22.25.2", 40, 670), item("TH2.121 HALVHARDT BELEGG PÅ GULV", 100, 670),
      item("Areal", 100, 645), item("m", 360, 645), item("2", 370, 647),
      ...(amount ? [item(amount, 405, 645, 40)] : []), item("0,00", 480, 645), item("0,00", 545, 645)];
    const words = items.map(i => ({ text: i.str, bbox: { x0: i.transform[4], x1: i.transform[4] + i.width,
      y0: 800 - i.transform[5], y1: 810 - i.transform[5] } }));
    for (const text of [layoutTextFromPdfItems(items), layoutTextFromOcrBlocks([{ paragraphs: [{ lines: [{ words }] }] }])]) {
      const result = extractTechnicalDescriptionFromPages([{ pageNumber: 1, text, method: "text", confidence: .98 }]);
      const row = result.materialLines.find(row => row.postNumber === "22.25.2");
      assert.ok(row);
      assert.equal(row.quantity, amount === "" ? undefined : Number(amount.replace(",", ".")));
      assert.match(text, /Areal\tm²\t/);
      if (amount) assert.equal(row.unit, "m2");
    }
  }
});
