import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { initialMaterialReview, materialSearchQueries, materialSearchQuery, parseMaterialQuantity, parseMaterialSheets, validateMaterialSearchInput, type MaterialSearchInput } from "./material-import";
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

test("catalog hits retain identity uncertainty as information; supplier outage is not a no-match", async () => {
  const result = await matchMaterialRow(input, {}, { search: fakeSearch, details: async () => ({}) });
  assert.equal(result.candidates[0].identityVerified, false);
  assert.ok(result.candidates[0].warnings.length > 0);
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
});

test("aborted requests stop before supplier access", async () => {
  const controller = new AbortController(); controller.abort();
  let searched = false;
  await assert.rejects(matchMaterialRow(input, { signal: controller.signal }, { search: async () => { searched = true; return fakeSearch(); } }), /abort/i);
  assert.equal(searched, false);
});

test("documented pipe outside diameter conflicts remain visible even when the search ranked them first", async () => {
  const result = await matchMaterialRow({ ...input, dimensionKind: "outside" }, {}, { search: fakeSearch, details: async () => {
    const snapshot: AhlsellEvidenceSnapshot = { version: AHLSELL_EVIDENCE_VERSION, articleNumber: candidate.articleNumber, sourceUrl: candidate.productUrl,
      retrievedAt: new Date().toISOString(), productName: "Kobberrør", subtitle: "28 x 1.5 mm kobberrør", description: null,
      specifications: ["Ytre rørdiameter: 28 mm", "Materiale: Kobber"] };
    return { [candidate.articleNumber]: { ...snapshot, description: undefined, snapshot, technicalEvidence: buildAhlsellTechnicalEvidence(snapshot) } };
  } });
  assert.equal(result.candidates[0].conflict, true);
  assert.ok(result.candidates[0].warnings.length > 0);
});

test("an exact pipe heading can flag a wrong diameter without a technical table", () => {
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


test("compressed-air valve searches strip project wording without losing the source requirement", () => {
  const valve = { ...input, description: "SMB.003.04 3454 Stengeventil Teknisk Trykkluft Kuleventil 22mm", dimension: "22", unit: "stk", category: "Deler" };
  const before = structuredClone(valve);
  assert.deepEqual(materialSearchQueries(valve), ["kuleventil trykkluft 22", "kuleventil 22", "Stengeventil Teknisk Trykkluft Kuleventil 22mm 22"]);
  assert.match(String(materialRequirement(valve).value_text), /Teknisk Trykkluft Kuleventil 22mm/);
  assert.deepEqual(valve, before);
  assert.doesNotMatch(materialSearchQueries(valve).join(" "), /DN22/);
  assert.equal(materialSearchQueries({ ...valve, description: "Kuleventil DN20", dimension: "20" })[0], "kuleventil DN20");
});

test("search alternatives handle pipe roles, repeated ports, source ranges and unnamed sprinkler heads", () => {
  assert.equal(materialSearchQueries({ ...input, description: "Pressfittingsystem rustfritt_varme", dimension: "35" })[0], "stålrør rustfritt 35");
  const tee = { ...input, unit: "stk", description: "Pressfittingsystem Rustfritt T-Rør Varme", dimension: "", fittingDimension: "35-35-28" };
  assert.deepEqual(materialSearchQueries(tee), ["t-rør rustfritt press 35 28", "t-rør syrefast 35 28", "press Rustfritt T-Rør 35-35-28"]);
  assert.equal(tee.fittingDimension, "35-35-28");
  assert.equal(materialSearchQueries({ ...input, description: "PP - Avløpsrør Spillvann 32-50mm", dimension: "40" })[0], "rør PP 40");
  assert.equal(materialSearchQueries({ ...input, unit: "stk", description: 'Nedadrettet standard 1/2" SSP K80 QR Messing 68 grader', dimension: '1/2"' })[0], "sprinklerhode K80 QR 68");
  assert.deepEqual(materialSearchQueries({ ...input, unit: "stk", description: "Spesialprodukt for montering", dimension: "" }), ["Spesialprodukt", "Spesialprodukt for montering"]);
});

test("custom searches, exact articles and links never acquire automatic alternatives", async () => {
  for (const query of ["min egen ventil", "5670637", "https://www.ahlsell.no/products/test/5670637/"]) {
    assert.deepEqual(materialSearchQueries({ ...input, query }), [query]);
  }
  let lookedUp = "";
  const result = await matchMaterialRow({ ...input, query: "5670637" }, {}, {
    lookup: async options => { lookedUp = String(options.query); return { products: [], searchUrl: "https://www.ahlsell.no/search" }; },
    search: async () => { throw new Error("exact lookup must not broaden"); }, details: async () => ({})
  });
  assert.equal(lookedUp, "5670637");
  assert.deepEqual(result.queries, ["5670637"]);
});

test("broader catalogue results survive the old six-card cut while detail requests remain bounded", async () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ ...candidate, articleNumber: String(5002200 + index), productUrl: `https://www.ahlsell.no/products/test/${5002200 + index}` }));
  let detailCount = 0;
  let searchedQueries: string[] = [];
  const result = await matchMaterialRow(input, {}, {
    search: async options => {
      searchedQueries = options.queries;
      assert.equal(options.maxPages, 1);
      assert.equal(options.maxVariantFamilies, 3);
      return { ...await fakeSearch(), candidates: many, failedQueries: [options.queries[0]] };
    },
    details: async options => { detailCount = options.items.length; return {}; }
  });
  assert.equal(detailCount, 6);
  assert.equal(result.candidates.length, 24);
  assert.ok(result.candidates.some(item => item.articleNumber === many[12].articleNumber));
  assert.ok(searchedQueries.length > 1 && searchedQueries.length <= 3);
  assert.deepEqual(result.queries, searchedQueries);
  assert.equal(result.partial, true);
  assert.match(result.warnings.join(" "), /ofullständig/);
});

test("Excel export retains the actual automatic searches as well as the original row", async () => {
  const { rows } = parse([header, copper]);
  const review = initialMaterialReview(rows[0]);
  const queries = materialSearchQueries(review.input);
  review.result = { candidates: [], queries, warnings: [], searchUrl: "", partial: false };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportMaterialWorkbook(rows, { [rows[0].id]: review }) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  assert.equal(workbook.worksheets[0].getCell("C2").value, copper[0]);
  assert.equal(workbook.worksheets[0].getCell("S2").value, queries.join("\n"));
});


test("matching dimensions outside the first six hits are prioritized for page verification", async () => {
  const many = Array.from({ length: 8 }, (_, index) => ({ ...candidate, articleNumber: String(5002300 + index),
    productUrl: `https://www.ahlsell.no/products/test/${5002300 + index}`, subtitle: `${index === 7 ? 15 : 28} x 1 mm kobberrør` }));
  let requested: string[] = [];
  const result = await matchMaterialRow({ ...input, dimensionKind: "outside" }, {}, {
    search: async () => ({ ...await fakeSearch(), candidates: many }),
    details: async options => { requested = options.items.map(item => item.articleNumber); return {}; }
  });
  assert.equal(requested.length, 6);
  assert.equal(requested[0], many[7].articleNumber);
  assert.equal(result.candidates[0].articleNumber, many[7].articleNumber);
  assert.equal(result.candidates.length, 8);
});
