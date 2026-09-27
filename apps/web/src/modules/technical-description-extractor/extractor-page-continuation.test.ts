import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import type { TechnicalDescriptionPage } from "./types";

const page = (pageNumber: number, text: string, annotations?: TechnicalDescriptionPage["annotations"]): TechnicalDescriptionPage =>
  ({ pageNumber, text, annotations, method: "text", confidence: 0.98 });
const header = "Kapittel: 33 Brannslokking\nPostnr. NS-kode/Spesifikasjon Enhet Mengde Pris Sum\n";

test("a four-page WZA information post retains environmental classes and every continuation", () => {
  const footer = "\n20.03.2026\nSum denne side:\nAkkumulert 1401 HM:\nProsjekt: Eksempel Side 1401-8\n1401 HM - 40.411 Systemer for kabelføring\nPostnr: NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum\n0,00";
  const result = extractTechnicalDescriptionFromPages([
    page(8, `1401.40.411.\n1\nWZA\nInstallasjoner for elkraft og ekom\nAndre krav:\na) Omfang og prisgrunnlag\nAlle ytelser skal inngå.\nb) Materialer\nYtre påvirkninger i henhold til NEK 400 Tabell 51A:\nAE4 - Lett støv${footer}`),
    page(9, `S40:\nTilstedeværelse av faste fremmedlegemer:\nAE4 - Lett støv, IP5X\nForurensende stoffer: AF3 - Kortvarig.\nGarderober:${footer}`, [{ id: "middle", subtype: "Text", continuesPreviousPost: true, text: "Kommentar på mellansidan." }]),
    page(10, `AE2 - Små gjenstander\nAlt festemateriell skal beholde sin integritet under brann.\nc) Utførelse\nAlle kabelstiger skal påsettes endelokk.${footer}`),
    page(11, `Kabelstiger skal avsluttes 200 mm fra utsparinger.\nI FDV-dokumentasjon skal produkter markeres.${footer}`),
    page(12, `1401.40.411.\n2\nWL2.125\nGRENSTAV\nAntall stk 10\nMateriale: Stål${footer}`)
  ]);
  assert.equal(result.materialLines.length, 2);
  const information = result.materialLines[0];
  assert.equal(information.postNumber, "1401.40.411.1");
  assert.equal(information.nsCode, "WZA");
  assert.deepEqual(information.sourcePages, [8, 9, 10, 11]);
  assert.equal(information.quantity, undefined);
  assert.ok(information.reviewFlags.includes("project-information"));
  assert.equal(information.attributes["pdf-kommentar"], "Kommentar på mellansidan.");
  assert.match(information.sourceText, /IP5X[\s\S]*integritet under brann[\s\S]*FDV-dokumentasjon/);
  assert.doesNotMatch(information.sourceText, /20\.03\.2026|Sum denne side|Akkumulert|GRENSTAV/);
  assert.equal(information.technicalSpecification, information.sourceText);
  assert.equal(result.materialLines[1].quantity, 10);
});

test("a genuine unnumbered NS row still stops a NEK specification continuation", () => {
  const result = extractTechnicalDescriptionFromPages([
    page(1, `${header}1401.40.411.1 WZA\nInstallasjoner for elkraft\nAndre krav:\nNEK 400 Tabell 51A gjelder.`),
    page(2, `${header}WC2.511115\nVEGGKANAL\nLengde m 25\nMateriale: Aluminium`)
  ]);
  const information = result.materialLines.find(line => line.postNumber === "1401.40.411.1")!;
  assert.deepEqual(information.sourcePages, [1]);
  assert.doesNotMatch(information.sourceText, /VEGGKANAL|Aluminium/);
});

test("a project title split from the page number cannot extend the previous material field", () => {
  const title = "K2 3395 HOK. Ombygging Kleppestø";
  const { materialLines } = extractTechnicalDescriptionFromPages([
    page(4, `Multiconsult\n22.06.2026\n${title} Side 297\n${header}30.332.10 UC1.9111118A\nINNENDØRS STENGEVENTIL\nAntall stk 1\nMateriale: Støpejern\nSum: 0`),
    page(5, `Multiconsult\n22.06.2026\n${title}\nSide 298\n${header}Skjøt: Rilleskjøt\nLokalisering: Sprinklersentral i "Nybygget", plan 1.\nTrykk: 12 bar\nDimensjon, tilkoblinger: DN100\nAndre krav:\na) Omfang og prisgrunnlag\nOmfatter også tilpassing av eksisterende DN100 rør.\nSum:`, [
      { id: "continued-note", subtype: "Text", continuesPreviousPost: true, text: "Kontroller serviceventilen." }
    ])
  ]);
  assert.equal(materialLines.length, 1);
  const line = materialLines[0];
  assert.equal(line.attributes.materiale, "Støpejern");
  assert.equal(line.attributes.skjøt, "Rilleskjøt");
  assert.equal(line.attributes.trykk, "12 bar");
  assert.equal(line.attributes["dimensjon, tilkoblinger"], "DN100");
  assert.equal(line.attributes["pdf-kommentar"], "Kontroller serviceventilen.");
  assert.deepEqual(line.sourcePages, [4, 5]);
  assert.match(line.sourceText, /a\) Omfang og prisgrunnlag\nOmfatter også tilpassing/);
  assert.doesNotMatch(line.sourceText, /K2 3395|Side 298|Multiconsult/);
});

