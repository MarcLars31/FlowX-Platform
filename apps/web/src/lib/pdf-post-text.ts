/** OCR sometimes reads zero as O inside an otherwise numeric DN token.
 * Match the complete token: never turn DN8O into the valid but wrong DN8. */
export function normalizeOcrDnTokens(text: string) {
  return text.replace(/\bDN\s*(?=[\dO]*\d)[\dO]*O[\dO]*(?![\p{L}\p{N}])/giu,
    token => token.replace(/o/gi, "0"));
}

export const pdfLumpSumLine = /^(?:Rund\s+sum(?:\s+RS)?|RS)(?:\s+[\d.,]+)*\s*$/i;

/** Only repair known derived artifacts in unreviewed OCR snapshots. The saved
 * source is untouched; card, search and saving receive the same projection. */
export function repairedOcrPostAttributes(attributes: Record<string, unknown>, source: string) {
  const corrected = { ...attributes };
  const hasLumpSum = source.split(/\r?\n/).some(line => pdfLumpSumLine.test(line.trim()));
  const legacyDimensions = [...source.matchAll(/\bDN\s*\d+(?=O\b)/gi)].map(match => match[0].replace(/\s/g, ""));
  const fullDimensions = [...normalizeOcrDnTokens(source).matchAll(/\bDN\s*\d+\b/gi)].map(match => match[0].replace(/\s/g, ""));
  for (const [key, value] of Object.entries(corrected)) {
    if (typeof value !== "string" || /kommentar|comment/i.test(key)) continue;
    let next = normalizeOcrDnTokens(value);
    if (hasLumpSum) next = next.replace(/\s+Rund\s+sum\s+RS\s*$/i, "");
    // Correct only the exact truncated value, with a single unambiguous source
    // dimension and no genuine occurrence of the shorter DN in this post.
    if (/^(?:dimensjon|dimension)$/i.test(key) && legacyDimensions.includes(value)
      && new Set(fullDimensions).size === 1
      && !new RegExp(`\\b${value}\\b`, "i").test(source)) next = fullDimensions[0];
    corrected[key] = next;
  }
  return corrected;
}


/** A consultant/date row is page furniture only at a known page-header boundary. */
export function isPdfConsultantDateHeader(line: string) {
  return /^[\p{L}\p{N}][\p{L}\p{N} .,&()/-]{0,100}\s+(?:AS|ASA|AB|A\/S)\s+\d{1,2}\.\d{1,2}\.(?:19|20)\d{2}$/u.test(line.trim());
}

/** Older snapshots can contain a continuation consisting solely of the next
 * page's consultant/date header. Remove that metadata, retaining real prose. */
export function withoutPdfHeaderContinuations(source: string) {
  const parts = source.split(/(\r?\n(?:[ \t]*\r?\n)*[ \t]*FORTSETTELSE SIDE \d+[ \t]*\r?\n)/);
  let result = parts[0];
  for (let index = 1; index < parts.length; index += 2) {
    const lines = (parts[index + 1] ?? "").split(/\r?\n/);
    const first = lines.findIndex(line => line.trim());
    if (first >= 0 && isPdfConsultantDateHeader(lines[first])) {
      lines.splice(first, 1);
      const body = lines.join("\n").trim();
      if (body) result += parts[index] + body;
    } else result += parts[index] + (parts[index + 1] ?? "");
  }
  return result;
}

/** Match the extractor's known OCR spellings without changing field values. */
export function canonicalPdfFieldLabel(label: string) {
  return label.trim()
    .replace(/^utl[øoeög]sningstemperatur$/i, "Utløsningstemperatur")
    .replace(/^(?:folsomhetsgrad|felsomhetsgrad)$/i, "Følsomhetsgrad");
}
