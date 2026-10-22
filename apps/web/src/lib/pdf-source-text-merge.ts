/** Shortest common supersequence of source lines: both readings remain in
 * order. Only whitespace-equivalent lines are shared; differing numbers and
 * requirement values are retained and require review, never guessed away. */
export function mergePdfSourceText(digital: string, ocr: string) {
  const lines = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const a = lines(digital), b = lines(ocr);
  const normalized = (line: string) => line.normalize("NFKC").replace(/\s+/g, "");
  const x = a.map(normalized), y = b.map(normalized);
  if (!a.length) return { text: ocr, supplemented: false };
  if (!b.length) return { text: digital, supplemented: true };
  // Bound memory for exceptional OCR pages; retain both sources in that case.
  if ((a.length + 1) * (b.length + 1) > 2_000_000) {
    return { text: `${digital}\n\n${ocr}`, supplemented: true };
  }
  const width = b.length + 1, lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lcs[i * width + j] = x[i] === y[j] ? 1 + lcs[(i + 1) * width + j + 1]
      : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
  }
  const merged: string[] = [];
  let i = 0, j = 0, supplemented = false;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && x[i] === y[j]) { merged.push(a[i++]); j++; }
    else if (i < a.length && (j === b.length || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
      merged.push(a[i++]); supplemented = true;
    } else merged.push(b[j++]);
  }
  return { text: merged.join("\n"), supplemented };
}