test("a genuine project name inside a requirement remains part of the specification", () => {
  const title = "K2 3395 HOK. Ombygging Kleppestø";
  const { materialLines } = extractTechnicalDescriptionFromPages([
    page(1, `${title} Side 297\n${header}30.332.10 UC1.9111118A\nINNENDØRS STENGEVENTIL\nAntall stk 1\nMateriale: Støpejern\nSum:`),
    page(2, `${title}\nSide 298\n${header}Lokalisering: Prosjekt\n${title}\nSkjøt: Rilleskjøt\nSum:`)
  ]);
  assert.equal(materialLines[0].attributes.lokalisering, `Prosjekt ${title}`);
});

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

test("keeps unquantified parents as information and as the children's specification", () => {
  const { materialLines } = extractTechnicalDescriptionFromPages([
    page(1, `${header}33.332.1 UB1.1194300932A\nINNENDØRS VANNLEDNING\nMateriale: Stål\n33.332.1.1 DN25\nLengde m 10\n33.332.2 UE2.11112312\nSPRINKLER\nMateriale: Messing\nSum:`, [
      { id: "parent", postNumber: "33.332.1", text: "Alle rørdeler skal inngå.", subtype: "Text" }
    ])
  ]);
  assert.deepEqual(materialLines.map(line => line.postNumber), ["33.332.1", "33.332.1.1", "33.332.2"]);
  assert.equal(materialLines[0].reviewFlags.includes("project-information"), true);
  assert.equal(materialLines[1].attributes["pdf-kommentar"], "Alle rørdeler skal inngå.");
  assert.equal(materialLines[2].quantity, undefined);
  assert.equal(materialLines[2].reviewFlags.includes("missing-quantity"), true);
});

test("keeps the opening Sprinkler2 fragment as information without borrowing the next post's RS", () => {
  const fragment = 'Lokalisering: Tilkobling til eksisterende anlegg, DN80, i\n"Gamlebygget" plan 1. Se tilbudstegning.\nDimensjon hovedledning: DN80\nDimensjon avgreningsledning: DN80\nTrykk: 12 bar\nAndre krav: Nei';
  const { materialLines } = extractTechnicalDescriptionFromPages([page(1,
    `Multiconsult 22.06.2026\nK2 3395 HOK. Ombygging Kleppestø Side 294\n30 VVS-installasjoner\nPostnr NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum\n${fragment}\n30.332.5 UB3.8114343\nTILKOBLING AV VANNLEDNING VED ANBORING\nRund sum RS\nLokalisering: Sprinkler\n30.332.6 UB1.33114699900A\nSPRINKLERSLANGE\nAntall stk 132\nSum:`,
    [{ id: "fragment-comment", text: "Bevara även denna kommentar.", subtype: "Text", continuesPreviousPost: true }])]);
  const information = materialLines.find(line => line.reviewFlags.includes("project-information"))!;
  assert.equal(information.sourceText, fragment);
  assert.equal(information.postNumber, undefined);
  assert.equal(information.unit, undefined);
  assert.equal(information.quantity, undefined);
  assert.equal(information.attributes["pdf-kommentar"], "Bevara även denna kommentar.");
  assert.equal(materialLines.find(line => line.postNumber === "30.332.5")?.unit, "RS");
  assert.equal(materialLines.find(line => line.postNumber === "30.332.6")?.quantity, 132);
  assert.ok(materialLines.filter(line => line.postNumber).every(line => !line.sourceText.includes('"Gamlebygget"')));
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
  assert.equal(materialLines.length, 2);
  const child = materialLines.find(line => line.postNumber === "33.332.1.1")!;
  assert.equal(child.quantity, 126);
  assert.equal(child.unit, "?");
  assert.equal(child.reviewFlags.includes("missing-unit"), true);
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
