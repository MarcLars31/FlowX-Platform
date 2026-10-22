/** Navigation evidence comes from the physical page header, never from a
 * number/reference found in body text. Coordinates use the stored PDF/OCR
 * heading layout (top-to-bottom y in both extractors). */
export type ChapterCaption = { number: string; title: string };
export type ChapterPage = { document_id: string; page_number: number; heading_layout?: unknown };
export type PageChapter = { page: number; path: ChapterCaption[] };
type Line = { text: string; x: number; y: number; height: number };

/** Persist only the header region for navigation; full geometry remains in
 * heading_layout for extraction/audit and is not sent to the browser. */
export function compactChapterPageLayout(layout: unknown): { version: 1; lines: Line[] } {
  const input = layout as { lines?: Line[] } | undefined;
  const lines = (Array.isArray(input?.lines) ? input.lines : []).filter(line => Number.isFinite(line.y) && Number.isFinite(line.height)).sort((a,b) => a.y-b.y);
  const first = lines[0];
  return {version:1,lines:first ? lines.filter(line => line.y - first.y <= Math.max(first.height, 8) * 20) : []};
}

const address = /^((?:\d{1,6}[A-Z]?|[A-Z]\d*)(?:\.[\dA-Z]+)*)\s+(.+)$/u;
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
export function chapterCaptionPath(text: string): ChapterCaption[] {
  return text.replace(/^(?:Kapittel|Kapitel|Sted|Stasjon|Område|Avsnitt):\s*/i, "")
    .replace(/(?:\s+-)+\s*$/, "").split(/\s+[–—-]\s+(?=[\dA-Z]+(?:\.\d+)*\s)/u)
    .map(part => clean(part).match(address)).filter((match): match is RegExpMatchArray => Boolean(match))
    .map(match => ({ number: match[1], title: match[2] }))
    .filter(caption => /[A-Za-zÆØÅæøåÄÖäö]/.test(caption.title)
      && !/^(?:NS\s*3420|[A-Z]{2}\d[.\dA-Z]*\b|\d)/.test(caption.title));
}
export function chapterHeaderPages(pages: readonly ChapterPage[]): Map<string, PageChapter[]> {
  const result = new Map<string, PageChapter[]>();
  for (const page of pages) {
    const layout = page.heading_layout as { lines?: Line[] } | undefined;
    const lines = (Array.isArray(layout?.lines) ? layout.lines : [])
      .filter(line => typeof line.text === "string" && Number.isFinite(line.y) && Number.isFinite(line.height)).sort((a,b) => a.y-b.y || a.x-b.x);
    const table = lines.findIndex(line => /\b(?:Postnr|Postnr\/kode|NS.kode)/i.test(line.text) && /\b(?:Mengde|Enhet|Enh\.|Pris)/i.test(line.text));
    // The table header provides a hard boundary. On prose pages require the
    // project/page header and a compact, adjacent numbered caption instead.
    const anchor = lines.findIndex(line => /^(?:Prosjekt|Projekt):/i.test(line.text) || /\bSide\s+(?:[A-Z]\s*)?[\dA-Z]+(?:-\d+)?\b/i.test(line.text));
    if (anchor < 0 || (table >= 0 && anchor >= table)) continue;
    const top = lines[0].y, typical = Math.max(lines[anchor].height, 8);
    if (lines[anchor].y - top > typical * 9) continue;
    const region = table >= 0 ? lines.slice(anchor + 1, table) : lines.slice(anchor + 1);
    const candidates: ChapterCaption[][] = [];
    const side = lines[anchor].text.match(/\bSide\s+(?:[A-Z]\s+)?(\d+)-\d+\b/i)?.[1];
    let previous = lines[anchor];
    for (const line of region) {
      const numberedPageTitle = side && chapterCaptionPath(line.text)[0]?.number === side;
      if (line.y - lines[anchor].y > typical * 8 || line.y - previous.y > Math.max(typical, line.height) * (numberedPageTitle ? 5 : 2.4)) break;
      previous = line;
      const text = clean(line.text).replace(/\s+Side\s+[\dA-Z]+(?:-\d+)?\s*$/i, "");
      if (/^(?:D\d+\s+BESKRIVENDE DEL|Side\s|Entreprise:|[\d.]+$)/i.test(text)) continue;
      const path = chapterCaptionPath(text);
      if (!path.length) {
        if (table < 0 && candidates.length) break;
        continue;
      }
      candidates.push(path);
      if (table < 0) break;
    }
    if (!candidates.length) continue;
    // Separate main/subchapter lines are also used in D1 descriptions.
    const path = candidates.flat();
    if (side && path.length === 1 && path[0].number !== side && !path[0].number.startsWith(side + ".")) {
      // Resolve the missing main title in a second pass; never invent one from
      // the subchapter caption (Framo's "Side 31-3 / 1 Bunnledninger").
      path.unshift({ number: side, title: "" });
    }
    result.set(page.document_id, [...(result.get(page.document_id) ?? []), { page: page.page_number, path }]);
  }
  for (const [document, headers] of result) {
    const mains = new Map(headers.filter(h => h.path[0]?.title).map(h => [h.path[0].number, h.path[0].title]));
    result.set(document, headers.map(h => ({ ...h, path: h.path.map((caption,index) => index === 0 && !caption.title
      ? {...caption,title:mains.get(caption.number) ?? ""} : caption) }))
      .filter(h => h.path.every(caption => caption.title)).sort((a,b) => a.page-b.page));
  }
  return result;
}

/** Keep displayed numbers verbatim, compare complete segments (31 != 310).
 * D1 is a document wrapper; zero padding must not break 01 vs 1 links. */
export function chapterAddress(number: string): string {
  return number.replace(/^D\d+\./i, "").split(".").map(part => part.replace(/^0+(?=\d)/, "").toUpperCase()).join(".");
}
export function chapterContains(parent: string, number: string): boolean {
  const p = chapterAddress(parent), n = chapterAddress(number);
  return Boolean(p) && (n === p || n.startsWith(p + "."));
}
export function joinedChapterNumber(path: ChapterCaption[]): string {
  return path.reduce((number, caption) => !number || chapterContains(number, caption.number) ? caption.number : number + "." + caption.number, "");
}
