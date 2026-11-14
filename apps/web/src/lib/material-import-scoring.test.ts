import { materialWorkbookFixture } from "./material-import-workbook.test-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExcelJS from "exceljs";
import { MaterialRowReview } from "../components/MaterialExcelImport";
import { materialCandidateScore, materialDimensionMatch } from "./material-import-scoring";
import { materialRequirement, matchMaterialRow } from "./material-import-matching";
import { initialMaterialReview, type MaterialRow, type MaterialSearchInput } from "./material-import";
import { exportMaterialWorkbook } from "./material-import-workbook";
import { AHLSELL_EVIDENCE_VERSION, buildAhlsellTechnicalEvidence, type AhlsellEvidenceSnapshot } from "./ahlsell-technical-evidence";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

const input: MaterialSearchInput = { description: "KRA.017 3322 Normaltykke Stålrør Sprinkler", dimension: "100", dimensionKind: "dn",
  fittingDimension: "", category: "Rør (m)", unit: "m", query: "", details: "" };
const row: MaterialRow = { ...input, id: "Material:18", sheet: "Material med NRF", sourceRow: 18, quantity: 260, quantityText: "260", issues: [] };
function pipe(articleNumber = "1001126", dn = 100, outside = 114.3) {
  const snapshot: AhlsellEvidenceSnapshot = { version: AHLSELL_EVIDENCE_VERSION, articleNumber,
    sourceUrl: `https://www.ahlsell.no/products/test/${articleNumber}/`, retrievedAt: new Date().toISOString(),
    productName: "Stålrør gjengede galvanisert, mellom serie - EN 10255",
    subtitle: `4\" ${outside}x4.5 gjenget stålrør S195 mellomserie galvanisert`, description: null,
    specifications: ["Materiale: Stål", `Nominell diameter: 4\" (${dn})`, `Ytre rørdiameter: ${outside} mm`, "Veggtykkelse: 4.5 mm"] };
  const candidate: AhlsellPublicCandidate = { ...snapshot, subtitle: snapshot.subtitle!, description: undefined, productUrl: snapshot.sourceUrl,
    manufacturer: "", source: "catalog_search", matchScore: 100, technicalEvidence: buildAhlsellTechnicalEvidence(snapshot) };
  return { candidate, detail: { ...snapshot, subtitle: snapshot.subtitle!, description: undefined, snapshot, technicalEvidence: candidate.technicalEvidence } };
}

test("reported 1001126 is DN100 while 114.3 mm remains a separate outside diameter", () => {
  const result = materialDimensionMatch(input, pipe().candidate);
  assert.equal(result.status, "match");
  assert.equal(result.expected, "DN 100");
  assert.match(result.actual, /DN 100 · ytterdiameter 114,3 mm/);
  assert.equal(materialDimensionMatch({ ...input, dimensionKind: "outside" }, pipe().candidate).status, "mismatch");
  assert.equal(materialDimensionMatch({ ...input, dimension: "114,3", dimensionKind: "outside" }, pipe().candidate).status, "match");
});

test("unknown workbook measure systems and missing product sizes cannot become confirmed matches", () => {
  const candidate = pipe().candidate;
  const unknown = materialDimensionMatch({ ...input, dimensionKind: "unspecified" }, candidate);
  assert.equal(unknown.status, "unknown");
  assert.match(unknown.actual, /DN 100/);
  assert.ok(materialCandidateScore(candidate, unknown, true, false).score < 60);
  assert.equal(materialDimensionMatch(input, { ...candidate, technicalEvidence: undefined }).status, "unknown");
  assert.equal(materialDimensionMatch({ ...input, dimension: "DN100", dimensionKind: "unspecified" }, candidate).status, "match");
  assert.match(JSON.stringify(materialRequirement({ ...input, dimension: "DN100", dimensionKind: "unspecified" })), /"DN":"100"/);
});

test("wrong, conflicting, foreign and expired size evidence cannot earn a high score", () => {
  const wrong = pipe("1001124", 80, 88.9).candidate;
  const mismatch = materialDimensionMatch(input, wrong);
  assert.equal(mismatch.status, "mismatch");
  assert.ok(materialCandidateScore(wrong, mismatch, true, true).score < 25);
  const foreign = pipe().candidate;
  foreign.technicalEvidence!.articleNumber = "1234567";
  assert.equal(materialDimensionMatch(input, foreign).status, "unknown");
  const stale = pipe().candidate;
  for (const field of Object.values(stale.technicalEvidence!.fields)) for (const item of field!.observations) item.retrievedAt = "2020-01-01T00:00:00Z";
  assert.equal(materialDimensionMatch(input, stale).status, "unknown");
  const conflict = pipe().candidate;
  conflict.technicalEvidence!.fields.dn!.status = "conflict";
  assert.equal(materialDimensionMatch(input, conflict).status, "unknown");
});

