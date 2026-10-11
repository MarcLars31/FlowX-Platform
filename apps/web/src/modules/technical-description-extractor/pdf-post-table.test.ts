import assert from "node:assert/strict";
import test from "node:test";
import { sitePostTableFromPdfItems } from "./pdf-post-table";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { productPostNavigationGroups } from "@/lib/product-post-tree";
import type { TechnicalDescriptionPage } from "./types";

const item = (str: string, x: number, y: number, width = str.length * 5, height = 10) =>
  ({ str, transform: [height, 0, 0, height, x, y], width, height });
const header = (quantities = true) => [item("Sted: 1201 Teststasjon", 42, 735), item("Postnr:", 49, 713, 32),
  item("Beskrivelse", 198, 713), ...(quantities ? [item("Enh.", 362, 713, 20),
    item("Mengde", 395, 713, 36), item("Pris", 457, 713), item("Sum", 521, 713)] : [])];
const post = (suffix: string, title: string, y: number) =>
  [item("1201.30.3", 44, y), item(suffix, 44, y - 11), item(title, 97, y)];
function page(items: ReturnType<typeof item>[], pageNumber = 1): TechnicalDescriptionPage {
  const postTable = sitePostTableFromPdfItems(items);
  assert.ok(postTable);
  return { pageNumber, text: "Prosjekt: Test\nPostnr: Beskrivelse Enh. Mengde Pris Sum\n" + postTable.text,
    postTable, method: "text", confidence: .98 };
}
const rows = (pages: TechnicalDescriptionPage[]) => extractTechnicalDescriptionFromPages(pages).materialLines;

test("site columns join a number broken inside a segment and preserve all headings", () => {
  const result = rows([page([...header(), item("1201", 44, 695), item("Teststasjon", 97, 695),
    item("1201.30", 44, 670), item("VVS", 97, 670), ...post("11", "Bunnledninger", 640),
    ...post("11.2", "UB2.111A", 605), item("AVLØPSLEDNING", 97, 590),
    ...post("11.2.1", "PVC DN110", 550), item("m", 368, 550), item("29,16", 410, 550)])]);
  assert.deepEqual(result.map(row => row.postNumber), ["1201.30", "1201.30.311", "1201.30.311.2", "1201.30.311.2.1"]);
  const child = result.at(-1)!;
  assert.equal(child.parentPostNumber, "1201.30.311.2");
  assert.equal(child.quantity, 29.16);
  assert.equal(child.description, "PVC DN110");
  const view = { id: child.id, value_text: child.description, source_excerpt: child.sourceText, value_json: child };
  assert.ok(projectRequirementDetails(view).sourceExcerpt?.startsWith("1201.30.311.2.1 PVC"));
  const tree = productPostNavigationGroups(result.map(row => ({ id: row.id, value_json: row })));
  assert.equal(tree[0].title, "1201 Teststasjon");
  assert.equal(tree[0].posts[0].children[0].children[0].children[0].requirement?.id, child.id);
});

for (const amount of ["201,0", "85,4", "1,3", "2 100,5"]) test(`raised m² stays in its unit column for ${amount}`, () => {
  const result = rows([page([...header(), ...post("66.1.1", "Isolasjon", 600),
    item("m", 368, 600), item("2", 378, 602.64, 4, 7), item(amount, 405, 600),
    item("0,00", 475, 600), item("999,00", 545, 600)])]);
  assert.equal(result[0].unit, "m2");
  assert.equal(result[0].quantity, Number(amount.replace(" ", "").replace(",", ".")));
  assert.equal(result[0].description, "Isolasjon");
});

test("body references and subsection numbers never create posts", () => {
  const result = rows([page([...header(false), ...post("00.1", "Generelle krav", 680),
    item("30.1.1 MENGDER", 97, 640), item("Se post", 97, 625),
    item("1201.30.324.1", 97, 610), item("og 1201.30.325.1", 97, 595)])]);
  assert.equal(result.length, 1);
  assert.match(result[0].sourceText, /30\.1\.1 MENGDER/);
  assert.match(result[0].sourceText, /1201\.30\.324\.1/);
});

test("general text spans pages without creating body-section posts or consuming the contents page", () => {
  const result = rows([page([...header(false), ...post("00.1", "Generelle krav", 680), item("Første del", 97, 650)]),
    page([...header(false), item("30.1.2 PROSJEKTERING", 97, 680), item("Siste del av kravet", 97, 655)], 2),
    { pageNumber: 3, method: "text", confidence: .98, text: "Innholdsfortegnelse\n30 Generelle krav 1\n30.1.2 PROSJEKTERING 2" }]);
  assert.deepEqual(result[0].sourcePages, [1, 2]);
  assert.match(result[0].sourceText, /Siste del av kravet/);
  assert.doesNotMatch(result[0].sourceText, /Innholdsfortegnelse/);
});

test("a continuation stops at the next physical post, even when it shares an NS code", () => {
  const result = rows([page([...header(), ...post("11.2", "UB2.111A", 680), item("RØR", 97, 664), item("Andre krav: Første del", 97, 640)]),
    page([...header(), item("Resten av kravet", 97, 680), ...post("11.3", "UB2.111A", 650),
      item("ANDRE RØR", 97, 634), item("m", 368, 620), item("12,0", 410, 620)], 2)]);
  assert.match(result[0].sourceText, /Resten av kravet/);
  assert.doesNotMatch(result[0].sourceText, /ANDRE RØR/);
  assert.equal(result[1].quantity, 12);
});

