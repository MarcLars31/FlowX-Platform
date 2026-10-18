import { normalizeQuantityUnit, parseQuantityNumber } from "@/lib/quantity-value";
import type { TechnicalDescriptionPage } from "./types";

type Item = { text: string; x: number; y: number; width: number; height: number };
type Row = { y: number; items: Item[] };

function headerLabel(value: string) {
  return value.toLocaleLowerCase().replace(/[\s.:]/g, "");
}

/** A PDF can split a label into adjacent text fragments. Join only nearby
 * fragments on the already verified header row, never words from the body. */
function findColumnHeader(items: Item[], labels: readonly string[]): Item | undefined {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  for (let start = 0; start < sorted.length; start += 1) {
    const first = sorted[start];
    let text = "";
    for (let end = start; end < Math.min(start + 4, sorted.length); end += 1) {
      const item = sorted[end];
      const previous = sorted[end - 1];
      if (end > start && item.x - (previous.x + previous.width) > Math.max(first.height, item.height) * .6) break;
      text += item.text;
      if (labels.includes(headerLabel(text))) {
        return { ...first, text, width: item.x + item.width - first.x };
      }
    }
  }
  return undefined;
}

/** ISY site tables have an explicit Sted identity and a separate Postnr column.
 * Only that column establishes posts; numbers in the description remain prose.
 * Other digital layouts and OCR continue to use their existing readers.
 */
