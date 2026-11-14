import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "./extractor";

test("keeps an OCR removal scope and its photo caption in one post across a dated page header", () => {
  const pages = [
    { pageNumber: 6, text: "30 VVS-installasjoner\n30.332.11 UC1.3121151\nINNENDØRS STENGEVENTIL\nAntall stk 3\nMedium: Sprinkler\nSum:" },
    { pageNumber: 7, text: [
      "Multiconsult", "22.06.2026", "Side 300", "30 VVS-installasjoner", "Postnr", "NS 3420 kode/Spesifikasjon", "Enh.", "Mengde", "Pris", "Sum",
      "30.332.12", // OCR reads the left column before the previous post's body.
      "Materiale: Messing", "Dimensjon, tilkoblinger: DN25", "Trykk: 12 bar", "Andre krav: Nei",
      "CD3.11674A", "DEMONTERING AV BYGNINGSDEL - RUND SUM", "Rund sum",
      "Bygningsdel: Installasjon for brannslokking", "Bygningsdel, spesifisert: Avløp for nedtapping og kapasitetstest demonteres.",
      "Dimensjon: DN50", "Sluttilstand for gjenværende bygningsdeler: Ny skal være dimensjon DN80.",
      "Andre krav:", "a) Omfang og prisgrunnlag", "RS", "Sum:"
    ].join("\n") },
    { pageNumber: 8, text: [
      "Multiconsult", "22.06.2026", "Side 301", "30 VVS-installasjoner", "Enh.", "Mengde", "Pris", "Sum",
      "Postnr NS 3420 kode/Spesifikasjon", "Avløp for", "nedtapping og", "kapasitetstest", "demonteres. Ny", "skal være", "dimensjon DN80", "Brutt avløp", "Sum:"
    ].join("\n") },
    { pageNumber: 9, text: "30 VVS-installasjoner\n30.332.13 UC1.3121151\nSTENGEVENTIL\nAntall stk 1\nDimensjon: DN100\nSum:" }
  ].map(page => ({ ...page, method: "ocr" as const, confidence: 0.91 }));
  const { materialLines } = extractTechnicalDescriptionFromPages(pages);
  assert.deepEqual(materialLines.map(line => line.postNumber), ["30.332.11", "30.332.12", "30.332.13"]);
  const valve = materialLines[0];
  const removal = materialLines[1];
  assert.equal(valve.attributes.materiale, "Messing");
  assert.equal(valve.attributes["dimensjon, tilkoblinger"], "DN25");
  assert.equal(removal.nsCode, "CD3.11674A");
  assert.equal(removal.description, "DEMONTERING AV BYGNINGSDEL - RUND SUM");
  assert.equal(removal.unit, "RS");
  assert.equal(removal.quantity, 1);
  assert.equal(removal.operation, "remove");
  assert.equal(removal.attributes.dimensjon, "DN50");
  assert.equal(removal.attributes.materiale, undefined);
  assert.equal(removal.attributes.trykk, undefined);
  assert.match(removal.sourceText, /FORTSETTELSE SIDE 8\nAvløp for/);
  assert.match(removal.sourceText, /dimensjon DN80/);
  assert.doesNotMatch(removal.sourceText, /22\.06\.2026|DN100/);
});

test("does not reassign ambiguous detached OCR numbers to another post's NS code", () => {
  const page = { pageNumber: 1, method: "ocr" as const, confidence: 0.91, text: [
    "30 VVS-installasjoner", "30.332.8", "30.332.9", "Materiale: Stål", "UC1.9111118A",
    "INNENDØRS STENGEVENTIL", "Rund sum RS", "Dimensjon: DN80", "Sum:"
  ].join("\n") };
  const result = extractTechnicalDescriptionFromPages([page]);
  const originalOrder = extractTechnicalDescriptionFromPages([{ ...page, method: "text" }]);
  const identities = (lines: typeof result.materialLines) => lines.map(line => ({ postNumber: line.postNumber, nsCode: line.nsCode, description: line.description }));
  assert.deepEqual(identities(result.materialLines), identities(originalOrder.materialLines));
});
