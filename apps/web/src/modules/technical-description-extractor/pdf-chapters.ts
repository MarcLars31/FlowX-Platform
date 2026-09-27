import type { TechnicalDescriptionChapter, TechnicalDescriptionPage } from "./types";

/** Read chapter headers, independently of the product text and NS codes. */
export function pdfChaptersByPage(pages: readonly Pick<TechnicalDescriptionPage, "pageNumber" | "text">[]) {
  const byPage = new Map<number, TechnicalDescriptionChapter>();
  const chapters = new Map<string, TechnicalDescriptionChapter>();
  let current: TechnicalDescriptionChapter | undefined;
  for (const page of [...pages].sort((left, right) => left.pageNumber - right.pageNumber)) {
    const title = chapterTitle(page.text);
    if (title) {
      // OCR may insert spaces inside words in a repeated header.
      const key = title.toLocaleLowerCase("nb-NO").replace(/\s+/g, "");
      current = chapters.get(key) ?? { title, sourcePage: page.pageNumber };
      chapters.set(key, current);
    }
    // A page break does not start another chapter. A post keeps the chapter
    // of its first page even when its specification continues on later pages.
    if (current) byPage.set(page.pageNumber, current);
  }
  return byPage;
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