test("RS counts once; area examples and Enhet RS in requirement prose do not count", () => {
  const result = extractTechnicalDescriptionFromPages([page([...header(), ...post("25.15.2", "Rørsløyfer", 680),
    item("RS", 368, 680), item("0,00", 475, 680), item("Arealer: 100 m", 97, 640),
    item("2", 180, 643.96, 4, 7), item("Kostnaden angis som rund sum. Enhet: RS", 97, 620)])]);
  assert.equal(result.materialLines[0].quantity, 1);
  assert.equal(result.pageChecks?.[0].observedQuantityRows, 1);
  assert.equal(result.pageChecks?.[0].unresolvedQuantityRows, 0);
  assert.match(result.materialLines[0].sourceText, /100 m²/);
});

test("footer and accumulated sum are outside the requirement", () => {
  const result = rows([page([...header(), ...post("32.1", "Sprinkler", 600), item("stk", 365, 600), item("5", 420, 600),
    item("Andre krav: Nei", 97, 550), item("Sum denne side:", 418, 80), item("Akkumulert Sted 1201 Teststasjon:", 319, 62)])]);
  assert.match(result[0].sourceText, /Andre krav: Nei/);
  assert.doesNotMatch(result[0].sourceText, /Sum denne|Akkumulert/);
});

test("bare family codes still preserve the numbered main post", () => {
  const result = rows([page([...header(), ...post("22.6", "UBA", 650), item("Innendørs rørledninger", 97, 634)])]);
  assert.equal(result[0].postNumber, "1201.30.322.6");
  assert.equal(result[0].nsCode, "UBA");
  assert.equal(result[0].description, "Innendørs rørledninger");
});

test("a numeric-looking word outside the post column is not a wrapped suffix", () => {
  const result = rows([page([...header(), ...post("11.2.1", "Rør", 650), item("12", 110, 634), item("m", 368, 650), item("4", 420, 650)])]);
  assert.equal(result[0].postNumber, "1201.30.311.2.1");
  assert.match(result[0].sourceText, /\n12$/);
});

test("unrecognized layout falls back without changing other digital PDFs", () => {
  assert.equal(sitePostTableFromPdfItems([item("Postnr:", 49, 713), item("Beskrivelse", 198, 713), ...post("11.1", "Rør", 650)]), undefined);
  assert.equal(sitePostTableFromPdfItems([...header(), item("42", 44, 550)]), undefined);
});

test("a missing quantity is never read as zero or taken from the price column", () => {
  const result = rows([page([...header(), ...post("11.2.1", "Rør", 650), item("m", 368, 650), item("45", 475, 650)])]);
  assert.equal(result[0].quantity, undefined);
  assert.ok(result[0].reviewFlags.includes("missing-quantity"));
});

test("full-width chapter introductions acquire only a path confirmed by the following post", () => {
  const result = rows([page([...header(false), ...post("64.9", "Ventil", 680)]),
    page([...header(false), item("365 LUFTBEHANDLINGSUTSTYR", 46, 690), item("DETALJKRAV.", 46, 670), item("Krav til utførelse: Eget kapittel", 46, 640)], 2),
    page([...header(false), item("Fortsettelsen til kapittel 365", 46, 690)], 3),
    page([...header(), ...post("65.1", "Vifte", 680), item("stk", 365, 680), item("2", 420, 680)], 4)]);
  assert.deepEqual(result.map(row=>row.postNumber), ["1201.30.364.9", "1201.30.365", "1201.30.365.1"]);
  assert.deepEqual(result[1].sourcePages, [2, 3]);
  assert.equal(result[2].parentPostNumber, "1201.30.365");
  assert.doesNotMatch(result[0].sourceText, /LUFTBEHANDLINGSUTSTYR/);
  const view=projectRequirementDetails({ id:result[2].id, value_text:result[2].description, source_excerpt:result[2].sourceText, value_json:result[2] });
  assert.doesNotMatch(view.sourceExcerpt??'', /Eget kapittel/);
});

test("full-width prose with an unrelated number does not invent a chapter", () => {
  const result = rows([page([...header(false), ...post("64.9", "Ventil", 680)]),
    page([...header(false), item("400 VOLT", 46, 690), item("Krav til strømforsyning", 46, 650)], 2),
    page([...header(), ...post("65.1", "Vifte", 680), item("stk", 365, 680), item("2", 420, 680)], 3)]);
  assert.equal(result.length, 2);
  assert.match(result[0].sourceText, /400 VOLT/);
});

test("Postnr references in the body and page continuation survive header cleanup", () => {
  const result = rows([page([...header(), ...post("11.2", "Rørledning", 680), item("Postnr. 1201.30.300.1.", 118, 620)]),
    page([...header(), item("Postnr. 1201.30.311.1.", 118, 680), ...post("11.3", "Neste rørledning", 620)],2)]);
  assert.match(result[0].sourceText,/Postnr\. 1201\.30\.300\.1\./);
  assert.match(result[0].sourceText,/Postnr\. 1201\.30\.311\.1\./);
  assert.doesNotMatch(result[0].sourceText,/Neste rørledning/);
});
