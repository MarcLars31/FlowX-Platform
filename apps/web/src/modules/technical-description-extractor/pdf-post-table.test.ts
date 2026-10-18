import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractTechnicalDescriptionPages } from "./pdf";
import { requirementExtractionWarnings } from "@/lib/requirement-extraction-warnings";
import test from "node:test";
import { sitePostTableFromPdfItems } from "./pdf-post-table";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { productPostNavigationGroups } from "@/lib/product-post-tree";
import { pdfPostDescriptionText } from "./pdf-post-description";
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

test("description quantities are preserved by column position, even when identical to the separate amount", async () => {
  const pages = [page([...header(), ...post("32.1.1", "Lokalisering: Rom M3H1.02", 680),
    item("stk", 365, 680), item("2", 420, 680), item("0,00", 475, 680), item("0,00", 540, 680),
    item("Hulltaking for 28 varmerør MM med 30 mm isolasjon", 97, 650),
    item("Antall", 97, 630), item("Antall st 2", 97, 610), item("Antall st 5", 97, 590)])];
  const row = rows(pages)[0];
  assert.equal(row.quantity, 2);
  assert.equal(row.unit, "st");
  assert.equal(row.pdfDescriptionText, "1201.30.332.1.1 Lokalisering: Rom M3H1.02\nHulltaking for 28 varmerør MM med 30 mm isolasjon\nAntall\nAntall st 2\nAntall st 5");
  assert.equal(row.sourceText.split("Antall st 2").length - 1, 2);
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProjectPostSpecification } = await import("@/components/ProjectPostSpecification");
  const details = projectRequirementDetails({ source_page: 1, source_excerpt: row.sourceText, value_text: row.description, value_json: row });
  const html = renderToStaticMarkup(createElement(ProjectPostSpecification, { id: row.id, details, description: row.description,
    quantity: { quantity: 2, unit: "st" } }));
  assert.equal(html.split("Antall st 2").length - 1, 1);
  assert.equal(html.split("Antall st 5").length - 1, 1);
  assert.match(html, /<span>Enh\.: stk<\/span>/);
  assert.match(html, /<span>Antall: 2<\/span>/);
  assert.doesNotMatch(html, /<dt[^>]*>Antall:/);
  assert.doesNotMatch(html, /aria-label="Pris"|aria-label="Sum"/);
  assert.equal(html.split("Rom M3H1.02").length - 1, 1);
  assert.match(html, /28 varmerør MM med 30 mm isolasjon/);
});

test("original description follows page continuation while separate amount columns stay separate", () => {
  const pages = [page([...header(), ...post("32.1", "SF6.41A", 680), item("TETTING", 97, 660), item("Andre krav:", 97, 640)]),
    page([...header(), item("Antall st 2 for reservedeler", 97, 680), item("stk", 365, 680), item("5", 420, 680),
      ...post("32.2", "NESTE POST", 620)], 2)];
  const row = rows(pages)[0];
  assert.match(row.pdfDescriptionText ?? "", /FORTSETTELSE SIDE 2\nAntall st 2 for reservedeler$/);
  assert.doesNotMatch(row.pdfDescriptionText ?? "", /Antall st 5|NESTE POST/);
  assert.equal(row.quantity, 5);
  assert.deepEqual(row.pdfColumnValues, { unit: "stk", quantity: "5" });
  assert.equal(pdfPostDescriptionText([{ ...pages[0], postTable: undefined }], row), undefined);
});

