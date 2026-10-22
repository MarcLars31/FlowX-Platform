import { splitPostHeading } from "./post-heading";
import { continuesPostReference, findTableQuantity, parseStructuredPostStart } from "./document-parser";
import type {
  TechnicalDescriptionMaterialLine,
  TechnicalDescriptionPage
} from "./types";

type NumberedChapter = {
  number: string;
  label: string;
  sourcePage: number;
};

/**
 * Object-based descriptions put headings in the post column, e.g. 02.30 and
 * 02.30.311, instead of repeating a Kapittel header on every page. Only accept
 * section-level numbers with a title; product posts and bare wrapped numbers
 * must not supply chapter names.
 */
export function numberedChaptersFromPages(pages: readonly TechnicalDescriptionPage[]): NumberedChapter[] {
  return pages.flatMap(page => page.text.split(/\r?\n/)
    .map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean)
    .flatMap((line, index, lines) => {
      // A discipline has two digits (possibly zero-padded). Three-digit system
      // identifiers such as 360.010 in prose are not chapter numbers.
      const heading = line.match(/^(\d{2,6}\.\d{2}(?:\.\d{3})?|0*\d{2}\.\d{3})\s*([A-ZÆØÅ][^\n]+)$/i);
      if (!heading || continuesPostReference(lines, index)) return [];
      const [, number, title] = heading;
      // An NS code, dimension or quantity belongs to a product row, even when
      // its post number happens to have the same shape as a chapter number.
      if (/^(?:%?[A-ZÆØÅ]{2}\d|DN\s*\d|Antall\b|Lengde\b|Rund sum\b)/i.test(title)
        || /\b(?:stk|st|m|lm|m2|m²|m3|m³|kg|l|RS)\s*\d+(?:[.,]\d+)?(?:\s|$)/i.test(title)
        || /\.{2,}\s*\d+\s*$/.test(title)
        || /^(?:Antall|Lengde|Rund sum)\b/i.test(lines[index + 1] ?? "")) return [];
      const next = lines.findIndex((_, next) => next > index && Boolean(parseStructuredPostStart(lines, next)));
      const body = lines.slice(index + 1, next < 0 ? undefined : next);
      const measured = page.sourcePostColumns?.find(post => post.postNumber === number);
      if (measured?.unit || measured?.quantity || findTableQuantity(body)) return [];
      const split = splitPostHeading([title, ...body].join("\n"), page.headingLayout);
      const headingTitle = split.status === "separated" || split.status === "heading-only" ? split.title : title;
      return [{ number, label: `${number} ${headingTitle}`, sourcePage: page.pageNumber }];
    }));
}

export function attachNumberedChapters(
  lines: TechnicalDescriptionMaterialLine[],
  chapters: readonly NumberedChapter[]
) {
  for (const line of lines) {
    // Preserve explicit Kapittel metadata. A number without a source heading
    // is insufficient evidence to invent a chapter title.
    const postNumber = line.postNumber;
    if (line.sourceChapter || line.attributes.kapittelpost || !postNumber) continue;
    let chapter = chapters.filter(candidate =>
      candidate.sourcePage <= line.sourcePage
      && (postNumber === candidate.number || postNumber.startsWith(`${candidate.number}.`))
    ).sort((left, right) =>
      right.number.length - left.number.length || right.sourcePage - left.sourcePage
    )[0];
    // A repeated orientation heading may abbreviate 02.30.362 to 362.
    // Accept it only inside the currently active chapter, without a product
    // code or quantity; a matching number elsewhere in the PDF is not enough.
    if (!chapter && /^\d{3}$/.test(postNumber) && !line.nsCode && !line.unit && line.quantity === undefined) {
      const active = chapters.filter(candidate => candidate.sourcePage <= line.sourcePage)
        .sort((left, right) => left.sourcePage - right.sourcePage).at(-1);
      if (active?.number.endsWith(`.${postNumber}`)) chapter = active;
    }
    if (!chapter) continue;
    line.sourceChapter = { title: chapter.label, sourcePage: chapter.sourcePage };
    line.chapterInformation = postNumber === chapter.number && line.sourcePage === chapter.sourcePage
      && !line.unit && line.quantity === undefined;
    line.attributes.kapittelpost = chapter.label;
    line.attributeSources = {
      ...line.attributeSources,
      kapittelpost: { postNumber: chapter.number, sourcePage: chapter.sourcePage }
    };
  }
}
