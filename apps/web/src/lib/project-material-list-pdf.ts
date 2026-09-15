import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage
} from "pdf-lib";
import type {
  MaterialListProject,
  ProjectMaterialRow
} from "@/lib/project-material-list-export";

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 32;
const TABLE_BOTTOM = 42;
const CELL_FONT_SIZE = 7.6;
const LINE_HEIGHT = 9.5;

type PdfColumn = {
  label: string;
  width: number;
  value: (row: ProjectMaterialRow) => string;
};

const columns: PdfColumn[] = [
  { label: "PDF-post", width: 54, value: (row) => row.postNumber },
  { label: "Kapitelpost", width: 78, value: (row) => row.chapterPost },
  { label: "Åtgärd", width: 60, value: (row) => joinValues(row.operation, row.type) },
  { label: "Beskrivning från underlag", width: 185, value: (row) => joinValues(row.requirementCategory, row.nsCode || row.requirementKey, row.requirementValue) },
  { label: "Vald produkt", width: 130, value: (row) => joinValues(row.productName, row.manufacturer) },
  { label: "NRF-nummer", width: 78, value: (row) => row.productNumber },
  { label: "Antal", width: 42, value: (row) => formatQuantity(row.quantity) },
  { label: "Enhet", width: 34, value: (row) => row.unit },
  { label: "Anteckning", width: 117, value: (row) => row.notes }
];

export async function createProjectMaterialListPdf({
  organizationName,
  project,
  rows,
  generatedAt = new Date()
}: {
  organizationName: string;
  project: MaterialListProject;
  rows: ProjectMaterialRow[];
  generatedAt?: Date;
}) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle(`Projektsammanfattning - ${project.name}`);
  document.setAuthor("Scipx");
  document.setSubject("Projektets produktval, mängder och postnummer");
  document.setCreator("Scipx");
  document.setProducer("Scipx");
  document.setCreationDate(generatedAt);
  document.setModificationDate(generatedAt);

  let page = addPage(document, regular, bold, project, organizationName, generatedAt, true);
  let y = PAGE_HEIGHT - 126;

  drawTableHeader(page, bold, y);
  y -= 22;

  for (const row of rows) {
    const cells = columns.map((column) =>
      wrapText(pdfSafeText(column.value(row)) || "-", regular, CELL_FONT_SIZE, column.width - 8)
    );
    const rowHeight = Math.max(24, Math.max(...cells.map((lines) => lines.length)) * LINE_HEIGHT + 9);

    if (y - rowHeight < TABLE_BOTTOM) {
      page = addPage(document, regular, bold, project, organizationName, generatedAt, false);
      y = PAGE_HEIGHT - 70;
      drawTableHeader(page, bold, y);
      y -= 22;
    }

    drawTableRow(page, regular, row, cells, y, rowHeight);
    y -= rowHeight;
  }

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    const footer = `Scipx - Sida ${index + 1} av ${pages.length}`;
    currentPage.drawText(footer, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(footer, 7.5),
      y: 18,
      size: 7.5,
      font: regular,
      color: rgb(0.35, 0.4, 0.47)
    });
  });

  return document.save();
}

function addPage(
  document: PDFDocument,
  regular: PDFFont,
  bold: PDFFont,
  project: MaterialListProject,
  organizationName: string,
  generatedAt: Date,
  firstPage: boolean
) {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 54,
    width: PAGE_WIDTH,
    height: 54,
    color: rgb(0, 0.45, 0.71)
  });
  page.drawText(firstPage ? "SCIPX - PROJEKTSAMMANFATTNING" : `SCIPX - ${pdfSafeText(project.name)}`, {
    x: MARGIN,
    y: PAGE_HEIGHT - 35,
    size: firstPage ? 17 : 13,
    font: bold,
    color: rgb(1, 1, 1)
  });

  if (firstPage) {
    const details = [
      pdfSafeText(project.name),
      project.project_number ? `Projekt ${pdfSafeText(project.project_number)}` : null,
      pdfSafeText(project.customer_name ?? organizationName),
      `Exporterad ${generatedAt.toISOString().slice(0, 10)}`
    ].filter(Boolean).join("  |  ");
    page.drawText(details, {
      x: MARGIN,
      y: PAGE_HEIGHT - 76,
      size: 9,
      font: bold,
      color: rgb(0.08, 0.15, 0.24)
    });
    page.drawText("Kontrollera NRF-nummer, antal, pris och tillgänglighet före beställning.", {
      x: MARGIN,
      y: PAGE_HEIGHT - 94,
      size: 8.5,
      font: regular,
      color: rgb(0.6, 0.2, 0.06)
    });
  }
  return page;
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number) {
  page.drawRectangle({
    x: MARGIN,
    y: y - 18,
    width: columns.reduce((sum, column) => sum + column.width, 0),
    height: 20,
    color: rgb(0.18, 0.43, 0.69)
  });
  let x = MARGIN;
  for (const column of columns) {
    page.drawText(column.label, {
      x: x + 4,
      y: y - 12,
      size: 7.5,
      font: bold,
      color: rgb(1, 1, 1)
    });
    x += column.width;
  }
}

function drawTableRow(
  page: PDFPage,
  regular: PDFFont,
  row: ProjectMaterialRow,
  cells: string[][],
  y: number,
  rowHeight: number
) {
  const fill = row.type === "Demontering"
    ? rgb(1, 0.96, 0.86)
    : row.type === "Ej produktvald"
      ? rgb(1, 0.93, 0.93)
      : row.type === "Tillbehör"
        ? rgb(0.94, 0.97, 1)
        : rgb(1, 1, 1);
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  page.drawRectangle({
    x: MARGIN,
    y: y - rowHeight,
    width: totalWidth,
    height: rowHeight,
    color: fill,
    borderColor: rgb(0.8, 0.84, 0.88),
    borderWidth: 0.5
  });

  let x = MARGIN;
  cells.forEach((lines, columnIndex) => {
    if (columnIndex > 0) {
      page.drawLine({
        start: { x, y },
        end: { x, y: y - rowHeight },
        thickness: 0.35,
        color: rgb(0.86, 0.89, 0.92)
      });
    }
    lines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x: x + 4,
        y: y - 12 - lineIndex * LINE_HEIGHT,
        size: CELL_FONT_SIZE,
        font: regular,
        color: rgb(0.08, 0.12, 0.18)
      });
    });
    x += columns[columnIndex]!.width;
  });
}

function wrapText(value: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const paragraphs = value.split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0]!;
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines.length ? lines : ["-"];
}

function pdfSafeText(value: string) {
  return value
    .replace(/[–—−]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/×/g, "x")
    .replace(/→/g, "->")
    .replace(/•/g, "-")
    .replace(/[^\x0A\x0D\x20-\x7E\xA0-\xFF\u20AC]/g, "?");
}

function formatQuantity(value: number | null) {
  if (value === null) return "Saknas";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function joinValues(...values: string[]) {
  return values.filter(Boolean).join("\n");
}
