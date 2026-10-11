import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";
import { currentPostRequirement } from "./current-post-requirement";
import { projectRequirementDetails } from "./project-requirement-details";
import { structuredPostBlocks } from "./structured-post-layout";

const header = "Kapittel: 33 Brannslokking\nPostnr. NS-kode/Spesifikasjon Enhet Mengde Pris Sum\n";
const post = "33.500.6 | UE6.1913\nHANDSLOKKER\nAntall stk 2\nKlassifisering av brann: 75F\nMengde slokkemedium: 6 liter\nAndre krav: Nei";
const page = (pageNumber: number, text: string) => ({ pageNumber, text, method: "ocr" as const, confidence: 0.91 });

for (const footer of ["Sum denne side:", "Sum denne side.", "Sum denne side", "Sum denne side;", "Sum denne side: 12 500,00", "Sum denna sida."]) {
  test(`page total is excluded from an imported post: ${footer}`, () => {
    const { materialLines } = extractTechnicalDescriptionFromPages([page(3, `${header}${post}\n${footer}\nAkkumulert Kapittel 33 Brannslokking:`)]);
    assert.equal(materialLines.length, 1);
    assert.equal(materialLines[0].postNumber, "33.500.6");
    assert.equal(materialLines[0].quantity, 2);
    assert.match(materialLines[0].sourceText, /Mengde slokkemedium: 6 liter\nAndre krav: Nei$/);
    assert.doesNotMatch(JSON.stringify(materialLines[0]), /Sum denne side|Sum denna sida|Akkumulert/);
  });
}

test("page totals do not remove a real continuation or the next product", () => {
  const { materialLines } = extractTechnicalDescriptionFromPages([
    page(3, `${header}${post.replace("Andre krav: Nei", "Andre krav:\na) Omfang og prisgrunnlag\nLeveres med")}\nSum denne side.`),
    page(4, `${header}veggbrakett og skilt.\n33.500.7 UE6.1913\nHANDSLOKKER\nAntall stk 3\nAndre krav: Nei\nSum denne side`)
  ]);
  assert.equal(materialLines.length, 2);
  assert.deepEqual(materialLines[0].sourcePages, [3, 4]);
  assert.match(materialLines[0].sourceText, /veggbrakett og skilt/);
  assert.equal(materialLines[1].quantity, 3);
  assert.doesNotMatch(JSON.stringify(materialLines), /Sum denne side/);
});

test("legacy card removes a separate total row without writing to the saved post", () => {
  const source = `${post}\nSum denne side.`;
  const row = { status: "user_confirmed", source_page: 3, source_excerpt: source, value_json: {
    postNumber: "33.500.6", nsCode: "UE6.1913", technicalSpecification: source,
    attributes: { "mengde slokkemedium": "6 liter" }, productResolution: { status: "not_in_assortment" }
  } };
  const before = JSON.stringify(row);
  const details = projectRequirementDetails(row);
  const blocks = structuredPostBlocks(details, "HANDSLOKKER");
  assert.deepEqual(blocks.filter(block => block.kind === "field" && block.label === "Andre krav"), [{ kind: "field", label: "Andre krav", text: "Nei" }]);
  assert.equal(details.additionalRequirements, "Nei");
  assert.doesNotMatch(JSON.stringify(details), /Sum denne side/);
  assert.equal(JSON.stringify(row), before);
  assert.deepEqual(currentPostRequirement(row).value_json.productResolution, row.value_json.productResolution);
});

test("legacy page cleanup keeps all real continuation prose, quoted totals and lump sums", () => {
  const source = `${post}\nSum denne side.\nAkkumulert Kapittel 33: 500\n\nFORTSETTELSE SIDE 4\na) Omfang og prisgrunnlag\nSum denne side skal føres i tilbudsskjemaet.\nFeltet «Sum denne side» er en henvisning.\nRund sum RS`;
  const row = { value_json: { postNumber: "33.500.6", technicalSpecification: source } };
  const cleaned = String(currentPostRequirement(row).value_json.technicalSpecification);
  assert.doesNotMatch(cleaned, /Sum denne side\.\n|Akkumulert/);
  assert.match(cleaned, /FORTSETTELSE SIDE 4\na\) Omfang og prisgrunnlag/);
  assert.match(cleaned, /Sum denne side skal føres i tilbudsskjemaet/);
  assert.match(cleaned, /Feltet «Sum denne side» er en henvisning/);
  assert.match(cleaned, /Rund sum RS$/);
});

test("only unreviewed OCR fields with an evidenced footer lose its derived suffix", () => {
  const source = `${post}\nSum denne side.`;
  const row = { status: "extracted_unreviewed", value_json: { postNumber: "33.500.6", sourceText: source,
    reviewFlags: ["ocr-source"], attributes: { "andre krav": "Nei Sum denne side.", "pdf-kommentar": "Kontroller Sum denne side." }
  } };
  const cleaned = currentPostRequirement(row);
  assert.equal(cleaned.value_json.attributes["andre krav"], "Nei");
  assert.equal(cleaned.value_json.attributes["pdf-kommentar"], row.value_json.attributes["pdf-kommentar"]);
  assert.deepEqual(currentPostRequirement({ ...row, status: "user_confirmed" }).value_json.attributes, row.value_json.attributes);
  assert.deepEqual(currentPostRequirement({ ...row, reviewed_at: "2026-10-11" }).value_json.attributes, row.value_json.attributes);
  assert.deepEqual(currentPostRequirement({ ...row, value_json: { ...row.value_json, sourceText: post } }).value_json.attributes, row.value_json.attributes);
});
