import { MATERIAL_IMPORT_MAX_BYTES, MATERIAL_IMPORT_MAX_ROWS, MaterialImportError, parseMaterialQuantity, type MaterialRow } from "./material-import";

export type RfqTextPage = { pageNumber: number; items: readonly unknown[] };
type CellText = { text: string; x: number; y: number; width: number; height: number; index: number };

function positionedItems(items: readonly unknown[]): CellText[] {
  return items.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const item = value as { str?: unknown; transform?: number[]; width?: number; height?: number };
    if (typeof item.str !== "string" || !item.str.trim() || !item.transform?.every(Number.isFinite)) return [];
    const [, , , , x, y] = item.transform;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{ text: item.str.normalize("NFKC"), x, y, width: item.width ?? 0, height: item.height ?? 0, index }];
  });
}

/** Join font fragments without breaking words, and retain wrapped cell text. */
function cellText(items: CellText[], reference = false): string {
  const ordered = [...items].sort((a, b) => Math.abs(a.y - b.y) < 1 ? a.x - b.x : b.y - a.y);
  let text = "";
  for (const [index, item] of ordered.entries()) {
    const previous = ordered[index - 1];
    const adjacent = previous && Math.abs(previous.y - item.y) < 1 && item.x - previous.x - previous.width < 1;
    const continuedReference = reference && previous && /[-/]$/.test(text.trimEnd());
    text += (text && !adjacent && !continuedReference ? " " : "") + item.text;
  }
  return text.replace(/\s+/g, " ").trim();
}

/** ShipServ emits each numbered row together, including centered multi-line cells.
 * Column geometry separates blank part numbers from descriptions. No prose, links,
 * PDF annotations or document instructions are executed or treated as product rows. */
