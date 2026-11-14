import ExcelJS from "exceljs";
import type { MaterialRow } from "./material-import";

export async function materialWorkbookFixture(rows: MaterialRow[]) {
  const workbook = new ExcelJS.Workbook();
  for (const row of rows) {
    const sheet = workbook.getWorksheet(row.sheet) ?? workbook.addWorksheet(row.sheet);
    sheet.getRow(1).values = ["Description", "Dimensjon", "Fittingdimensjon", "Enhet", "Mengde", "Kategori"];
    sheet.getRow(row.sourceRow).values = [row.description, row.dimension, row.fittingDimension, row.unit, row.quantity ?? row.quantityText, row.category];
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
