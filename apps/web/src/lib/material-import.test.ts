import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { canSelectMaterialCandidate, initialMaterialReview, materialSearchQuery, parseMaterialQuantity, parseMaterialSheets, validateMaterialSearchInput, type MaterialSearchInput } from "./material-import";
import { exportMaterialWorkbook, readMaterialWorkbook, validateMaterialWorkbook } from "./material-import-workbook";
import { fittingDimensionCheck, materialRequirement, matchMaterialRow, pipeHeaderDimensionCheck } from "./material-import-matching";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { AHLSELL_EVIDENCE_VERSION, buildAhlsellTechnicalEvidence, type AhlsellEvidenceSnapshot } from "./ahlsell-technical-evidence";

const header = ["Description", "Dimensjon", "Fittingdimensjon", "Enhet", "Mengde", "Kategori"];
const copper = ["KRA.001 3123 Kobberrør Standard Forbruksvann", "15", "", "m", "78", "Rør (m)"];
const input: MaterialSearchInput = { description: copper[0], unit: "m", category: "Rør (m)", dimension: "15", fittingDimension: "", dimensionKind: "unspecified", details: "", query: "" };
const parse = (cells: string[][]) => parseMaterialSheets([{ name: "FASE 1", rows: cells.map((cells, index) => ({ number: index + 1, cells })) }]);

