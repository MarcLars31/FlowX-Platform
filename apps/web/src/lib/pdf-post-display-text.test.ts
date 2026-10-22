import assert from "node:assert/strict";
import test from "node:test";
import { pdfPostDisplayText } from "./pdf-post-display-text";

test("display preserves unclassified numeric cells and only normalizes measurement units", () => {
  for (const unit of ["m2", "m²", "m 2", "m\u00a02", "m\u202f2"]) {
    for (const quantity of ["2300,00", "0,00", "2 300,00", "2\u202f300,00"]) {
      assert.equal(pdfPostDisplayText(`Areal ${unit} ${quantity} 15,00 34500,00`), `Areal m² ${quantity} 15,00 34500,00`);
      assert.equal(pdfPostDisplayText(`Areal\t${unit}\t${quantity}\t000\t000`), `Areal\tm²\t${quantity}\t000\t000`);
    }
    assert.equal(pdfPostDisplayText(`Areal\t${unit}\t\t0,00\t0,00`), "Areal\tm²\t\t0,00\t0,00");
  }
});

test("display never guesses price cells from number formatting or technical prose", () => {
  for (const source of ["Lengde m\t100,00\t0,5 bar\t68 °C", "Lengde m 2 0,00 0,00", "Pris og sum: 0,00 0,00", "Prisen inkluderer oppfyllelse av krav i post 30.1 og 30.2."]) {
    assert.equal(pdfPostDisplayText(source), source);
  }
  assert.equal(pdfPostDisplayText("Volum m 3 2300,00 0,00 0,00"), "Volum m³ 2300,00 0,00 0,00");
});
