import type { TechnicalDescriptionMaterialLine, TechnicalDescriptionPage } from "./types";

type PdfPost = Pick<TechnicalDescriptionMaterialLine, "postNumber" | "sourcePage" | "sourcePages">;

/** Original description-column text, excluding only rows inserted by the
 * verified table reader from the separate unit/quantity columns. Equal-looking
 * quantities in the description remain untouched; text matching is not used. */
export function pdfPostDescriptionText(
  pages: readonly TechnicalDescriptionPage[],
  post: PdfPost
): string | undefined {
  if (!post.postNumber) return undefined;
  const parts: string[] = [];
  for (const [index, pageNumber] of (post.sourcePages ?? [post.sourcePage]).entries()) {
    const table = pages.find(page => page.pageNumber === pageNumber)?.postTable;
    if (!table?.quantityColumnsVerified || table.quantityColumnsUnrecognized) return undefined;
    const matches = table.posts.filter(item => item.postNumber === post.postNumber);
    if (matches.length > 1 || (index === 0 && matches.length !== 1)) return undefined;
    const start = matches[0]?.lineIndex ?? 0;
    const end = matches[0] ? table.posts.find(item => item.lineIndex > start)?.lineIndex : table.posts[0]?.lineIndex;
    const inserted = new Set(table.quantities.map(quantity => quantity.lineIndex));
    const body = table.text.split(/\r?\n/).slice(start, end)
      .filter((_line, offset) => !inserted.has(start + offset)).join("\n");
    if (body) parts.push(index === 0 ? body : `FORTSETTELSE SIDE ${pageNumber}\n${body}`);
  }
  return parts.join("\n\n") || undefined;
}

/** Display the physical cells, preserving empty RS amounts and original units.
 * Calculation quantities continue to use the normalized extraction fields. */
export function pdfPostColumnValues(pages: readonly TechnicalDescriptionPage[], post: PdfPost): TechnicalDescriptionMaterialLine["pdfColumnValues"] {
  if (!pdfPostDescriptionText(pages, post)) return undefined;
  const units: string[] = [], amounts: string[] = [];
  for (const pageNumber of post.sourcePages ?? [post.sourcePage]) {
    const table = pages.find(page => page.pageNumber === pageNumber)!.postTable!;
    const match = table.posts.find(item => item.postNumber === post.postNumber);
    const start = match?.lineIndex ?? 0;
    const end = match ? table.posts.find(item => item.lineIndex > start)?.lineIndex : table.posts[0]?.lineIndex;
    for (const cell of table.quantities.filter(item => item.lineIndex >= start && (end === undefined || item.lineIndex < end))) {
      if (typeof cell.sourceUnitText !== "string" || typeof cell.sourceAmountText !== "string") return undefined;
      units.push(cell.sourceUnitText);
      amounts.push(cell.sourceAmountText);
    }
  }
  return { unit: units.join("\n"), quantity: amounts.join("\n") };
}
