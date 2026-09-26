import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import type { TechnicalDescriptionPage } from "./types";

const page = (pageNumber: number, text: string, annotations?: TechnicalDescriptionPage["annotations"]): TechnicalDescriptionPage =>
  ({ pageNumber, text, annotations, method: "text", confidence: 0.98 });
const header = "Kapittel: 33 Brannslokking\nPostnr. NS-kode/Spesifikasjon Enhet Mengde Pris Sum\n";

test("retains prose, split attribute sentences and comments through three page breaks", () => {
  const result = extractTechnicalDescriptionFromPages([
    page(1, `${header}33.332.1 UE2.11112312\nSPRINKLER\nAntall stk 39\nLokalisering: Over systemhimling i\nSum:`),
    page(2, `${header}alle rom i første etasje.\nAndre krav:\na) Omfang og prisgrunnlag\nAlle festedeler skal medleveres.\nSum:`, [
      { id: "note-2", text: "Kontroller mot oppdatert tegning.", subtype: "Text", continuesPreviousPost: true }
    ]),
    page(3, `${header}Rosett leveres med samme overflate som sprinklerhodet.\nMontasje: Nedhengt\nSum:`),
    page(4, `${header}Leverandøren skal dokumentere kompatibiliteten.\n33.332.2 UC1.3121151\nSTENGEVENTIL\nAntall stk 1\nDimensjon: DN25\nSum:`)
  ]);
  const first = result.materialLines.find(line => line.postNumber === "33.332.1")!;
  assert.deepEqual(first.sourcePages, [1, 2, 3, 4]);
  assert.equal(first.attributes.lokalisering, "Over systemhimling i alle rom i første etasje.");
  assert.match(first.sourceText, /Alle festedeler skal medleveres/);
  assert.match(first.technicalSpecification!, /Rosett leveres/);
  assert.match(first.technicalSpecification!, /dokumentere kompatibiliteten/);
  assert.equal(first.attributes["pdf-kommentar"], "Kontroller mot oppdatert tegning.");
  assert.doesNotMatch(first.sourceText, /STENGEVENTIL|DN25/);
  assert.doesNotMatch(result.materialLines[1].sourceText, /Rosett|festedeler/);
});

test("a repeated post number on the next page extends the same post and supplies its quantity", () => {
  const { materialLines } = extractTechnicalDescriptionFromPages([
    page(1, `${header}33.332.1 UE2.11112312\nSPRINKLER\nMateriale: Messing\nSum:`),
    page(2, `${header}33.332.1\nAntall stk 12\nAndre krav:\nRosetter skal inngå.\n33.332.2 UC1.3121151\nSTENGEVENTIL\nAntall stk 1\nSum:`)
  ]);
  assert.deepEqual(materialLines.map(line => line.postNumber), ["33.332.1", "33.332.2"]);
  assert.equal(materialLines[0].quantity, 12);
  assert.equal(materialLines[0].attributes.materiale, "Messing");
  assert.match(materialLines[0].sourceText, /Rosetter skal inngå/);
  assert.equal(materialLines[0].reviewFlags.includes("missing-quantity"), false);
});

test("keeps unquantified leaf posts but uses a parent only as the children's specification", () => {
  const { materialLines } = extractTechnicalDescriptionFromPages([
    page(1, `${header}33.332.1 UB1.1194300932A\nINNENDØRS VANNLEDNING\nMateriale: Stål\n33.332.1.1 DN25\nLengde m 10\n33.332.2 UE2.11112312\nSPRINKLER\nMateriale: Messing\nSum:`, [
      { id: "parent", postNumber: "33.332.1", text: "Alle rørdeler skal inngå.", subtype: "Text" }
    ])
  ]);
  assert.deepEqual(materialLines.map(line => line.postNumber), ["33.332.1.1", "33.332.2"]);
  assert.equal(materialLines[0].attributes["pdf-kommentar"], "Alle rørdeler skal inngå.");
  assert.equal(materialLines[1].quantity, undefined);
  assert.equal(materialLines[1].reviewFlags.includes("missing-quantity"), true);
});

test("does not append unrelated chapters or bridge an unread page", () => {
  for (const next of [
    page(2, "Kapittel: 34 Trykkluft\nPostnr. NS-kode Mengde Sum\nMateriale: Plast\nSum:"),
    page(3, `${header}Materiale: Plast\nSum:`)
  ]) {
    const result = extractTechnicalDescriptionFromPages([
      page(1, `${header}33.332.1 UE2.11112312\nSPRINKLER\nAntall stk 1\nMateriale: Messing\nSum:`), next
    ]);
    assert.equal(result.materialLines[0].attributes.materiale, "Messing");
    assert.doesNotMatch(result.materialLines[0].sourceText, /Plast/);
  }
});

