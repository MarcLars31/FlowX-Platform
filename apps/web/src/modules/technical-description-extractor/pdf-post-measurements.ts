import type { PriceTable } from "./pdf-price-columns";
import { pdfPostColumnBounds } from "./post-inventory";
import type { TechnicalDescriptionPage } from "./types";

export type PdfPostMeasurementCells = { postNumber: string | null; unit: string; quantity: string };

/** Read actual cells independently of the list of recognized purchasing units.
 * A readable header and ordered column boundaries are required. Description,
 * price and sum never count as quantity evidence. Null post means continuation. */
export function pdfPostMeasurementCells(input: readonly unknown[], tables?: readonly PriceTable[]): PdfPostMeasurementCells[] | undefined {
  const bounds = pdfPostColumnBounds(input);
  if (!bounds) return undefined;
  const items = input.flatMap(raw => {
    const item = raw as { str?: string; transform?: number[]; width?: number; height?: number } | null;
    if (!item?.str?.trim() || !item.transform) return [];
    return [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5],
      width: item.width ?? 0, height: item.height || Math.abs(item.transform[3]) || 10 }];
  });
  const header = items.find(item => /^Post\s*(?:nr|nummer)[.:]?$/i.test(item.text));
  if (!header) return undefined;
  const headers = items.filter(item => Math.abs(item.y - header.y) < 3);
  const unit = headers.find(item => /^(?:Enh|Enhet|Enhed)[.:]?$/i.test(item.text));
  const amount = headers.find(item => /^(?:Mengde|Mengd|Mängd|Antall|Antal)[.:]?$/i.test(item.text));
  const price = headers.find(item => /^(?:Pris|Enhetspris|[ÀÁA][ -]?pris)[.:]?$/i.test(item.text));
  const tableLayout = tables?.find(table => Math.abs(table.bounds.y0 + header.y) < header.height * 2);
  const unitColumn = tableLayout?.columns.find(column => column.role === "unit");
  const amountColumn = tableLayout?.columns.find(column => column.role === "quantity");
  const verifiedFinancialBoundary = amountColumn && tableLayout?.columns.some(column => ["price", "sum"].includes(column.role) && column.left >= amountColumn.right);
  if (!unit || !amount || unit.x + unit.width >= amount.x || (!verifiedFinancialBoundary && (!price || amount.x + amount.width >= price.x))) return undefined;
  const unitRight = unitColumn?.right ?? (unit.x + unit.width + amount.x) / 2;
  const amountRight = amountColumn?.right ?? (amount.x + amount.width + price!.x) / 2;
  const cells = items.filter(item => item.x >= (unitColumn?.left ?? unit.x - unit.height) && item.x < amountRight
    && item.y < bounds.header.bottom && item.y > bounds.bodyBottom);
  const bands = [{ postNumber: null, top: bounds.header.bottom, bottom: bounds.posts[0]?.top ?? bounds.bodyBottom }, ...bounds.posts];
  return bands.map(band => {
    const body = cells.filter(item => item.y <= band.top && item.y > band.bottom);
    function text(left: number, right: number) {
      const rows: Array<{ y: number; cells: typeof cells }> = [];
      for (const cell of body.filter(item => item.x >= left && item.x < right).sort((a,b) => b.y-a.y || a.x-b.x)) {
        let row = rows.find(row => Math.abs(row.y-cell.y) < 5);
        if (!row) { row = { y: cell.y, cells: [] }; rows.push(row); }
        row.cells.push(cell);
      }
      return rows.map(row => row.cells.sort((a,b) => a.x-b.x).map(cell => cell.text).join("")).join("\n");
    }
    return { postNumber: band.postNumber, unit: text(-Infinity, unitRight), quantity: text(unitRight, amountRight) };
  });
}

/** Never attach an ambiguous occurrence, or treat an unreadable image as empty. */
export function measuredPostColumns(pages: readonly TechnicalDescriptionPage[], post: { postNumber?: string; sourcePage: number; sourcePages?: number[] }) {
  if (!post.postNumber) return undefined;
  const cells: PdfPostMeasurementCells[] = [];
  for (const [index,number] of (post.sourcePages ?? [post.sourcePage]).entries()) {
    const page = pages.find(page => page.pageNumber === number);
    if (!page?.sourcePostColumns) return undefined;
    const matches = page.sourcePostColumns.filter(cell => cell.postNumber === post.postNumber);
    if (matches.length > 1 || (index === 0 && matches.length !== 1)) return undefined;
    const cell = matches[0] ?? page.sourcePostColumns.find(cell => cell.postNumber === null);
    if (!cell || (page.method === "ocr" && !cell.unit && !cell.quantity)) return undefined;
    cells.push(cell);
  }
  return { unit: cells.map(cell => cell.unit).filter(Boolean).join("\n"), quantity: cells.map(cell => cell.quantity).filter(Boolean).join("\n") };
}
