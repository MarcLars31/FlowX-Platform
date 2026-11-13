import ExcelJS from "exceljs";
import { MATERIAL_IMPORT_MAX_BYTES, MaterialImportError, materialRowStatus, parseMaterialSheets, type MaterialReview, type MaterialRow } from "./material-import";

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

export async function exportMaterialWorkbook(rows: MaterialRow[], reviews: Record<string, MaterialReview>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ScipX";
  const sheet = workbook.addWorksheet("Material med NRF");
  sheet.columns = [
    ["Källblad", 22], ["Källrad", 10], ["Description", 55], ["Dimensjon", 16], ["Fittingdimensjon", 21],
    ["Enhet", 10], ["Mengde", 13], ["Kategori", 24], ["Status", 24], ["Valt NRF / art.nr", 21],
    ["Vald produkt", 42], ["Vald produktlänk", 50], ["Förslag NRF / art.nr", 23], ["Föreslagen produkt", 42],
    ["Förslag produktlänk", 50], ["Kontrollpunkter / fel", 70], ["Måttyp", 18], ["Kompletterande krav", 45], ["Sökning", 45],
    ["Vald matchpoäng / 100", 23], ["Förslag matchpoäng / 100", 25], ["Vald måttjämförelse", 60], ["Förslag måttjämförelse", 60], ["Valsätt", 24],
  ].map(([header, width]) => ({ header: String(header), width: Number(width) }));
  for (const row of rows) {
    const review = reviews[row.id];
    if (!review) throw new MaterialImportError("Granskningsdata saknas för en materialrad.");
    // A failed repeat search retains the previous choice and exports the search error alongside it.
    const selected = review.selected;
    const proposed = review.result?.candidates.find(candidate => candidate.identityVerified && !candidate.conflict);
    const dimensionText = (candidate: typeof selected) => candidate?.dimensionMatch
      ? `Krav: ${candidate.dimensionMatch.expected} · Produkt: ${candidate.dimensionMatch.actual}. ${candidate.dimensionMatch.explanation}` : "";
    sheet.addRow([row.sheet, row.sourceRow, row.description, row.dimension, row.fittingDimension, row.unit,
      row.quantity ?? row.quantityText, row.category, materialRowStatus(row, review),
      selected?.articleNumber ?? "", selected ? [selected.productName, selected.subtitle].filter(Boolean).join(" · ") : "", selected?.productUrl ?? "",
      proposed?.articleNumber ?? "", proposed ? [proposed.productName, proposed.subtitle].filter(Boolean).join(" · ") : "", proposed?.productUrl ?? "",
      [...new Set([...row.issues, ...(review.result?.warnings ?? []), ...(selected?.warnings ?? proposed?.warnings ?? []), ...(review.error ? [review.error] : [])])].join("\n"),
      { unspecified: "Ej angivet", outside: "Ytterdiameter mm", dn: "DN" }[review.input.dimensionKind], review.input.details, review.result?.queries?.join("\n") ?? review.input.query,
      selected?.score ?? "", proposed?.score ?? "", dimensionText(selected), dimensionText(proposed),
      selected ? review.selectionMode === "automatic" ? "Automatiskt efter poäng" : "Manuellt" : "",
    ]);
  }
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 3 }];
  sheet.autoFilter = { from: "A1", to: `X${rows.length + 1}` };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17344B" } };
  sheet.getRow(1).height = 32;
  sheet.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; });
  sheet.getColumn(7).numFmt = "0.###";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
