import type { TechnicalDescriptionChapter, TechnicalDescriptionPage } from "./types";

/** Read chapter headers, independently of the product text and NS codes. */
export function pdfChaptersByPage(pages: readonly Pick<TechnicalDescriptionPage, "pageNumber" | "text">[]) {
  const byPage = new Map<number, TechnicalDescriptionChapter>();
  const chapters = new Map<string, TechnicalDescriptionChapter>();
  let current: TechnicalDescriptionChapter | undefined;
  const ordered = [...pages].sort((left, right) => left.pageNumber - right.pageNumber);
  const titles = completeChapterTitles(ordered.map(page => chapterTitle(page.text)));
  // Orientation pages can still carry the parent chapter in the page header.
  // Use the body heading when the following chapter confirms its number in
  // the same building on consecutive pages. Descriptive wording can vary.
  for (let index = 0; index < ordered.length; index += 1) {
    const parentTitle = titles[index];
    const parent = titles[index]?.match(/^(\d{3,6}\s+[A-ZÆØÅ][\wÆØÅæøå-]*(?:\s+[A-ZÆØÅ][\wÆØÅæøå-]*)?\s+[-–—]\s+\d{1,4})(?:\.\d+)*\s+\S/);
    if (!parent) continue;
    const lines = ordered[index].text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const orientation = lines.findIndex(line => /^Orientering\s*:?$/i.test(line));
    const heading = orientation > 0 ? lines.slice(Math.max(0, orientation - 3), orientation)
      .map(line => line.match(/^(\d{3})\s+(.+)$/)).find(Boolean) : undefined;
    if (!heading) continue;
    const expected = `${parent[1]}.${heading[1]} ${heading[2]}`;
    for (let next = index + 1; next < ordered.length; next += 1) {
      if (ordered[next].pageNumber !== ordered[next - 1].pageNumber + 1) break;
      const nextTitle = titles[next];
      if (nextTitle && normalizedChapter(nextTitle) !== normalizedChapter(titles[index]!)) {
        if (normalizedChapter(nextTitle).startsWith(normalizedChapter(`${parent[1]}.${heading[1]} `))
          && nextTitle.match(/[-–—]\s+\d+(?:\.\d+)*\s/)?.[0].trim().endsWith(`.${heading[1]}`)) {
          for (let continuation = index; continuation < next; continuation += 1) titles[continuation] = nextTitle;
        }
        break;
      }
      if (/^Orientering\s*:?\s*$/im.test(ordered[next].text)) break;
    }
    // A general 560 orientation introduces the 56x family, rather than being
    // a late continuation of chapter 50 or an invented part of chapter 562.
    if (heading[1].endsWith("0") && titles[index] === parentTitle) titles[index] = expected;
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

function completeChapterTitles(titles: (string | undefined)[]) {
  // A repeated header may contain only "1401 HM - 40.". Resolve it from a
  // named header for that exact building and chapter in this document. Never
  // borrow a subchapter's name or guess when the PDF has conflicting names.
  const pattern = /^(\d{3,6}\s+[A-ZÆØÅ][\wÆØÅæøå-]*(?:\s+[A-ZÆØÅ][\wÆØÅæøå-]*)?\s+[-–—]\s+\d{1,4}(?:\.\d+)*)\.?(?:\s+(.+))?$/;
  const parsed = titles.map(title => title?.match(pattern));
  const named = new Map<string, string | null>();
  const key = (code: string) => normalizedChapter(code.replace(/[–—]/g, "-"));
  for (const parts of parsed) {
    if (!parts?.[2]) continue;
    const identity = key(parts[1]);
    const title = `${parts[1]} ${parts[2]}`;
    const previous = named.get(identity);
    if (previous === undefined) named.set(identity, title);
    else if (previous !== null && key(previous) !== key(title)) named.set(identity, null);
  }
  return titles.map((title, index) => {
    const parts = parsed[index];
    const alternate = title?.match(/^(\d{4})\.(\d+(?:\.\d+)*)\s+(.+)$/);
    if (alternate) {
      const matches = [...named.values()].filter((candidate): candidate is string => {
        if (!candidate) return false;
        const full = candidate.match(pattern);
        return Boolean(full && full[1].startsWith(`${alternate[1]} `)
          && full[1].endsWith(`- ${alternate[2]}`) && key(full[2]) === key(alternate[3]));
      });
      if (matches.length === 1) return matches[0];
    }
    return parts && !parts[2] ? named.get(key(parts[1])) ?? title : title;
  });
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
