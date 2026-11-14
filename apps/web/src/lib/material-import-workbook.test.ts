import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { initialMaterialReview, type MaterialCandidate, type MaterialReview } from "./material-import";
import { exportMaterialWorkbook, readMaterialWorkbook } from "./material-import-workbook";

const header = ["Description", "Dimensjon", "Fittingdimensjon", "Enhet", "Mengde", "Kategori"];
const material = ["KRA.017 3322 Normaltykke Stålrør Sprinkler", 100, "", "m", 260, "Rør (m)"];
const selected: MaterialCandidate = { articleNumber: "0012345", productName: "Stålrør", subtitle: "DN100", productUrl: "https://www.ahlsell.no/products/test/0012345/",
  specifications: [], warnings: ["Kontrollera utförande"], identityVerified: true, conflict: false, score: 89 };
const load = async (bytes: Uint8Array) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
};

async function fixture() {
  const book = new ExcelJS.Workbook();
  book.creator = "Original author";
  const sheet = book.addWorksheet("Øvrig materiell");
  sheet.mergeCells("A1:G1"); sheet.getCell("A1").value = "FASE 1 | ØVRIG MATERIELL";
  sheet.getRow(1).height = 36;
  sheet.getCell("A1").font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17344B" } };
  sheet.views = [{ state: "frozen", ySplit: 6, topLeftCell: "A214", activeCell: "A227", zoomScale: 100 }];
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: "A1:G248", printTitlesRow: "1:6" };
  sheet.headerFooter = { oddFooter: "&LOriginal&C&P" };
  sheet.columns = [70, 22, 20, 12, 15, 24, 17].map(width => ({ width }));
  sheet.getRow(6).values = header;
  sheet.getRow(6).height = 28;
  sheet.getRow(6).eachCell(cell => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17344B" } };
    cell.alignment = { vertical: "middle" };
  });
  for (let row = 7; row <= 248; row++) {
    sheet.getRow(row).values = material;
    sheet.getRow(row).height = 18;
    sheet.getCell(`F${row}`).border = { bottom: { style: "thin", color: { argb: "FFD0D0D0" } } };
  }
  sheet.getCell("E18").value = { formula: "SUM(200,60)", result: 260 };
  sheet.getCell("E18").numFmt = "0.00";
  sheet.getCell("A20").note = "Original comment";
  sheet.getCell("B20").dataValidation = { type: "whole", operator: "between", formulae: [1, 200], allowBlank: true };
  sheet.getRow(19).hidden = true;
  sheet.autoFilter = "A6:F248";
  const info = book.addWorksheet("Information"); info.getCell("A1").value = "Bevara detta blad";
  info.getCell("G5").value = "Inte en materialrad";
  const second = book.addWorksheet("FASE 2", { state: "hidden" });
  second.getRow(3).values = header; second.getRow(4).values = material;
  second.getRow(6).values = header; second.getRow(8).values = material;
  second.mergeCells("A10:G10"); second.getCell("A10").value = "SUMMA";
  const source = new Uint8Array(await book.xlsx.writeBuffer());
  const { rows } = await readMaterialWorkbook(source, "Materielluttak.xlsx");
  const reviews: Record<string, MaterialReview> = Object.fromEntries(rows.map(row => [row.id, initialMaterialReview(row)]));
  return { source, rows, reviews };
}

