import ExcelJS from "exceljs";
import { MATERIAL_IMPORT_MAX_BYTES, MaterialImportError, materialHeader, parseMaterialSheets, type MaterialReview, type MaterialRow } from "./material-import";

/** Reject oversized/unsupported ZIP containers before ExcelJS inflates a browser upload. */
export function validateMaterialWorkbook(bytes: Uint8Array, fileName: string) {
  if (!/\.xlsx$/i.test(fileName)) throw new MaterialImportError("Välj en .xlsx-fil. Spara äldre .xls-filer som .xlsx i Excel först.");
  if (!bytes.length || bytes.length > MATERIAL_IMPORT_MAX_BYTES) throw new MaterialImportError("Excel-filen får vara högst 5 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) { end = at; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw new MaterialImportError("Filen är inte en läsbar Excel-arbetsbok.");
  const entries = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  let at = view.getUint32(end + 16, true);
  if (entries > 1000 || at + centralSize !== end) throw new MaterialImportError("Arbetsboken är för komplex. Kopiera materiallistan till en ny .xlsx-fil.");
  let expanded = 0;
  let hasWorkbook = false;
  for (let i = 0; i < entries; i++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw new MaterialImportError("Excel-filen är skadad.");
    expanded += view.getUint32(at + 24, true);
    const length = view.getUint16(at + 28, true);
    const next = at + 46 + length + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (next > end || expanded > 25 * 1024 * 1024 || (view.getUint16(at + 8, true) & 1)) throw new MaterialImportError("Arbetsboken är för stor eller krypterad. Använd en mindre, oskyddad materiallista.");
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + length));
    if (name === "xl/workbook.xml") hasWorkbook = true;
    if (/vbaProject\.bin$/i.test(name)) throw new MaterialImportError("Makron stöds inte. Spara materiallistan som en vanlig .xlsx-fil.");
    at = next;
  }
  if (at !== end || !hasWorkbook) throw new MaterialImportError("Filen är inte en läsbar Excel-arbetsbok.");
}

export async function readMaterialWorkbook(bytes: Uint8Array, fileName: string) {
  validateMaterialWorkbook(bytes, fileName);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]); }
  catch { throw new MaterialImportError("Excel-filen kunde inte läsas. Kontrollera att den inte är skadad eller lösenordsskyddad."); }
  let formulas = false;
  const sheets = workbook.worksheets.map(sheet => {
    if (sheet.rowCount > 10000 || sheet.columnCount > 100) throw new MaterialImportError("Arbetsboken har för många rader eller kolumner. Kopiera materiallistan till en ny fil.");
    const rows: { number: number; cells: string[]; issues: string[] }[] = [];
    sheet.eachRow((row, number) => {
      const cells: string[] = [];
      const issues: string[] = [];
      for (let column = 1; column <= row.cellCount; column++) {
        const cell = row.getCell(column);
        let value = cell.value;
        if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
          formulas = true;
          value = value.result ?? null;
          if (value === null) issues.push(`Cell ${cell.address}: formeln saknar ett sparat resultat. Beräkna och spara filen i Excel.`);
        }
        if (value && typeof value === "object" && "error" in value) issues.push(`Cell ${cell.address}: Excel-fel ${value.error}.`);
        cells.push(value == null ? "" : typeof value === "object"
          ? "richText" in value ? value.richText.map(part => part.text).join("") : "text" in value ? value.text : cell.text
          : String(value));
      }
      rows.push({ number, cells, issues });
    });
    return { name: sheet.name, rows };
  });
  const result = parseMaterialSheets(sheets);
  if (formulas) result.warnings.push("Formler har lästs med sina sparade resultat. Beräkna och spara filen i Excel före import om värdena har ändrats.");
  for (const sheet of workbook.worksheets.filter(sheet => sheet.state !== "visible")) {
    result.warnings.push(`Det dolda bladet ”${sheet.name}” har också lästs.`);
  }
  return result;
}

/** Fill a fresh copy of the upload; never rebuild or renumber the material list. */
export async function exportMaterialWorkbook(source: Uint8Array, rows: MaterialRow[], reviews: Record<string, MaterialReview>) {
  validateMaterialWorkbook(source, "original.xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  // ExcelJS reads a default first page number even when the source leaves numbering automatic.
  // Its writer otherwise turns that default into a forced page restart on every sheet.
  for (const sheet of workbook.worksheets) {
    const setup = sheet.pageSetup as Partial<ExcelJS.PageSetup> & { useFirstPageNumber?: boolean };
    if (setup.useFirstPageNumber === false) delete setup.firstPageNumber;
  }
  const materialSheets = new Set(rows.map(row => row.sheet));
  for (const name of materialSheets) {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) throw new MaterialImportError(`Källbladet ”${name}” saknas i originalfilen. Läs in filen igen.`);
    sheet.eachRow(row => {
      const cells = Array.from({ length: row.cellCount }, (_, index) => row.getCell(index + 1).text);
      const header = materialHeader(cells);
      if (!header) return;
      if (Object.values(header).includes(6)) throw new MaterialImportError(`Kolumn G i ”${name}” innehåller ett materialfält. Flytta det till en annan kolumn i originalfilen och läs in filen igen så att G kan användas för NRF-nummer.`);
      const target = row.getCell(7);
      if (target.isMerged) throw new MaterialImportError(`Rubriken i kolumn G på ”${name}” är sammanfogad. Dela upp rubrikcellen i originalfilen och läs in filen igen.`);
      target.value = "NRF-nummer";
      target.style = structuredClone(row.getCell(6).style);
      target.numFmt = "@";
    });
    sheet.getColumn(7).width = Math.max(sheet.getColumn(7).width ?? sheet.properties.defaultColWidth ?? 9, 14);
  }
  for (const row of rows) {
    const review = reviews[row.id];
    if (!review) throw new MaterialImportError("Granskningsdata saknas för en materialrad.");
    const sheet = workbook.getWorksheet(row.sheet)!;
    const target = sheet.getCell(row.sourceRow, 7);
    // Section headings can span A:G. Never write through a merged cell into its title.
    if (target.isMerged) {
      if (review.selected) throw new MaterialImportError(`Cell G${row.sourceRow} i ”${row.sheet}” är sammanfogad. Dela upp cellen i originalfilen och läs in filen igen.`);
      continue;
    }
    if (!Object.keys(target.style).length) target.style = structuredClone(sheet.getCell(row.sourceRow, 6).style);
    // Keep actual choices, including a retained choice after a failed repeat search.
    // No proposal, status, score, URL or error is written into the source workbook.
    target.value = review.selected?.articleNumber ?? null;
    target.numFmt = "@";
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
