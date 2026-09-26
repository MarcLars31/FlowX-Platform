import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";
import { layoutTextFromOcrBlocks } from "../modules/technical-description-extractor/pdf-layout";
import { mergeQuantityOcrReadings, parseQuantityOcrText, quantityOcrRegions, removeQuantityCellRules } from "./pdf-quantity-ocr";
import { projectRequirementQuantity } from "./project-requirement-quantity";
import { parseProductOrderQuantity } from "./product-order-quantity";
import { groupProjectRequirementViews } from "./project-requirement-views";
import { buildProjectMaterialRows, createProjectMaterialListWorkbook } from "./project-material-list-export";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { enrichProjectRequirements } from "./project-requirement-enrichment";

const page = (text: string) => ({ pageNumber: 1, method: "text" as const, confidence: .98, text });

test("fallback posts keep length and piece quantities, full post numbers and square-metre units", () => {
  const result = extractTechnicalDescriptionFromPages([page([
    "18 Fasader", "18.265.2 PN6.2117292A", "NEDLØPSRØR", "Lengde m 180", "Materiale: Aluminium",
    "18.265.4 PN6.231729A", "GRENRØR", "Antall STK 15", "Materiale: Aluminium",
    "17.284.1.5 PN8.5124211A", "NEDLØPSSYSTEM", "Samlet lengde lm 80",
    "17.284.2 PN8.5124211A", "PLATE", "Areal m² 12,50", "Andre krav:", "Maks avstand mellom festene: 2 m"
  ].join("\n"))]);
  assert.deepEqual(result.materialLines.map(r => [r.postNumber, r.quantity, r.unit]), [
    ["18.265.2", 180, "m"], ["18.265.4", 15, "st"], ["17.284.1.5", 80, "m"], ["17.284.2", 12.5, "m2"]
  ]);
});

test("wrapped unit/quantity cells preserve fractional metres through display, selection and Excel", async () => {
  const { materialLines } = extractTechnicalDescriptionFromPages([page(
    "33 Brannslokking\n33.332.1 UB1.31114921934A\nSTÅLRØR\nLengde\nM\n1 234,50\nDimensjon: DN25\nMateriale: Stål\nSkjøt: Rilleskjøt"
  )]);
  assert.equal(materialLines.length, 1);
  const line = materialLines[0];
  assert.equal(line.quantity, 1234.5);
  assert.equal(line.unit, "m");
  const requirement = { id: "pipe", value_text: line.description, value_json: line };
  assert.deepEqual(projectRequirementQuantity(line), { quantity: 1234.5, unit: "m" });
  assert.deepEqual(parseProductOrderQuantity({ quantity: "1 234,50", unit: "M" }), { quantity: 1234.5, unit: "m" });
  const rows = buildProjectMaterialRows({ requirements: [requirement], assignments: [] });
  assert.equal(rows[0].quantity, 1234.5);
  assert.equal(rows[0].unit, "m");
  const workbook = await createProjectMaterialListWorkbook({ organizationName: "Test", project: { name: "Mängdtest" }, rows });
  assert.ok(workbook.byteLength > 0);
});

test("stored decimal-comma quantities stay under products and unknown units are not guessed as pieces", () => {
  for (const value of ["501,10", "501.10", 501.1]) {
    assert.deepEqual(projectRequirementQuantity({ quantity: value, unit: "M" }), { quantity: 501.1, unit: "m" });
    assert.equal(groupProjectRequirementViews([{ id: "pipe", value_json: { quantity: value, unit: "M" } }]).products.length, 1);
  }
  assert.deepEqual(projectRequirementQuantity({ quantity: "1\u00a0234,50", unit: "meter" }), { quantity: 1234.5, unit: "m" });
  assert.deepEqual(projectRequirementQuantity({ quantity: "12", unit: "STK" }), { quantity: 12, unit: "st" });
  assert.deepEqual(projectRequirementQuantity({ quantity: "12" }), { quantity: 12, unit: "?" });
  for (const value of [null, undefined, "", " ", true, "12 items", "1 0", "12,3,4"]) {
    assert.equal(projectRequirementQuantity({ quantity: value }).quantity, null);
  }
});

test("existing projects recover missing metres from stored pages without changing selected products", () => {
  const selection = { productNumber: "1234567" };
  const [requirement] = enrichProjectRequirements([{
    id: "pipe", source_page: 1, source_technical_description_document_id: "pdf", selection,
    value_text: "NEDLØPSRØR", value_json: { postNumber: "18.265.2", quantity: null }
  }], [{ id: "pdf", source_pages: [page("18 Fasader\n18.265.2 PN6.2117292A\nNEDLØPSRØR\nLengde m 180\nMateriale: Aluminium")] }]);
  assert.deepEqual(projectRequirementQuantity(requirement.value_json), { quantity: 180, unit: "m" });
  assert.deepEqual(requirement.selection, selection);
});

