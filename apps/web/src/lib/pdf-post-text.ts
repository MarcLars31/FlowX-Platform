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
