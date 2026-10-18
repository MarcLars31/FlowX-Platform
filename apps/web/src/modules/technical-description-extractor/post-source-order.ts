import { pagePostInventory } from "./post-inventory";
import type { TechnicalDescriptionMaterialLine, TechnicalDescriptionPage } from "./types";

/** Use source occurrences, including repeated identifiers, before any numeric
 * fallback. Recovered posts return to their physical position on the page. */
export function sortMaterialLinesBySource(pages: TechnicalDescriptionPage[], lines: TechnicalDescriptionMaterialLine[]) {
  const positions = new Map<TechnicalDescriptionMaterialLine, number>();
  for (const page of pages) {
    const posts = pagePostInventory(page).posts;
    const used = new Set<number>();
    const text = page.text.replace(/\s+/g, " ");
    for (const line of lines.filter(line => line.sourcePage === page.pageNumber)) {
      const index = posts.findIndex((post, index) => !used.has(index) && post.postNumber === line.postNumber);
      if (index >= 0) { used.add(index); positions.set(line, index * 2); continue; }
      const start = text.indexOf(line.sourceText.split(/\r?\n/)[0].replace(/\s+/g, " "));
      const next = posts.findIndex(post => text.indexOf(post.postNumber) > start);
      positions.set(line, start >= 0 ? (next < 0 ? posts.length * 2 : next * 2 - 1) : Infinity);
    }
  }
  lines.sort((a, b) => a.sourcePage - b.sourcePage || (positions.get(a) ?? Infinity) - (positions.get(b) ?? Infinity));
}