test("keeps continuation prose when the PDF serializes its table header at the bottom", () => {
  const { materialLines } = extractTechnicalDescriptionFromPages([
    page(1, `${header}33.332.1 UE2.11112312\nSPRINKLER\nAntall stk 12\nAndre krav:\nAlle festemidler inkluderes.\nSum:`),
    page(2, "Rosetter skal leveres i messing.\nMontasje: Over himling\nPostnr: NS 3420 kode/Spesifikasjon\nProsjekt: Test Side 33-2\nKapittel: 33 Brannslokking")
  ]);
  assert.match(materialLines[0].sourceText, /Rosetter skal leveres i messing/);
  assert.equal(materialLines[0].attributes.montasje, "Over himling");
  assert.doesNotMatch(materialLines[0].sourceText, /Prosjekt:/);
});

test("retains a quantity whose unit OCR missed without guessing a unit", () => {
  const { materialLines } = extractTechnicalDescriptionFromPages([
    page(1, `${header}33.332.1 UB1.1194300932A\nINNENDØRS VANNLEDNING\nMateriale: Stål\n33.332.1.1 DN25\nLengde 126\nSum:`)
  ]);
  assert.equal(materialLines.length, 1);
  assert.equal(materialLines[0].quantity, 126);
  assert.equal(materialLines[0].unit, "?");
  assert.equal(materialLines[0].reviewFlags.includes("missing-unit"), true);
});

test("recovers a missing post and quantity only inside an exact neighbouring sequence", () => {
  const result = extractTechnicalDescriptionFromPages([
    page(1, `${header}30.332.10 UC1.9111118A\nSTENGEVENTIL\nAntall stk 1\nMateriale: Støpejern\nSum:`),
    page(2, `${header}22.06.2026\nUC1.3121151\nSTENGEVENTIL\nAntall stk\nMateriale: Messing\nSum:`),
    page(3, `${header}22.06.2026\n30.332.12 CD3.11674A\nDEMONTERING\nRund sum RS\nSum:`)
  ]);
  assert.deepEqual(result.materialLines.map(line => line.postNumber), ["30.332.10", "30.332.11", "30.332.12"]);
  assert.equal(result.materialLines[1].quantity, undefined);
  assert.equal(result.materialLines[1].reviewFlags.includes("inferred-post-number"), true);
  assert.doesNotMatch(result.materialLines[0].sourceText, /Messing/);
});

test("keeps a custom post until its RS quantity on the next page and normalizes OCR post separators", () => {
  const result = extractTechnicalDescriptionFromPages([
    page(1, `${header}30.332,11 UC1.3121151\nSTENGEVENTIL\nAntall stk 3\nMateriale: Messing\n30.332.13 OPPGRADERE KAPASITETSMÅLER\nLokalisering: Sprinklersentral\nSum:`),
    page(2, `${header}Strupeskiven oppgraderes.\nRund sum RS\n30.332.14 UE2,11112912\nSPRINKLER\nAntall stk 39\nSum:`)
  ]);
  assert.deepEqual(result.materialLines.map(line => line.postNumber), ["30.332.11", "30.332.13", "30.332.14"]);
  assert.equal(result.materialLines[1].unit, "RS");
  assert.equal(result.materialLines[1].quantity, 1);
  assert.match(result.materialLines[1].sourceText, /Strupeskiven oppgraderes/);
  assert.equal(result.materialLines[2].nsCode, "UE2.11112912");
});

test("a dated tender deadline followed by prose is not an unquantified material post", () => {
  const result = extractTechnicalDescriptionFromPages([
    page(1, "Sprinkleranlegg\n28.08.2026 Tilbudsfrist\nLokalisering: Oslo\nTilbudet sendes før fristen.")
  ]);
  assert.equal(result.materialLines.length, 0);
});

test("a named post beginning at the page bottom receives its RS scope from the next page", () => {
  const result = extractTechnicalDescriptionFromPages([
    page(1, `${header}30.332.26 RESERVESKAP\nRund sum RS\n30.332.27 Merking ventil (skilt):\nSum:`),
    page(2, `${header}Omfang er skilt for tre ventiler.\nRund sum RS\n30.332.28 MERKING AV TILKOMST\nRund sum RS\nSum:`)
  ]);
  assert.deepEqual(result.materialLines.map(line => line.postNumber), ["30.332.26", "30.332.27", "30.332.28"]);
  assert.equal(result.materialLines[1].unit, "RS");
  assert.match(result.materialLines[1].sourceText, /skilt for tre ventiler/);
  assert.doesNotMatch(result.materialLines[0].sourceText, /skilt for tre ventiler/);
});
