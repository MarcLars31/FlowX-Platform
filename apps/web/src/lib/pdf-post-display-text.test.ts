import assert from "node:assert/strict";
import test from "node:test";
import { pdfPostDisplayText } from "./pdf-post-display-text";

test("area rows keep the quantity and omit prices for joined and split square metre units", () => {
  const source = "Areal m 2 2300,00 0,00 0,00\n\n22.25.2 TH2.121\nHALVHARDT BELEGG PÅ GULV\nAreal m2 2300,00 0,00 0,00";
  assert.equal(pdfPostDisplayText(source),
    "Areal m² 2300,00\n\n22.25.2 TH2.121\nHALVHARDT BELEGG PÅ GULV\nAreal m² 2300,00");
  for (const unit of ["m2", "m²", "m 2", "m\u00a02", "m\u202f2"]) {
    for (const quantity of ["2300,00", "0,00", "2 300,00", "2\u202f300,00"]) {
      assert.equal(pdfPostDisplayText(`Areal ${unit} ${quantity} 15,00 34500,00`), `Areal m² ${quantity}`);
      assert.equal(pdfPostDisplayText(`Areal\t${unit}\t${quantity}\t000\t000`), `Areal\tm² ${quantity}`);
    }
    assert.equal(pdfPostDisplayText(`Areal\t${unit}\t\t0,00\t0,00`), "Areal\tm²");
  }
});

test("cubic metres are recognized without turning a length of two metres into an area", () => {
  for (const unit of ["m3", "m³", "m 3"]) {
    assert.equal(pdfPostDisplayText(`Volum ${unit} 2300,00 0,00 0,00`), "Volum m³ 2300,00");
  }
  assert.equal(pdfPostDisplayText("Lengde m 2 0,00 0,00"), "Lengde m 2");
  const prose = "Det legges m 2 fra veggen.\nAreal m 2 er oppgitt i tegningen.\nPris og sum: 0,00 0,00";
  assert.equal(pdfPostDisplayText(prose), prose);
});
