import { isPdfConsultantDateHeader, isPdfTableTotalFooter } from "./pdf-post-text";
import { normalizedPageLines, parseStructuredPostStart } from "@/modules/technical-description-extractor/document-parser";
import { textPostInventory } from "@/modules/technical-description-extractor/post-inventory";
import type { TechnicalDescriptionPage } from "@/modules/technical-description-extractor/types";
import { mergePdfSourceText } from "./pdf-source-text-merge";

/** Remove page furniture from the combined parser input, retaining the exact
 * unmodified readings separately in sourceReadings. Never treat a sum/header
 * in one reading as the end of the other reading's requirement body. */
export function pdfReadingBody(text: string) {
  const lines = normalizedPageLines(text);
  const end = lines.findIndex(isPdfTableTotalFooter);
  const tableHeader = lines.findIndex(line => /^Post\s*(?:nr|nummer)(?:[.:]|\s|$)/i.test(line));
  const pageHeader = tableHeader >= 0 && lines.slice(0, tableHeader).some(line => /^(?:Prosjekt:|Kapittel:)|\bSide\s+\d/i.test(line));
  return (end < 0 ? lines : lines.slice(0, end)).filter((line, index) =>
    // Område in the proven page header is page metadata. The same field in a
    // specification, or without a table/header boundary, remains requirement text.
    !(pageHeader && index < tableHeader && /^Område:\s*\d+(?:\.\d+)*\s+\S/i.test(line))
    && !isPdfConsultantDateHeader(line)
    && !/^(?:Multiconsult$|(?:Ramb[oø]ll|Multiconsult).*\d{1,2}\.\d{1,2}\.(?:19|20)\d{2}$)/i.test(line)
    && !/^(?:NS[-\s]*(?:3420\s*)?(?:kode|Spesifikasjon)|Enh\.?$|Enhet$|Mengde$|Enhetspris$|Pris$|Sum$|Side\s+\d)/i.test(line)
    && !/^\d{2}\s+(?:VVS|Brannslokking|Sanitær)\b/i.test(line) && !/^(?:Prosjekt:|Kapittel:|Entreprise:|Sted:|Postnr(?:[.:]|\s|$)|Kopi-)/i.test(line)
    && !/^\d{1,2}\.\d{1,2}\.(?:19|20)\d{2}$/.test(line)
    && !/^Helse S[øo]r[øo]st\s+\d{1,2}\./i.test(line)).join("\n");
}
const code = (text: string) => text.match(/\b[A-ZÆØÅ]{1,5}\d+\.\d+[A-Z]?\b/)?.[0];
function canonicalPost(source: string, number: string) {
  const lines = normalizedPageLines(pdfReadingBody(source));
  const start = parseStructuredPostStart(lines, 0);
  const body = start ? [...(start.description ? [start.description] : []), ...lines.slice(start.consumedLineCount)] : lines;
  return `${number}\n${body.join("\n")}`;
}

export function mergePdfPageSource(page: TechnicalDescriptionPage, ocrText: string) {
  const digitalPosts = page.postInventory?.posts ?? [];
  const ocrBody = pdfReadingBody(ocrText), digitalBody = pdfReadingBody(page.text);
  if (!digitalPosts.length) return mergePdfSourceText(digitalBody, ocrBody);
  const ocrPosts = textPostInventory(ocrBody).posts;
  const used = new Set<number>(), combined: string[] = [];
  let supplemented = false;
  const prefixBefore = (text: string, number: string | undefined) => {
    if (!number) return "";
    const lines = normalizedPageLines(text);
    const index = lines.findIndex((_, index) => parseStructuredPostStart(lines, index)?.postNumber === number
      || lines[index].startsWith(`${number} `) || lines[index] === number);
    return index < 0 ? "" : lines.slice(0, index).join("\n");
  };
  for (const digital of digitalPosts) {
    let index = ocrPosts.findIndex((post, index) => !used.has(index) && post.postNumber === digital.postNumber);
    if (index < 0) {
      // Punctuation damage is only repaired when a unique digital identifier
      // and the same explicit NS code independently identify this occurrence.
      const candidates = ocrPosts.flatMap((post, index) => !used.has(index)
        && post.postNumber.replace(/\D/g, "") === digital.postNumber.replace(/\D/g, "")
        && code(digital.sourceText) && code(post.sourceText) === code(digital.sourceText) ? [index] : []);
      if (candidates.length === 1) index = candidates[0];
    }
    let source = index >= 0 ? canonicalPost(ocrPosts[index].sourceText, digital.postNumber) : "";
    if (index >= 0) used.add(index);
    // A single printed post can lose only its left-column number in OCR.
    // The unique NS code locates its body without inventing the next number.
    if (!source && digitalPosts.length === 1 && !ocrPosts.length && code(digital.sourceText)) {
      const offset = ocrBody.indexOf(code(digital.sourceText)!);
      if (offset >= 0) source = `${digital.postNumber}\n${ocrBody.slice(offset)}`;
    }
    const merged = mergePdfSourceText(canonicalPost(digital.sourceText, digital.postNumber), source);
    combined.push(merged.text); supplemented ||= merged.supplemented;
  }
  for (const [index, post] of ocrPosts.entries()) if (!used.has(index)) combined.push(post.sourceText);
  // Preserve both readings of the preceding-page continuation, including
  // digital-only fields that OCR omitted before the first numbered post.
  const prefix = mergePdfSourceText(prefixBefore(digitalBody, digitalPosts[0]?.postNumber),
    prefixBefore(ocrBody, ocrPosts[0]?.postNumber));
  if (prefix.text) combined.unshift(prefix.text);
  supplemented ||= prefix.supplemented || used.size < ocrPosts.length;
  if (!ocrPosts.length && !combined.some(text => code(text) && code(text) === code(ocrBody)) && ocrBody) {
    combined.unshift(ocrBody); supplemented = true;
  }
  return { text: combined.join("\n\n"), supplemented };
}