async function workbookBytes(populate: (sheet: ExcelJS.Worksheet, workbook: ExcelJS.Workbook) => void) {
  const workbook = new ExcelJS.Workbook();
  populate(workbook.addWorksheet("FASE 1"), workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

test("material schedule keeps title offsets, original descriptions, all fitting ports and zero amounts", () => {
  const { rows } = parse([["FASE 1 | ØVRIG MATERIELL"], [], [], [], [], header, copper,
    ["KRA.009.05 322 Pressfittingsystem Rustfritt T-Rør Varme", "", "18-18-15", "stk", "2", "Deler/utstyr (stk)"],
    ["Kobberrør", "35", "", "m", "0", "Rør"]]);
  assert.equal(rows[0].sourceRow, 7);
  assert.equal(rows[0].description, copper[0]);
  assert.equal(rows[1].fittingDimension, "18-18-15");
  assert.equal(rows[2].quantity, 0);
  assert.deepEqual(rows.map(row => row.issues), [[], [], []]);
});

test("localized quantities preserve decimals and reject negative, ambiguous and absent amounts", () => {
  for (const [value, expected] of [["1 234,5", 1234.5], ["2.75", 2.75], ["0", 0], ["1\u00a0234", 1234]] as const) assert.equal(parseMaterialQuantity(value), expected);
  for (const invalid of ["", "-4", "1,234.56", "=1+2", "Infinity", "1e10", "1000000001"]) assert.equal(parseMaterialQuantity(invalid), null);
});

test("bad rows remain visible; repeated headers and multiple sheets do not lose row identity", () => {
  const first = parse([header, ["Pump", "", "", "stk", "", ""], header, copper]);
  assert.equal(first.rows.length, 2);
  assert.match(first.rows[0].issues.join(" "), /Mängden/);
  const multi = parseMaterialSheets([{ name: "Info", rows: [{ number: 1, cells: ["Information"] }] },
    ...["FASE 1", "FASE 2"].map(name => ({ name, rows: [{ number: 3, cells: header }, { number: 4, cells: copper }] }))]);
  assert.equal(new Set(multi.rows.map(row => row.id)).size, 2);
  assert.match(multi.warnings[0], /Info/);
});

test("rejects missing headers, duplicate columns and oversized schedules", () => {
  assert.throws(() => parse([copper]), /Ingen materiallista/);
  assert.throws(() => parse([[...header, "Mengde"], copper]), /flera gånger/);
  assert.throws(() => parse([header, ...Array.from({ length: 1001 }, () => copper)]), /fler än 1000/);
});

test("real xlsx reads rich text, formulas, decimal amounts and every sheet", async () => {
  const bytes = await workbookBytes((sheet, workbook) => {
    sheet.addRow(["FASE 1 | ØVRIG MATERIELL"]); sheet.addRow([]); sheet.addRow(header); sheet.addRow(copper);
    sheet.getCell("A4").value = { richText: [{ text: "Kobber" }, { text: "rør" }] };
    sheet.getCell("E4").value = { formula: "SUM(30,48)", result: 78 };
    const second = workbook.addWorksheet("FASE 2"); second.addRow(header); second.addRow(["T-rør", "", "18-18-15", "stk", "2,5", "Deler"]);
  });
  const result = await readMaterialWorkbook(bytes, "materials.xlsx");
  assert.equal(result.rows[0].description, "Kobberrør");
  assert.equal(result.rows[0].quantity, 78);
  assert.equal(result.rows[1].quantity, 2.5);
  assert.match(result.warnings.join(" "), /sparade resultat/);
});

test("formulas without cached results and Excel errors cannot silently create searchable rows", async () => {
  const bytes = await workbookBytes(sheet => { sheet.addRow(header); sheet.addRow(copper); sheet.getCell("E2").value = { formula: "1+2" };
    sheet.addRow(copper); sheet.getCell("E3").value = { error: "#VALUE!" }; });
  const { rows } = await readMaterialWorkbook(bytes, "formulas.xlsx");
  assert.match(rows[0].issues.join(" "), /saknar ett sparat resultat/);
  assert.match(rows[1].issues.join(" "), /Excel-fel/);
});

test("workbook input rejects wrong format, corrupt archives and excessive declared inflation", async () => {
  assert.throws(() => validateMaterialWorkbook(new Uint8Array(10), "old.xls"), /xlsx/);
  assert.throws(() => validateMaterialWorkbook(new Uint8Array(10), "fake.xlsx"), /läsbar/);
  assert.throws(() => validateMaterialWorkbook(new Uint8Array(6 * 1024 * 1024), "big.xlsx"), /5 MB/);
  const bytes = await workbookBytes(sheet => { sheet.addRow(header); sheet.addRow(copper); });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at < bytes.length - 46; at++) if (view.getUint32(at, true) === 0x02014b50) { view.setUint32(at + 24, 30 * 1024 * 1024, true); break; }
  assert.throws(() => validateMaterialWorkbook(bytes, "huge.xlsx"), /för stor/);
});

test("request validation never accepts arbitrary requirements and bounds text", () => {
  assert.throws(() => validateMaterialSearchInput(null), /saknas/);
  assert.throws(() => validateMaterialSearchInput({ ...input, description: "x".repeat(2001) }), /för långt/);
  assert.throws(() => validateMaterialSearchInput({ ...input, dimensionKind: "guessed" }), /måttyp/);
  assert.deepEqual(validateMaterialSearchInput({ ...input, effectiveRequirements: { forged: true } }), input);
});

test("search strips classification codes, retains fitting tuples and never invents DN", () => {
  assert.equal(materialSearchQuery(input), "Kobberrør 15");
  assert.equal(materialSearchQuery({ ...input, dimensionKind: "dn" }), "Kobberrør DN15");
  const tee = { ...input, description: "KRA.009.05 322 Pressfittingsystem Rustfritt T-Rør Varme", dimension: "", fittingDimension: "18-18-15" };
  assert.match(materialSearchQuery(tee), /18-18-15$/);
  assert.doesNotMatch(JSON.stringify(materialRequirement(input)), /"DN"/);
  assert.match(JSON.stringify(materialRequirement({ ...input, dimensionKind: "outside" })), /Ytterdiameter/);
});

test("fitting evaluation retains all ports and handles unknown measure systems conservatively", () => {
  const tee = { ...input, fittingDimension: "18-18-15", dimensionKind: "outside" as const };
  assert.equal(fittingDimensionCheck(tee, "T-rør 18 x 18 x 15 mm").conflict, false);
  assert.equal(fittingDimensionCheck(tee, "T-rør 18 x 18 x 18 mm").conflict, true);
  assert.equal(fittingDimensionCheck({ ...tee, dimensionKind: "unspecified" }, "T-rør 18 x 18 x 18 mm").conflict, false);
  assert.match(fittingDimensionCheck(tee, "T-rør").warnings.join(" "), /Alla anslutningsmått/);
});

const candidate: AhlsellPublicCandidate = { articleNumber: "5002206", productName: "Kobberrør", manufacturer: "", productUrl: "https://www.ahlsell.no/products/test/5002206", specifications: [], source: "catalog_search" };
const fakeSearch = async () => ({ candidates: [candidate], query: "Kobberrør 15", queries: ["Kobberrør 15"], searchUrl: "https://www.ahlsell.no/search?q=kobber", searchUrls: [], total: 1, truncated: false });

test("catalog hits without page identity remain unselectable; supplier outage is not a no-match", async () => {
  const result = await matchMaterialRow(input, {}, { search: fakeSearch, details: async () => ({}) });
  assert.equal(result.candidates[0].identityVerified, false);
  assert.equal(canSelectMaterialCandidate(result.candidates[0]), false);
  assert.equal(result.partial, true);
  await assert.rejects(matchMaterialRow(input, {}, { search: async () => { throw new Error("supplier unavailable"); } }), /supplier unavailable/);
});

test("verified exact page identity permits manual review but never automatically selects", async () => {
  const result = await matchMaterialRow(input, {}, { search: fakeSearch, details: async () => ({ "5002206": {
    articleNumber: "5002206", subtitle: "15 x 1.0mm kobberrør", specifications: [],
    snapshot: { version: AHLSELL_EVIDENCE_VERSION, articleNumber: "5002206", sourceUrl: candidate.productUrl, retrievedAt: new Date().toISOString(), productName: "Kobberrør", subtitle: "15 x 1.0mm kobberrør", description: null, specifications: [] },
  } }) });
  assert.equal(result.candidates[0].identityVerified, true);
  assert.equal("selected" in result, false);
  assert.match(result.warnings.join(" "), /måttsystem/);
  assert.equal(canSelectMaterialCandidate({ ...result.candidates[0], conflict: true }), false);
});

test("aborted requests stop before supplier access", async () => {
  const controller = new AbortController(); controller.abort();
  let searched = false;
  await assert.rejects(matchMaterialRow(input, { signal: controller.signal }, { search: async () => { searched = true; return fakeSearch(); } }), /abort/i);
  assert.equal(searched, false);
});

test("documented pipe outside diameter conflicts are blocked even when the search ranked them first", async () => {
  const result = await matchMaterialRow({ ...input, dimensionKind: "outside" }, {}, { search: fakeSearch, details: async () => {
    const snapshot: AhlsellEvidenceSnapshot = { version: AHLSELL_EVIDENCE_VERSION, articleNumber: candidate.articleNumber, sourceUrl: candidate.productUrl,
      retrievedAt: new Date().toISOString(), productName: "Kobberrør", subtitle: "28 x 1.5 mm kobberrør", description: null,
      specifications: ["Ytre rørdiameter: 28 mm", "Materiale: Kobber"] };
    return { [candidate.articleNumber]: { ...snapshot, description: undefined, snapshot, technicalEvidence: buildAhlsellTechnicalEvidence(snapshot) } };
  } });
  assert.equal(result.candidates[0].conflict, true);
  assert.equal(canSelectMaterialCandidate(result.candidates[0]), false);
});

test("an exact pipe heading can reject a wrong diameter without a technical table", () => {
  const row = { ...input, dimensionKind: "outside" as const };
  assert.equal(pipeHeaderDimensionCheck(row, "76.1x2.0mm CuNi pipe 90/10").conflict, true);
  assert.equal(pipeHeaderDimensionCheck(row, "15 x 1.0 mm kobberrør").conflict, false);
  assert.equal(pipeHeaderDimensionCheck({ ...row, dimensionKind: "dn" }, "21.3x2.0mm stålrør").conflict, false);
});

test("export separates proposals from choices, preserves zero/error rows and writes text instead of formulas", async () => {
  const { rows } = parse([header, copper, ["=HYPERLINK(\"https://invalid\")", "", "", "stk", "0", ""], ["Pump", "", "", "stk", "oops", ""]]);
  const reviews = Object.fromEntries(rows.map(row => [row.id, initialMaterialReview(row)]));
  const proposed = { articleNumber: candidate.articleNumber, productName: candidate.productName, productUrl: candidate.productUrl, subtitle: "15mm", warnings: [], specifications: [], identityVerified: true, conflict: false };
  reviews[rows[0].id] = { ...reviews[rows[0].id], status: "review", result: { candidates: [proposed], warnings: ["Kontrollera mått"], searchUrl: "", partial: false } };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportMaterialWorkbook(rows, reviews) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell("J2").value, "");
  assert.equal(sheet.getCell("M2").value, "5002206");
  assert.equal(sheet.getCell("G3").value, 0);
  assert.equal(sheet.getCell("C3").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("G4").value, "oops");
  reviews[rows[0].id] = { ...reviews[rows[0].id], status: "selected", selected: proposed };
  await workbook.xlsx.load(await exportMaterialWorkbook(rows, reviews) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  assert.equal(workbook.worksheets[0].getCell("J2").value, "5002206");
});
