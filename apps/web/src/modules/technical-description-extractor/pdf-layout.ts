type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

type LayoutLine = {
  y: number;
  items: PositionedTextItem[];
};

const LINE_TOLERANCE = 3;

/**
 * Rebuilds readable rows from PDF.js text items. PDF text streams are not
 * required to follow visual reading order, so table annotations can otherwise
 * become detached from the post number that they belong to.
 */
export function layoutTextFromPdfItems(items: readonly unknown[]) {
  const positioned = items
    .map(toPositionedTextItem)
    .filter((item): item is PositionedTextItem => item !== null)
    .sort((left, right) => right.y - left.y || left.x - right.x);

  const lines: LayoutLine[] = [];
  for (const item of positioned) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= LINE_TOLERANCE);
    if (line) {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => renderLine(line.items))
    .filter(Boolean)
    .join("\n");
}

/**
 * Rebuilds rows from Tesseract's positioned words. Scanned NS 3420 tables
 * commonly place the description, unit and quantity in separate OCR blocks.
 * Tesseract's plain text can consequently omit the quantity or put it on an
 * unrelated line even though the word was recognized correctly.
 */
export function layoutTextFromOcrBlocks(blocks: readonly unknown[] | null | undefined) {
  const positioned = (blocks ?? [])
    .flatMap(ocrWordsFromBlock)
    .sort((left, right) => left.y - right.y || left.x - right.x);
  if (positioned.length === 0) return "";

  const heights = positioned
    .map((item) => item.width > 0 ? item.height : 0)
    .filter((height) => height > 0)
    .sort((left, right) => left - right);
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? 12;
  const tolerance = Math.min(10, Math.max(3, medianHeight * 0.45));
  const lines: LayoutLine[] = [];

  for (const item of positioned) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (line) {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines
    .sort((left, right) => left.y - right.y)
    .map((line) => renderLine(line.items))
    .filter(Boolean)
    .join("\n");
}

export function shouldPreferPdfLayoutText(plainText: string, layoutText: string) {
  if (layoutText.length < 80) return false;
  const combined = `${plainText}\n${layoutText}`;
  const hasTableHeader = /postnr\.?/i.test(combined)
    && /(?:mengde|enhet|enhetspris|sum)/i.test(combined);
  const hasStructuredRows = /^\s*\d+(?:\.\d+)+\s+.+\s+(?:stk|st|m|lm|meter|kg|l)\.?\s+\d/im.test(layoutText);
  return hasTableHeader && hasStructuredRows;
}

export function shouldPreferOcrLayoutText(plainText: string, layoutText: string) {
  if (layoutText.length < 20) return false;
  const plain = ocrTableSignals(plainText);
  const layout = ocrTableSignals(layoutText);

  return layout.quantities > plain.quantities
    || layout.posts > plain.posts + 1
    || (layout.quantities === plain.quantities
      && layout.posts > plain.posts
      && layout.codes >= plain.codes);
}

export function isBetterOcrText(candidateText: string, currentText: string) {
  const candidate = ocrTableSignals(candidateText);
  const current = ocrTableSignals(currentText);
  return candidate.quantities > current.quantities
    || (candidate.quantities === current.quantities && candidate.posts > current.posts)
    || (candidate.quantities === current.quantities
      && candidate.posts === current.posts
      && candidate.codes > current.codes);
}

function toPositionedTextItem(value: unknown): PositionedTextItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as { str?: unknown; transform?: unknown; width?: unknown };
  if (typeof item.str !== "string" || !item.str.trim()) return null;
  if (!Array.isArray(item.transform) || item.transform.length < 6) return null;
  const x = Number(item.transform[4]);
  const y = Number(item.transform[5]);
  const width = Number(item.width);
  if (![x, y, width].every(Number.isFinite)) return null;
  return { str: item.str.trim(), x, y, width: Math.max(width, 0) };
}

type PositionedOcrTextItem = PositionedTextItem & { height: number };

function ocrWordsFromBlock(value: unknown): PositionedOcrTextItem[] {
  if (!value || typeof value !== "object") return [];
  const block = value as { paragraphs?: unknown };
  if (!Array.isArray(block.paragraphs)) return [];

  const words: PositionedOcrTextItem[] = [];
  for (const paragraphValue of block.paragraphs) {
    if (!paragraphValue || typeof paragraphValue !== "object") continue;
    const paragraph = paragraphValue as { lines?: unknown };
    if (!Array.isArray(paragraph.lines)) continue;
    for (const lineValue of paragraph.lines) {
      if (!lineValue || typeof lineValue !== "object") continue;
      const line = lineValue as { words?: unknown };
      if (!Array.isArray(line.words)) continue;
      for (const wordValue of line.words) {
        if (!wordValue || typeof wordValue !== "object") continue;
        const word = wordValue as {
          text?: unknown;
          bbox?: { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown };
        };
        if (typeof word.text !== "string" || !word.text.trim() || !word.bbox) continue;
        const x0 = Number(word.bbox.x0);
        const y0 = Number(word.bbox.y0);
        const x1 = Number(word.bbox.x1);
        const y1 = Number(word.bbox.y1);
        if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
        words.push({
          str: word.text.trim(),
          x: x0,
          y: (y0 + y1) / 2,
          width: Math.max(x1 - x0, 0),
          height: Math.max(y1 - y0, 0)
        });
      }
    }
  }
  return words;
}

function ocrTableSignals(text: string) {
  const unit = String.raw`(?:stk|st|pcs?|m|lm|[i1]m|meter|løpemeter|m2|m²|m3|m³|kg|l)`;
  return {
    quantities: countMatches(
      text,
      new RegExp(String.raw`^(?:Antall|Lengde)?\s*${unit}\.?\s+\d`, "gim")
    ),
    posts: countMatches(text, /^\s*\d+(?:\.\d+){2,7}(?:\s*[|)])?/gm),
    codes: countMatches(text, /^\s*%?[A-ZÆØÅ]{1,10}\d[\w.%-]*/gim)
  };
}

function countMatches(value: string, pattern: RegExp) {
  return [...value.matchAll(pattern)].length;
}

function renderLine(items: PositionedTextItem[]) {
  const sorted = [...items].sort((left, right) => left.x - right.x);
  let output = "";
  let rightEdge: number | null = null;
  for (const item of sorted) {
    if (output) {
      const gap = rightEdge === null ? 0 : item.x - rightEdge;
      output += gap > 7 ? "\t" : " ";
    }
    output += item.str;
    rightEdge = Math.max(rightEdge ?? item.x, item.x + item.width);
  }
  return output.replace(/[ \t]+$/g, "").trim();
}