export function parseRfqMaterialPages(pages: readonly RfqTextPage[]) {
  const rows: MaterialRow[] = [];
  const warnings: string[] = [];
  const allItems = pages.map(page => ({ ...page, cells: positionedItems(page.items) }));
  const documentText = allItems.flatMap(page => page.cells.map(cell => cell.text)).join(" ");
  if (!/SHIPSERV/i.test(documentText) || !/Request for Quotation/i.test(documentText)) {
    throw new MaterialImportError("PDF-formatet stöds inte. Välj en textbaserad ShipServ RFQ med kolumnerna Part Number, Description, UoM och Qty.");
  }
  for (const page of allItems) {
    const description = page.cells.find(cell => /^Description$/i.test(cell.text.trim()));
    const nearby = (pattern: RegExp) => page.cells.find(cell => pattern.test(cell.text.trim()) && description && Math.abs(cell.y - description.y) < 12);
    const number = nearby(/^#$/);
    const partType = nearby(/^Part(?:\s*Type)?$/i);
    const part = nearby(/^Part Number$/i);
    const supplier = nearby(/^Supplier Part(?:\s*No\.?)?$/i);
    const unit = nearby(/^UoM$/i);
    const quantity = nearby(/^Qty$/i);
    if (!description || !number || !partType || !part || !supplier || !unit || !quantity) {
      // The cover contains contacts and commercial terms, not order lines.
      if (page.pageNumber !== 1 || !/SHIPSERV.*(?:BUYER|SUPPLIER)/i.test(page.cells.map(cell => cell.text).join(" "))) {
        warnings.push(`Sida ${page.pageNumber} saknar en läsbar RFQ-tabell och har inte importerats. Kontrollera originalet; skannade sidor stöds inte.`);
      }
      continue;
    }
    const columns = [number.x, partType.x, part.x, supplier.x, description.x, unit.x, quantity.x];
    if (columns.some((x, index) => index > 0 && x <= columns[index - 1])) throw new MaterialImportError(`Kolumnerna på sida ${page.pageNumber} kunde inte identifieras säkert.`);
    const headerBottom = Math.min(number.y, partType.y, part.y, supplier.y, description.y, unit.y, quantity.y) - 6;
    const footer = page.cells.find(cell => /^Sent from\b/i.test(cell.text));
    const body = page.cells.filter(cell => cell.y < headerBottom && (!footer || cell.y > footer.y + 8));
    const anchors = body.filter(cell => cell.x >= number.x - 2 && cell.x < partType.x - 2 && /^\d+$/.test(cell.text.trim()));
    if (!anchors.length) warnings.push(`Sida ${page.pageNumber}: tabellrubriker hittades men inga läsbara materialrader. Kontrollera originalet.`);
    for (const [index, anchor] of anchors.entries()) {
      if (index > 0 && anchor.y >= anchors[index - 1].y) throw new MaterialImportError(`Radordningen på sida ${page.pageNumber} kunde inte läsas säkert.`);
      const cells = body.filter(cell => cell.index >= anchor.index && cell.index < (anchors[index + 1]?.index ?? Infinity));
      const field = (column: number, reference = false) => cellText(cells.filter(cell => cell.x >= columns[column] - 2 && cell.x < (columns[column + 1] ?? Infinity) - 2), reference);
      const descriptionText = field(4);
      const quantityText = field(6);
      const amount = parseMaterialQuantity(quantityText);
      const unitText = field(5);
      const issues: string[] = [];
      if (!descriptionText || descriptionText.length > 2000) issues.push("Beskrivningen saknas eller är för lång. Kontrollera PDF-raden.");
      if (!unitText || unitText.length > 30) issues.push("Enheten saknas eller är ogiltig.");
      if (amount === null) issues.push("Mängden saknas eller är ogiltig. Kontrollera Qty i originalet.");
      const partNumber = field(2, true);
      const supplierPartNumber = field(3, true);
      if (partNumber.length > 300 || supplierPartNumber.length > 300) issues.push("Artikelreferensen är för lång. Kontrollera PDF-raden.");
      rows.push({ id: `rfq:${page.pageNumber}:${anchor.text}:${index}`, sheet: "RFQ", sourceRow: rows.length + 2,
        description: descriptionText, dimension: "", fittingDimension: "", dimensionKind: "unspecified", unit: unitText,
        quantity: amount, quantityText, category: "", issues,
        rfqSource: { page: page.pageNumber, lineNumber: anchor.text.trim(), partType: field(1), partNumber, supplierPartNumber } });
      if (rows.length > MATERIAL_IMPORT_MAX_ROWS) throw new MaterialImportError(`Filen innehåller fler än ${MATERIAL_IMPORT_MAX_ROWS} rader. Dela upp den i mindre filer.`);
    }
  }
  if (!rows.length) throw new MaterialImportError("Inga RFQ-rader kunde läsas. Välj en textbaserad ShipServ-PDF; skannade PDF-filer behöver först texttolkas.");
  if (rows.some((row, index) => Number(row.rfqSource!.lineNumber) !== index + 1)) warnings.push("RFQ-radernas numrering innehåller luckor eller upprepningar. Alla lästa rader finns kvar; kontrollera listan mot originalet.");
  warnings.push("Artikelreferenser i RFQ:n är sökunderlag och är inte verifierade NRF-nummer. Kontrollera fabrikat, utförande och förpackningsstorlek mot förslagen. Antal följer Qty utan omräkning av förpackningar.");
  return { rows, warnings };
}

export function validateRfqPdf(bytes: Uint8Array, fileName: string) {
  if (!/\.pdf$/i.test(fileName) || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new MaterialImportError("Välj en giltig PDF-fil.");
  if (!bytes.length || bytes.length > MATERIAL_IMPORT_MAX_BYTES) throw new MaterialImportError("PDF-filen får vara högst 5 MB.");
}

/** PDF text stays in the browser; only reviewed material search inputs use the match API. */
export async function readRfqMaterialPdf(bytes: Uint8Array, fileName: string) {
  validateRfqPdf(bytes, fileName);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, maxImageSize: 16_777_216 });
  // Do not leave a password-protected upload waiting on PDF.js's password callback.
  const passwordRequired = new Promise<never>((_, reject) => {
    task.onPassword = () => reject(new MaterialImportError("PDF-filen är lösenordsskyddad. Välj en kopia utan lösenord."));
  });
  try {
    const document = await Promise.race([task.promise, passwordRequired]);
    if (document.numPages > 50) throw new MaterialImportError("PDF-filen får innehålla högst 50 sidor. Dela upp den i mindre filer.");
    const pages: RfqTextPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      try { pages.push({ pageNumber, items: (await page.getTextContent()).items }); }
      finally { page.cleanup(); }
    }
    return parseRfqMaterialPages(pages);
  } catch (error) {
    if (error instanceof MaterialImportError) throw error;
    throw new MaterialImportError("PDF-filen kunde inte läsas. Kontrollera att den är oskadad, textbaserad och utan lösenord.");
  } finally { await task.destroy(); }
}