test("NRF export preserves original layout, source rows, formulas and other sheets across a full schedule", async () => {
  const { source, rows, reviews } = await fixture();
  const original = source.slice();
  const before = await load(source);
  // Select all 242 rows on the main sheet. Other sheets stay unselected.
  for (const row of rows.filter(row => row.sheet === "Øvrig materiell")) reviews[row.id] = { ...reviews[row.id], selected: { ...selected, articleNumber: `00${row.sourceRow}` }, status: "selected", selectionMode: "automatic" };
  const after = await load(await exportMaterialWorkbook(source, rows, reviews));
  assert.deepEqual(source, original, "the uploaded bytes must not be changed");
  assert.equal(after.creator, before.creator);
  assert.deepEqual(after.worksheets.map(sheet => [sheet.name, sheet.state]), before.worksheets.map(sheet => [sheet.name, sheet.state]));
  for (const sheet of before.worksheets) {
    const output = after.getWorksheet(sheet.name)!;
    assert.equal(output.rowCount, sheet.rowCount);
    assert.deepEqual(output.model.merges, sheet.model.merges);
    assert.deepEqual(output.views, sheet.views);
    assert.deepEqual(output.pageSetup, sheet.pageSetup);
    assert.deepEqual(output.headerFooter, sheet.headerFooter);
    assert.deepEqual(output.autoFilter, sheet.autoFilter);
    for (let col = 1; col <= 6; col++) assert.equal(output.getColumn(col).width, sheet.getColumn(col).width);
    sheet.eachRow((row, number) => {
      assert.equal(output.getRow(number).height, row.height);
      assert.equal(output.getRow(number).hidden, row.hidden);
      for (let col = 1; col <= 6; col++) {
        const cell = row.getCell(col), copy = output.getCell(number, col);
        assert.deepEqual(copy.value, cell.value, `${sheet.name}!${cell.address}`);
        assert.deepEqual(copy.style, cell.style, `${sheet.name}!${cell.address} style`);
        assert.deepEqual(copy.note, cell.note);
        assert.deepEqual(copy.dataValidation, cell.dataValidation);
      }
    });
  }
  const output = after.getWorksheet("Øvrig materiell")!;
  assert.equal(output.getColumn(7).width, 17);
  assert.equal(output.getCell("G6").value, "NRF-nummer");
  assert.deepEqual(output.getCell("G6").fill, output.getCell("F6").fill);
  assert.deepEqual(output.getCell("G6").font, output.getCell("F6").font);
  for (let row = 7; row <= 248; row++) {
    const cell = output.getCell(`G${row}`);
    assert.equal(cell.value, `00${row}`);
    assert.equal(cell.type, ExcelJS.ValueType.String);
    assert.equal(cell.numFmt, "@");
  }
  assert.equal(output.columnCount, 7);
  assert.equal(after.getWorksheet("FASE 2")!.getCell("G3").value, "NRF-nummer");
  assert.equal(after.getWorksheet("FASE 2")!.getCell("G6").value, "NRF-nummer");
  assert.equal(after.getWorksheet("FASE 2")!.getCell("G4").value, null);
  assert.equal(after.getWorksheet("FASE 2")!.getCell("A10").value, "SUMMA");
  assert.equal(after.getWorksheet("Information")!.getCell("G5").value, "Inte en materialrad");
});

test("repeated exports reflect removal and replacement of choices without carrying stale G values", async () => {
  const { source, rows, reviews } = await fixture();
  const row = rows[0];
  reviews[row.id].selected = selected;
  const first = await exportMaterialWorkbook(source, rows, reviews);
  assert.equal((await load(first)).worksheets[0].getCell("G7").value, "0012345");
  reviews[row.id].selected = undefined;
  reviews[row.id].result = { candidates: [selected], partial: false, warnings: [], searchUrl: "" };
  const cleared = await load(await exportMaterialWorkbook(first, rows, reviews));
  assert.equal(cleared.worksheets[0].getCell("G7").value, null);
  reviews[row.id].selected = { ...selected, articleNumber: "=1+1" };
  const replaced = await load(await exportMaterialWorkbook(source, rows, reviews));
  assert.equal(replaced.worksheets[0].getCell("G7").value, "=1+1");
  assert.equal(replaced.worksheets[0].getCell("G7").type, ExcelJS.ValueType.String);
});

test("G export does not overwrite a source material column or a merged cell's master", async () => {
  const { source, rows, reviews } = await fixture();
  const workbook = await load(source);
  const sheet = workbook.worksheets[0];
  sheet.getCell("F6").value = null; sheet.getCell("G6").value = "Kategori";
  const occupied = new Uint8Array(await workbook.xlsx.writeBuffer());
  await assert.rejects(exportMaterialWorkbook(occupied, rows, reviews), /Kolumn G.*materialfält/);
  sheet.getCell("F6").value = "Kategori"; sheet.getCell("G6").value = null;
  sheet.mergeCells("F6:G6");
  await assert.rejects(exportMaterialWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()), rows, reviews), /sammanfogad|flera gånger/);
  const section = rows.find(row => row.sheet === "FASE 2" && row.sourceRow === 10)!;
  reviews[section.id].selected = selected;
  await assert.rejects(exportMaterialWorkbook(source, rows, reviews), /G10.*sammanfogad/);
});
