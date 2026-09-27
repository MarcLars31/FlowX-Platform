import type { TechnicalDescriptionChapter, TechnicalDescriptionPage } from "./types";

/** Read chapter headers, independently of the product text and NS codes. */
export function pdfChaptersByPage(pages: readonly Pick<TechnicalDescriptionPage, "pageNumber" | "text">[]) {
  const byPage = new Map<number, TechnicalDescriptionChapter>();
  const chapters = new Map<string, TechnicalDescriptionChapter>();
  let current: TechnicalDescriptionChapter | undefined;
  const ordered = [...pages].sort((left, right) => left.pageNumber - right.pageNumber);
  const titles = ordered.map(page => chapterTitle(page.text));
  // Orientation pages can still carry the parent chapter in the page header.
  // Use the body heading only when the following chapter confirms both its
  // number and name, in the same building and on consecutive PDF pages.
  for (let index = 0; index < ordered.length; index += 1) {
    const parent = titles[index]?.match(/^(\d{3,6}\s+[A-ZÆØÅ][\wÆØÅæøå-]*(?:\s+[A-ZÆØÅ][\wÆØÅæøå-]*)?\s+[-–—]\s+\d{1,4})\s+\S/);
    if (!parent) continue;
    const lines = ordered[index].text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const orientation = lines.findIndex(line => /^Orientering\s*:?$/i.test(line));
    const heading = orientation > 0 ? lines[orientation - 1].match(/^(\d{3})\s+(.+)$/) : undefined;
    if (!heading) continue;
    const expected = `${parent[1]}.${heading[1]} ${heading[2]}`;
    for (let next = index + 1; next < ordered.length; next += 1) {
      if (ordered[next].pageNumber !== ordered[next - 1].pageNumber + 1) break;
      const nextTitle = titles[next];
      if (nextTitle && normalizedChapter(nextTitle) !== normalizedChapter(titles[index]!)) {
        if (normalizedChapter(nextTitle) === normalizedChapter(expected)) {
          for (let continuation = index; continuation < next; continuation += 1) titles[continuation] = nextTitle;
        }
        break;
      }
      if (/^Orientering\s*:?\s*$/im.test(ordered[next].text)) break;
    }
  }
  for (const [index, page] of ordered.entries()) {
    const title = titles[index];
    if (title) {
      // OCR may insert spaces inside words in a repeated header.
      const key = normalizedChapter(title);
      current = chapters.get(key) ?? { title, sourcePage: page.pageNumber };
      chapters.set(key, current);
    }
    // A page break does not start another chapter. A post keeps the chapter
    // of its first page even when its specification continues on later pages.
    if (current) byPage.set(page.pageNumber, current);
  }
  return byPage;
}

function normalizedChapter(title: string) {
  return title.toLocaleLowerCase("nb-NO").replace(/\s+/g, "");
}

function chapterTitle(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const explicit = lines.find(line => /^Kapittel\s*:\s*\S/i.test(line));
  if (explicit) return explicit.replace(/^Kapittel\s*:\s*/i, "").replace(/(?:\s+-)+\s*$/, "").trim();

  // ISY Linker headers can occur last in PDF.js's text stream.
  const buildingHeader = lines.find(line => /^\d{3,6}\s+[A-ZÆØÅ][\wÆØÅæøå-]*(?:\s+[A-ZÆØÅ][\wÆØÅæøå-]*)?\s+[-–—]\s+\d{1,4}(?:\.\d+)*\.?(?:\s+\S.*)?$/.test(line));
  if (buildingHeader) return buildingHeader;

  // Multiconsult puts the chapter directly above the Postnr table header.
  // Numbered products and dimensions in the body are not chapter headings.
  const tableHeader = lines.findIndex(line => /^Postnr(?:[.:]|\s|$)/i.test(line));
  const preceding = tableHeader > 0 ? lines[tableHeader - 1] : undefined;
  return preceding && /^\d{1,4}(?:\.\d+)*\s+[A-ZÆØÅa-zæøå]/.test(preceding) ? preceding : undefined;
}