test("size intervals and multi-size headers do not establish one nominal diameter", () => {
  for (const subtitle of ["DN100-150", "DN100 / DN150", "DN100x80"]) {
    const candidate = { ...pipe().candidate, technicalEvidence: undefined, subtitle };
    assert.equal(materialDimensionMatch(input, candidate).status, "unknown", subtitle);
    const snapshot = { ...pipe().detail.snapshot, subtitle, specifications: [] };
    assert.equal(materialDimensionMatch(input, { ...candidate, technicalEvidence: buildAhlsellTechnicalEvidence(snapshot) }).status, "unknown", subtitle);
  }
});

test("fitting comparison retains every port and cannot silently assume DN", () => {
  const tee = { ...input, fittingDimension: "35-35-28", dimension: "", dimensionKind: "outside" as const, unit: "stk" };
  const candidate = { ...pipe().candidate, technicalEvidence: undefined, productName: "T-rør", subtitle: "35 x 35 x 35 mm", specifications: [] };
  assert.equal(materialDimensionMatch(tee, candidate).status, "mismatch");
  assert.equal(materialDimensionMatch(tee, { ...candidate, subtitle: "35 x 35 x 28 mm" }).status, "match");
  assert.equal(materialDimensionMatch({ ...tee, dimensionKind: "dn" }, candidate).status, "unknown");
});

test("scores are bounded and technical conflicts or unverified identity still limit a matching size", () => {
  const candidate = pipe().candidate, dimension = materialDimensionMatch(input, candidate);
  assert.ok(materialCandidateScore(candidate, dimension, false, false).score < 70);
  assert.ok(materialCandidateScore(candidate, dimension, true, true).score < 35);
  for (const matchScore of [NaN, Infinity, -25, 200]) {
    const result = materialCandidateScore({ ...candidate, matchScore }, dimension, true, false);
    assert.ok(Number.isInteger(result.score) && result.score >= 0 && result.score <= 100);
    assert.ok(result.scoreReasons.length > 0);
  }
});

async function matchPipes() {
  const wrong = pipe("1001124", 80, 88.9), correct = pipe();
  return matchMaterialRow(input, {}, {
    search: async () => ({ candidates: [wrong.candidate, correct.candidate], query: "stålrør DN100", queries: [],
      searchUrl: "https://www.ahlsell.no/search?q=staalror", searchUrls: [], total: 2, truncated: false }),
    details: async () => ({ [wrong.candidate.articleNumber]: wrong.detail, [correct.candidate.articleNumber]: correct.detail }),
  });
}

test("full Excel matching ranks the correct DN first and supplies a score and explanation for every result", async () => {
  const result = await matchPipes();
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].articleNumber, "1001126");
  assert.equal(result.candidates[0].dimensionMatch?.status, "match");
  assert.doesNotMatch(result.candidates[0].warnings.join(" "), /Produktens dimension saknas/);
  assert.equal(result.candidates[1].dimensionMatch?.status, "mismatch");
  assert.ok(result.candidates[0].score! > result.candidates[1].score!);
  for (const candidate of result.candidates) { assert.equal(typeof candidate.score, "number"); assert.ok(candidate.scoreReasons?.length); }
});

test("cards show points, both measure systems and mismatches while every result stays selectable", async () => {
  const result = await matchPipes();
  result.candidates[0].specifications = ["", "  ", "Nominell diameter: DN100"];
  const html = renderToStaticMarkup(createElement(MaterialRowReview, { row, review: { ...initialMaterialReview(row), input, result, status: "review" },
    busy: false, onInput: () => {}, onReview: () => {}, onSearch: () => {} }));
  assert.equal([...html.matchAll(/Matchpoäng:/g)].length, 2);
  assert.match(html, /Storleken stämmer/);
  assert.match(html, /Fel storlek/);
  assert.match(html, /ytterdiameter 114,3 mm/);
  assert.match(html, /Så räknas poängen/);
  assert.doesNotMatch(html, /<li>\s*<\/li>/);
  const choices = [...html.matchAll(/<button\b([^>]*)>Välj produkt<\/button>/g)];
  assert.equal(choices.length, 2);
  assert.ok(choices.every(([, attributes]) => !/\sdisabled(?:=|\s|$)/.test(attributes)));
});

test("workbook keeps the selected low-score product in its original row without score columns", async () => {
  const result = await matchPipes();
  const selected = result.candidates[1];
  const review = { ...initialMaterialReview(row), input, result, status: "selected" as const, selected };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportMaterialWorkbook(await materialWorkbookFixture([row]), [row], { [row.id]: review }) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell("G18").value, selected.articleNumber);
  assert.equal(sheet.getCell("B18").value, "100");
  assert.equal(sheet.getCell("A18").value, row.description);
  assert.equal(sheet.columnCount, 7);
});
