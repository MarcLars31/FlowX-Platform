import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/export-victaulic-sprinkler-catalog.mjs <input.xlsx> <output.json>");
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheet = workbook.worksheets.getItem("sprinkler_head");
const usedRange = sheet.getUsedRange();
if (!usedRange) throw new Error("The sprinkler_head sheet is empty");
const usedRows = usedRange.values;
const headers = usedRows[3].map((value) => String(value ?? "").trim());

const requiredHeaders = [
  "Article number",
  "Product description",
  "Model",
  "Nominal size",
  "DN values",
  "K factor (Ahlsell)",
  "Temperature C",
  "Response",
  "Orientation",
  "Mount",
  "Head construction",
  "Coverage",
  "Finish",
  "Material",
  "Data status",
  "Review flags",
  "Source descriptions",
  "Manufacturer",
  "Official family",
  "K factor imperial",
  "K factor SI",
  "Official connection",
  "Official response",
  "Official orientation",
  "Official mount options",
  "Application / hazard",
  "System condition",
  "Spray angle deg",
  "Matching aliases",
  "Victaulic publication",
  "Victaulic source URL",
  "Victaulic verification",
];

for (const header of requiredHeaders) {
  if (!headers.includes(header)) throw new Error(`Missing workbook column: ${header}`);
}

const column = new Map(headers.map((header, index) => [header, index]));
const value = (row, header) => row[column.get(header)];
const text = (row, header) => {
  const raw = value(row, header);
  return raw === null || raw === undefined || raw === "" ? null : String(raw).trim();
};
const number = (row, header) => {
  const raw = value(row, header);
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number in ${header}: ${raw}`);
  return parsed;
};

const products = usedRows.slice(4)
  .filter((row) => text(row, "Article number"))
  .map((row) => ({
  articleNumber: text(row, "Article number"),
  productDescription: text(row, "Product description"),
  model: text(row, "Model"),
  nominalSize: text(row, "Nominal size"),
  dn: number(row, "DN values"),
  kFactorCatalog: number(row, "K factor (Ahlsell)"),
  temperatureC: number(row, "Temperature C"),
  response: text(row, "Response"),
  orientation: text(row, "Orientation"),
  mount: text(row, "Mount"),
  headConstruction: text(row, "Head construction"),
  coverage: text(row, "Coverage"),
  finish: text(row, "Finish"),
  material: text(row, "Material"),
  dataStatus: text(row, "Data status"),
  reviewFlags: text(row, "Review flags"),
  sourceDescriptions: text(row, "Source descriptions"),
  manufacturer: text(row, "Manufacturer"),
  officialFamily: text(row, "Official family"),
  kFactorImperial: number(row, "K factor imperial"),
  kFactorSi: number(row, "K factor SI"),
  officialConnection: text(row, "Official connection"),
  officialResponse: text(row, "Official response"),
  officialOrientation: text(row, "Official orientation"),
  officialMountOptions: text(row, "Official mount options"),
  applicationHazard: text(row, "Application / hazard"),
  systemCondition: text(row, "System condition"),
  sprayAngleDeg: number(row, "Spray angle deg"),
  matchingAliases: (text(row, "Matching aliases") ?? "")
    .split("|")
    .map((alias) => alias.trim())
    .filter(Boolean),
  victaulicPublication: text(row, "Victaulic publication"),
  victaulicSourceUrl: text(row, "Victaulic source URL"),
  victaulicVerification: text(row, "Victaulic verification"),
  }));

if (products.length === 0) throw new Error("No catalog products were found");
if (products.some((product) => !product.articleNumber || !product.productDescription || !product.model)) {
  throw new Error("Every catalog row must contain article number, description and model");
}
const articleNumbers = products.map((product) => product.articleNumber);
if (new Set(articleNumbers).size !== articleNumbers.length) throw new Error("Duplicate article numbers in catalog");
const exactSinCount = products.filter((product) => product.victaulicVerification === "Verified by exact SIN").length;
const sourceSha256 = createHash("sha256")
  .update(await fs.readFile(inputPath))
  .digest("hex")
  .toUpperCase();

const output = {
  schemaVersion: 1,
  catalogVersion: "2026-09-04",
  sourceWorkbook: "Ahlsell_sprinkler_head_Victaulic_verified.xlsx",
  sourceSheet: "sprinkler_head",
  sourceSha256,
  rowCount: products.length,
  exactSinCount,
  products,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, rows: products.length, exactSinCount }));
