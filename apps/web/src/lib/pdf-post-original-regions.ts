import { pdfPostColumnBounds } from "../modules/technical-description-extractor/post-inventory";

export type PdfSourceRegion = { top: number; bottom: number; kind: "header" | "post" | "page" };

/** Clip only a unique, independently located post. Uncertain and scanned pages
 * remain whole; no text, formatting, image or table is reconstructed. */
export function originalPdfPostRegions(items: readonly unknown[], postNumber: string | null, continuation: boolean,
  pageTop: number, pageBottom: number, rotation = 0): { regions: PdfSourceRegion[]; wholePage: boolean } {
  const whole = { regions: [{ top: pageTop, bottom: pageBottom, kind: "page" as const }], wholePage: true };
  if (rotation % 360 !== 0 || !postNumber) return whole;
  const layout = pdfPostColumnBounds(items);
  if (!layout) return whole;
  const matches = layout.posts.filter(post => post.postNumber === postNumber.replace(/\.$/, ""));
  if (matches.length > 1) return whole;
  const post = matches[0];
  const top = post?.top ?? (continuation ? layout.header.bottom : null);
  const bottom = post?.bottom ?? (continuation ? layout.posts[0]?.top ?? layout.bodyBottom : null);
  if (top === null || bottom === null || top <= bottom + 3) return whole;
  const region = { top: Math.min(pageTop,top), bottom: Math.max(pageBottom,bottom), kind: "post" as const };
  if (region.top <= region.bottom) return whole;
  // A conservative glyph box catches a tall heading or a tightly spaced last
  // line crossing a crop boundary. Show the whole page rather than clip text.
  const cutsText = (boundary: number) => items.some(value => {
    const item = value as {str?: string; transform?: number[]; height?: number};
    if (!item?.str?.trim() || !item.transform) return false;
    const y = item.transform[5], height = item.height || Math.abs(item.transform[3]) || 10;
    return y - height * .3 < boundary && y + height > boundary;
  });
  if (cutsText(region.top) || cutsText(region.bottom)) return whole;
  // Keep the actual column heading too. The body is otherwise an exact crop.
  const header = { top: Math.min(pageTop,layout.header.top), bottom: Math.max(pageBottom,layout.header.bottom), kind: "header" as const };
  if (cutsText(header.top) || cutsText(header.bottom)) return whole;
  return { regions: header.bottom >= region.top && header.top > header.bottom ? [header,region] : [region], wholePage: false };
}

export function originalPdfSourcePages(sourcePage: number | null, continuationPages: readonly number[] = []) {
  return [...new Set([...(sourcePage ? [sourcePage] : []), ...continuationPages])]
    .filter(page => Number.isInteger(page) && page > 0).sort((a,b)=>a-b);
}