export function sitePostTableFromPdfItems(input: readonly unknown[]): TechnicalDescriptionPage["postTable"] {
  const items: Item[] = input.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const item = value as { str?: string; transform?: number[]; width?: number; height?: number };
    if (!item.str?.trim() || !item.transform || item.transform.length < 6) return [];
    return [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5],
      width: item.width ?? 0, height: item.height || Math.abs(item.transform[3]) || 10 }];
  });
  const header = items.find(item => /^Postnr:$/.test(item.text));
  const site = items.find(item => /^Sted:\s*\d+\s+\S/.test(item.text));
  if (!header || !site || site.y <= header.y) return undefined;
  const siteMatch = site.text.match(/^Sted:\s*(\d+)\s+(.+)$/)!;
  const headerItems = items.filter(item => Math.abs(item.y - header.y) < 3);
  const descriptionHeader = headerItems.find(item => item.text === "Beskrivelse");
  if (!descriptionHeader) return undefined;
  const columnItems = headerItems.filter(item => item.x >= descriptionHeader.x + descriptionHeader.width);
  const unitCandidate = findColumnHeader(columnItems, ["enh", "enhet", "enhed"]);
  const amountCandidate = findColumnHeader(columnItems, ["mengde", "mengd", "mängd"]);
  const priceCandidate = findColumnHeader(columnItems, ["pris", "enhetspris"]);
  const columnsVerified = Boolean(unitCandidate && amountCandidate && priceCandidate
    && unitCandidate.x + unitCandidate.width < amountCandidate.x
    && amountCandidate.x + amountCandidate.width < priceCandidate.x);
  const quantityColumnsUnrecognized = columnItems.length > 0 && !columnsVerified;
  // Keep the post and its source text if a header is ambiguous, but do not
  // infer amounts from prices or report an unverified table as complete.
  const unitHeader = columnsVerified ? unitCandidate : undefined;
  const amountHeader = columnsVerified ? amountCandidate : undefined;
  const priceHeader = columnsVerified ? priceCandidate : undefined;
  const footer = items.filter(item => item.y < header.y && /^(?:Sum denne side|Akkumulert Sted)\s*:?/.test(item.text));
  const bottom = footer.length ? Math.max(...footer.map(item => item.y)) + 3 : -Infinity;
  const body = items.filter(item => item.y < header.y - 4 && item.y > bottom);
  const postItems = body.filter(item => item.x < header.x + header.width && /^[\d.]+$/.test(item.text))
    .sort((a, b) => b.y - a.y);
  const anchors: Array<{ postNumber: string; y: number; items: Item[] }> = [];
  for (const item of postItems) {
    if (item.text === siteMatch[1] || item.text.startsWith(`${siteMatch[1]}.`)) {
      anchors.push({ postNumber: item.text, y: item.y, items: [item] });
    } else {
      const previous = anchors.at(-1);
      const last = previous?.items.at(-1);
      if (!previous || !last || last.y - item.y > last.height * 1.8) return undefined;
      previous.postNumber += item.text;
      previous.items.push(item);
    }
  }
  if (anchors.some(anchor => !/^\d+(?:\.\d+)*$/.test(anchor.postNumber))) return undefined;
  const consumed = new Set(postItems);
  const rows: Row[] = [];
  for (const item of body.filter(item => !consumed.has(item)).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find(row => Math.abs(row.y - item.y) < 4.5);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  // Add empty anchors too: a post number may be followed by its description.
  for (const anchor of anchors) if (!rows.some(row => Math.abs(row.y - anchor.y) < 4.5)) rows.push({ y: anchor.y, items: [] });
  rows.sort((a, b) => b.y - a.y);
  const lines: string[] = [];
  const posts: NonNullable<TechnicalDescriptionPage["postTable"]>["posts"] = [];
  const quantities: NonNullable<TechnicalDescriptionPage["postTable"]>["quantities"] = [];
  const unitRight = unitHeader && amountHeader ? (unitHeader.x + unitHeader.width + amountHeader.x) / 2 : Infinity;
  const amountRight = amountHeader && priceHeader ? (amountHeader.x + amountHeader.width + priceHeader.x) / 2 : Infinity;
  for (const row of rows) {
    const sorted = row.items.sort((a, b) => a.x - b.x);
    // Unit text is inside its own column, including raised ²/³ glyphs. Never
    // concatenate those glyphs with a quantity from the next column.
    const unitItems = unitHeader ? sorted.filter(item => item.x >= unitHeader.x - unitHeader.height && item.x < unitRight) : [];
    const amountItems = amountHeader ? sorted.filter(item => item.x >= unitRight && item.x < amountRight) : [];
    const unitText = unitItems.map(item => item.text).join("").replace(/m2/i, "m²").replace(/m3/i, "m³");
    const amountText = amountItems.map(item => item.text).join("");
    const value = /^RS$/i.test(unitText) ? 1 : parseQuantityNumber(amountText);
    const isQuantity = /^(?:RS|stk\.?|st|m|lm|m²|m³|kg|l)$/i.test(unitText)
      && value !== null;
    const descriptionItems = isQuantity ? sorted.filter(item => item.x < unitHeader!.x - unitHeader!.height) : sorted;
    const description = descriptionItems.reduce((text, item, index) => {
      const previous = descriptionItems[index - 1];
      if (previous && /m$/.test(previous.text) && /^[23]$/.test(item.text)
        && item.height < previous.height * .85 && item.y > previous.y) {
        return text + (item.text === "2" ? "²" : "³");
      }
      return `${text} ${item.text}`;
    }, "").replace(/\s+/g, " ").trim();
    const anchor = anchors.find(anchor => Math.abs(anchor.y - row.y) < 4.5);
    if (anchor) {
      posts.push({ lineIndex: lines.length, postNumber: anchor.postNumber, description,
        chapter: anchor.postNumber.split(".").length <= 3 });
      lines.push(`${anchor.postNumber}${description ? ` ${description}` : ""}`);
    } else if (description) lines.push(description);
    if (isQuantity) {
      const unit = normalizeQuantityUnit(unitText);
      const label: Record<string, string> = { st: "Antall", m: "Lengde", m2: "Areal", m3: "Volum", kg: "Vekt", l: "Volum", RS: "Rund sum" };
      const quantity = { quantity: value!, unit, text: `${label[unit]} ${amountText || "1"} ${unitText}`,
        lineIndex: lines.length, descriptionPrefix: "", sourceUnitText: unitText, sourceAmountText: amountText };
      quantities.push(quantity);
      lines.push(`${label[unit]} ${unit} ${amountText || "1"}`);
    }
  }
  for (const [index, post] of posts.entries()) {
    const end = posts[index + 1]?.lineIndex ?? lines.length;
    post.quantity = quantities.find(quantity => quantity.lineIndex >= post.lineIndex && quantity.lineIndex < end);
  }
  return { text: lines.join("\n"), siteTitle: `${siteMatch[1]} ${siteMatch[2]}`, posts, quantities, quantityColumnsVerified: columnsVerified,
    ...(quantityColumnsUnrecognized ? { quantityColumnsUnrecognized: true } : {}) };
}

/** Some chapter introductions use a full-width short heading ("365 ...")
 * instead of a post cell. Require the following real post to confirm its full
 * path, so unrelated section headings cannot acquire a fabricated identity. */
export function withSiteTableChapterHeadings(pages: TechnicalDescriptionPage[]) {
  return pages.map((page, index) => {
    const table = page.postTable;
    if (!table || table.posts.length) return page;
    const heading = table.text.match(/^(\d{3})\s+([A-ZÆØÅ][^\n]+)\n/);
    if (!heading) return page;
    let nextPost: string | undefined;
    for (const following of pages.slice(index + 1)) {
      if (following.postTable?.siteTitle !== table.siteTitle) break;
      nextPost = following.postTable.posts[0]?.postNumber;
      if (nextPost) break;
    }
    const parts = nextPost?.split(".");
    if (!parts || parts.length < 4 || parts[2] !== heading[1]) return page;
    const postNumber = parts.slice(0, 3).join(".");
    return { ...page, postTable: { ...table,
      text: `${postNumber} ${heading[2]}\n${table.text.slice(heading[0].length)}`,
      posts: [{ lineIndex: 0, postNumber, description: heading[2], chapter: true }]
    } };
  });
}