test("site columns join a number broken inside a segment and preserve all headings", () => {
  const result = rows([page([...header(), item("1201", 44, 695), item("Teststasjon", 97, 695),
    item("1201.30", 44, 670), item("VVS", 97, 670), ...post("11", "Bunnledninger", 640),
    ...post("11.2", "UB2.111A", 605), item("AVLØPSLEDNING", 97, 590),
    ...post("11.2.1", "PVC DN110", 550), item("m", 368, 550), item("29,16", 410, 550)])]);
  assert.deepEqual(result.map(row => row.postNumber), ["1201", "1201.30", "1201.30.311", "1201.30.311.2", "1201.30.311.2.1"]);
  const child = result.at(-1)!;
  assert.equal(child.parentPostNumber, "1201.30.311.2");
  assert.equal(child.quantity, 29.16);
  assert.equal(child.description, "PVC DN110");
  const view = { id: child.id, value_text: child.description, source_excerpt: child.sourceText, value_json: child };
  assert.ok(projectRequirementDetails(view).sourceExcerpt?.startsWith("1201.30.311.2.1 PVC"));
  const tree = productPostNavigationGroups(result.map(row => ({ id: row.id, value_json: row })));
  assert.equal(tree[0].title, "1201 Teststasjon");
  assert.equal(tree[0].posts[0].children[0].children[0].children[0].children[0].requirement?.id, child.id);
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


for (const label of ["Enh.", "Enh", "Enh:", "Enhet", "Enhet:", "ENHET", "Enhed"]) {
  test(`reads the quantity beneath the unit header ${label}`, () => {
    const items = header().map(cell => cell.str === "Enh." ? item(label, 362, 713) : cell);
    const result = extractTechnicalDescriptionFromPages([page([...items, ...post("11.2.1", "Rør DN50", 650),
      item("m", 368, 650), item("12,0", 410, 650), item("450,00", 475, 650), item("5400,00", 540, 650)])]);
    const row = result.materialLines[0];
    assert.equal(row.quantity, 12);
    assert.equal(row.unit, "m");
    assert.equal(row.description, "Rør DN50");
    assert.deepEqual(row.reviewFlags, []);
    assert.equal(result.pageChecks?.[0].observedQuantityRows, 1);
    assert.equal(result.warnings.some(warning => warning.code === "PDF_QUANTITY_COLUMNS_UNRECOGNIZED"), false);
  });
}

test("recognizes adjacent label fragments and localized quantity/price labels", () => {
  const items = header().filter(cell => !["Enh.", "Mengde", "Pris"].includes(cell.str));
  items.push(item("En", 362, 713, 10), item("het", 372, 713, 15), item("Mängd:", 395, 713, 35), item("Enhetspris", 457, 713, 50));
  const result = rows([page([...items, ...post("66.1.1", "Isolasjon", 650),
    item("m", 368, 650), item("2", 378, 652.64, 4, 7), item("201,0", 410, 650), item("55,00", 475, 650)])]);
  assert.equal(result[0].unit, "m2");
  assert.equal(result[0].quantity, 201);
});

for (const variant of ["unknown-unit", "missing-amount", "unknown-price", "swapped-columns", "overlapping-columns"]) {
  test(`flags ${variant} without taking the price as a quantity`, () => {
    const items = header().flatMap(cell => {
      if (variant === "unknown-unit" && cell.str === "Enh.") return [item("Ukjent", 362, 713)];
      if (variant === "missing-amount" && cell.str === "Mengde") return [];
      if (variant === "unknown-price" && cell.str === "Pris") return [item("Beløp", 457, 713)];
      if (variant === "swapped-columns" && cell.str === "Enh.") return [item("Enh.", 395, 713)];
      if (variant === "swapped-columns" && cell.str === "Mengde") return [item("Mengde", 362, 713)];
      if (variant === "overlapping-columns" && cell.str === "Mengde") return [item("Mengde", 370, 713)];
      return [cell];
    });
    const result = extractTechnicalDescriptionFromPages([page([...items, ...post("11.2.1", "Rør DN50", 650),
      item("m", 368, 650), item("12,0", 410, 650), item("450,00", 475, 650)])]);
    const row = result.materialLines[0];
    assert.equal(row.postNumber, "1201.30.311.2.1");
    assert.equal(row.quantity, undefined);
    assert.match(row.sourceText, /12,0/);
    assert.ok(row.reviewFlags.includes("unrecognized-quantity-columns"));
    const userWarnings = requirementExtractionWarnings({ value_json: row, value_text: row.description });
    assert.ok(userWarnings.some(message => message.includes("kolumner för enhet och mängd")));
    assert.equal(userWarnings.some(message => message.includes("mängd saknas")), false);
    assert.equal(result.warnings.filter(warning => warning.code === "PDF_QUANTITY_COLUMNS_UNRECOGNIZED").length, 1);
  });
}

test("information pages without quantity columns do not receive a column warning", () => {
  const result = extractTechnicalDescriptionFromPages([page([...header(false), ...post("00.1", "Generelle krav", 650),
    item("Enhet og mengde beskrives i underpostene.", 97, 620)])]);
  assert.equal(result.warnings.some(warning => warning.code === "PDF_QUANTITY_COLUMNS_UNRECOGNIZED"), false);
  assert.equal(result.materialLines[0].reviewFlags.includes("unrecognized-quantity-columns"), false);
});

test("an ambiguous quantity header on a continuation flags the originating post", () => {
  const nextHeader = header().map(cell => cell.str === "Enh." ? item("Ukjent", 362, 713) : cell);
  const result = extractTechnicalDescriptionFromPages([
    page([...header(false), ...post("11.2.1", "Rør DN50", 650)]),
    page([...nextHeader, item("Videre kravtekst", 97, 650), item("m", 368, 650), item("12,0", 410, 650)], 2)
  ]);
  assert.equal(result.materialLines[0].quantity, undefined);
  assert.ok(result.materialLines[0].reviewFlags.includes("unrecognized-quantity-columns"));
  assert.ok(result.warnings.some(warning => warning.code === "PDF_QUANTITY_COLUMNS_UNRECOGNIZED" && warning.sourcePage === 2));
});


test("reads Enhet through actual PDF text extraction with the same result as Enh.", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [index, label] of ["Enh.", "Enhet"].entries()) {
    const sheet = pdf.addPage([595, 842]);
    for (const cell of [...header().map(cell => cell.str === "Enh." ? item(label, 362, 713) : cell),
      item(`1201.30.311.${index + 1}`, 44, 650), item("Ror DN50", 120, 650),
      item("m", 368, 650), item("12,0", 410, 650), item("450,00", 475, 650), item("5400,00", 540, 650)]) {
      sheet.drawText(cell.str, { font, size: 10, x: cell.transform[4], y: cell.transform[5] });
    }
  }
  const pages = await extractTechnicalDescriptionPages(await pdf.save());
  const result = extractTechnicalDescriptionFromPages(pages);
  assert.ok(pages.every(page => page.postTable && !page.postTable.quantityColumnsUnrecognized));
  assert.deepEqual(result.materialLines.map(row => [row.postNumber, row.quantity, row.unit]),
    [["1201.30.311.1", 12, "m"], ["1201.30.311.2", 12, "m"]]);
});

test("plain fallback preserves empty RS amounts and original numeric formatting separately from description", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProjectPostSpecification } = await import("@/components/ProjectPostSpecification");
  for (const [unit, amount, expectedQuantity] of [["RS", "", 1], ["stk", "2,00", 2]] as const) {
    const row = rows([page([...header(), ...post("32.1.1", "Arbeid", 680), item(unit, 365, 680),
      ...(amount ? [item(amount, 420, 680)] : []), item("0,00", 475, 680), item("0,00", 540, 680)])])[0];
    assert.equal(row.quantity, expectedQuantity);
    assert.deepEqual(row.pdfColumnValues, { unit, quantity: amount });
    const details = projectRequirementDetails({ source_page: 1, source_excerpt: row.sourceText, value_json: row });
    const html = renderToStaticMarkup(createElement(ProjectPostSpecification, { id: row.id, details, description: row.description,
      quantity: { quantity: row.quantity!, unit: row.unit! } }));
    assert.ok(html.includes('<span>Antall: ' + amount + '</span>'));
    assert.ok(html.includes('<span>Enh.: ' + unit + '</span>'));
  }
});