test("metres select the pipe family but total length never becomes a pipe product search term", () => {
  const requirement = { category: "fitting", value_text: "DN25 komplett med deler bend og oppheng", value_json: {
    nsCode: "UB1.31114312099", unit: "M", quantity: 1234.5,
    attributes: { dimensjon: "DN25", materiale: "Stål", skjøt: "Rilleskjøt", trykk: "PN16" }
  } };
  assert.equal(ahlsellRequirementIntent(requirement), "pipe");
  const first = buildAhlsellRequirementGuide(requirement).searchQueries;
  const second = buildAhlsellRequirementGuide({ ...requirement, value_json: { ...requirement.value_json, quantity: 9876 } }).searchQueries;
  assert.deepEqual(first, second);
  assert.match(first.join(" "), /DN25|33[.,]7/);
  assert.match(first.join(" "), /rør/);
  assert.doesNotMatch(first.join(" "), /1234|9876|bend|oppheng/);
});

const word = (text: string, x0: number, y0: number, x1: number, y1: number) => ({ text, bbox: { x0, y0, x1, y1 } });
const blocks = (words: ReturnType<typeof word>[]) => [{ paragraphs: [{ lines: [{ words }] }] }];

test("targeted OCR repairs only missing quantity cells and leaves prices and neighbouring posts untouched", () => {
  const source = blocks([
    word("Enh.", 600, 100, 630, 120), word("Mengde", 660, 100, 710, 120), word("Pris", 750, 100, 780, 120),
    word("30.332.7.1", 50, 200, 140, 220), word("DN25", 170, 200, 230, 220),
    word("Lengde", 170, 240, 230, 260), word("126", 680, 240, 710, 260), word("0,00", 770, 240, 800, 260),
    word("30.332.7.2", 50, 300, 140, 320), word("DN32", 170, 300, 230, 320),
    word("Lengde", 170, 340, 230, 360), word("m", 610, 340, 620, 360), word("384", 680, 340, 710, 360)
  ]);
  const regions = quantityOcrRegions(source, 1000, 1400);
  assert.equal(regions.length, 1);
  assert.ok(regions[0].left > 230 && regions[0].left + regions[0].width < 750);
  const merged = layoutTextFromOcrBlocks(mergeQuantityOcrReadings(source, [{ region: regions[0], text: "m | 126]" }]));
  assert.match(merged, /Lengde\s+m 126\s+0,00/);
  assert.match(merged, /30\.332\.7\.2\s+DN32/);
  assert.match(merged, /Lengde\s+m\s+384/);
  assert.equal((merged.match(/126/g) ?? []).length, 1);
  assert.deepEqual(quantityOcrRegions(blocks(source[0].paragraphs[0].lines[0].words.filter(w => w.text !== "Mengde")), 1000, 1400), []);
});

test("cell OCR requires an explicit unit and rejects prices, ambiguous digits and empty readings", () => {
  assert.equal(parseQuantityOcrText("m | 2|"), "m 2");
  assert.equal(parseQuantityOcrText("stk | 1]"), "stk 1");
  assert.equal(parseQuantityOcrText("M | 501,10"), "M 501,10");
  for (const unit of ["Im", "1m"]) {
    const cell = parseQuantityOcrText(`${unit} 45,00`);
    assert.equal(cell, `${unit} 45,00`);
    const result = extractTechnicalDescriptionFromPages([page(`33 Brannslokking\n33.332.1 UB1.31114921934A\nSTÅLRØR\nLengde ${cell}`)]);
    assert.equal(result.materialLines[0].quantity, 45);
    assert.equal(result.materialLines[0].unit, "m");
  }
  for (const value of ["126", "m", "m 126 0,00", "stk l", "DN25 126", ""]) assert.equal(parseQuantityOcrText(value), null);
});

test("cell preprocessing removes a full-height table border without erasing a digit one", () => {
  const width = 60, height = 60;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const black = (x: number, y: number) => { const i = (y * width + x) * 4; pixels[i] = pixels[i + 1] = pixels[i + 2] = 0; };
  for (let y = 10; y < 50; y++) black(40, y);
  for (let y = 20; y < 40; y++) black(35, y);
  removeQuantityCellRules(pixels, width, height);
  for (let y = 10; y < 50; y++) assert.equal(pixels[(y * width + 40) * 4], 255);
  for (let y = 20; y < 40; y++) assert.equal(pixels[(y * width + 35) * 4], 0);
});
