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

export function shouldPreferPdfLayoutText(plainText: string, layoutText: string) {
  if (layoutText.length < 80) return false;
  const combined = `${plainText}\n${layoutText}`;
  const hasTableHeader = /postnr\.?/i.test(combined)
    && /(?:mengde|enhet|enhetspris|sum)/i.test(combined);
  const hasStructuredRows = /^\s*\d+(?:\.\d+)+\s+.+\s+(?:stk|st|m|lm|meter|kg|l)\.?\s+\d/im.test(layoutText);
  return hasTableHeader && hasStructuredRows;
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
