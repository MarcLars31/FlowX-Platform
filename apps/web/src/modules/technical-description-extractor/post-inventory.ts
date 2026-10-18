import { isPdfTableTotalFooter } from "@/lib/pdf-post-text";
import { isTechnicalDescriptionDateHeader, normalizedPageLines, parseStructuredPostStart } from "./document-parser";
import { layoutTextFromPdfItems } from "./pdf-layout";
import { numberedPostHeading } from "./numbered-post-heading";
import type { TechnicalDescriptionPage } from "./types";

export type SourcePost = { postNumber: string; sourceText: string };
export type PostInventory = { method: "column" | "text"; posts: SourcePost[] };

type Item = { str: string; transform: number[]; width: number; height: number; x: number; y: number };
const numberToken = /^(?:[A-Z]\d*\.)?\.?\d+(?:\.\d+)*\.?$/i;

/** Inventory the physical post column independently of product, NS-code and
 * quantity parsing. Description references and subsection numbers cannot enter
 * this inventory. No Sted, language-specific description or amount header is required. */
function pdfPostColumnLayout(input: readonly unknown[]) {
  const items: Item[] = input.flatMap(value => {
    const item = value as Partial<Item> | null;
    if (!item || typeof item.str !== "string" || !item.str.trim() || !Array.isArray(item.transform)) return [];
    const x = Number(item.transform[4]), y = Number(item.transform[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{ str: item.str.trim(), transform: item.transform, x, y,
      width: item.width ?? 0, height: item.height || Math.abs(item.transform[3]) || 10 }];
  });
  const header = items.find(item => /^Post\s*(?:nr|nummer)[.:]?$/i.test(item.str));
  if (!header) return undefined;
  // The post header can be centred, but the post cells start farther left.
  const right = header.x + header.width + header.height * .5;
  const footer = items.filter(item => item.y < header.y && isPdfTableTotalFooter(item.str));
  const bottom = footer.length ? Math.max(...footer.map(item => item.y)) + 3 : -Infinity;
  const body = items.filter(item => item.y < header.y - 3 && item.y > bottom);
  const column = body.filter(item => item.x >= header.x - header.height * 2 && item.x < right
    && numberToken.test(item.str) && !isTechnicalDescriptionDateHeader(item.str))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const anchors: Array<{ postNumber: string; y: number; first: Item; last: Item }> = [];
  for (const item of column) {
    const previous = anchors.at(-1);
    const stem = previous?.postNumber.replace(/\.$/, "").split(".")[0];
    const sameRoot = stem && item.str.startsWith(`${stem}.`);
    const nearby = previous && previous.last.y - item.y >= -2 && previous.last.y - item.y <= Math.max(item.height, previous.last.height) * 1.8;
    const wrapped = nearby && !sameRoot && !/^[A-Z]/i.test(item.str)
      && (previous.postNumber.endsWith(".") || item.str.startsWith(".")
        || (previous.postNumber.includes(".") && previous.last.x + previous.last.width >= header.x + header.width - header.height * .3));
    if (wrapped) {
      previous.postNumber = item.str.startsWith(".")
        ? previous.postNumber.replace(/\.$/, "") + item.str : previous.postNumber + item.str;
      previous.last = item;
    } else anchors.push({ postNumber: item.str, y: item.y, first: item, last: item });
  }
  return { header, footer, body, column, anchors };
}

/** The viewer uses the same physical post-column anchors as the inventory.
 * Coordinates stay in PDF user space; they never depend on OCR text or amount. */
export function pdfPostColumnBounds(input: readonly unknown[]) {
  const layout = pdfPostColumnLayout(input);
  if (!layout) return undefined;
  const { header, footer, anchors } = layout;
  const headerBottom = header.y - Math.max(6, header.height);
  return {
    header: { top: header.y + header.height + 4, bottom: headerBottom },
    bodyBottom: footer.length ? Math.max(...footer.map(item => item.y + item.height + 5)) : 0,
    posts: anchors.map((anchor,index) => ({
      postNumber: anchor.postNumber.replace(/\.$/, ""),
      top: Math.min(headerBottom, anchor.y + anchor.first.height + 4),
      bottom: index + 1 < anchors.length ? anchors[index + 1].y + anchors[index + 1].first.height + 4
        : footer.length ? Math.max(...footer.map(item => item.y + item.height + 5)) : 0
    }))
  };
}

export function pdfPostInventoryFromItems(input: readonly unknown[]): PostInventory | undefined {
  const layout = pdfPostColumnLayout(input);
  if (!layout) return undefined;
  const { body, column, anchors } = layout;
  const consumed = new Set(column);
  return { method: "column", posts: anchors.map((anchor, index) => {
    const block = body.filter(item => !consumed.has(item) && item.y <= anchor.y + 5
      && (index + 1 === anchors.length || item.y > anchors[index + 1].y + 5));
    const postNumber = anchor.postNumber.replace(/\.$/, "");
    return { postNumber, sourceText: `${postNumber}\n${layoutTextFromPdfItems(block)}`.trim() };
  }) };
}

/** Text/OCR fallback inventories explicit identifiers, never inferred sequence
 * numbers. Syntax helpers only assemble wrapped identifiers; inclusion is not
 * conditional on a quantity, NS code, title length or product classification. */
export function textPostInventory(text: string): PostInventory {
  const lines = normalizedPageLines(text);
  const starts: Array<{ lineIndex: number; postNumber: string }> = [];
  const table = lines.some(line => /^Post\s*(?:nr|nummer)[.:\s]/i.test(line));
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], previous = lines[index - 1] ?? "";
    if (isTechnicalDescriptionDateHeader(line.split(/\s/)[0])) continue;
    // Building/chapter headers describe the page, not a left-column post.
    if (/^\d{3,6}\s+[A-ZÆØÅ][\wÆØÅæøå-]*\s+[-–—]\s+\d/.test(line)
      || /^\d{2}\s+(?:VVS|Brannslokking|Sanitær)\b/i.test(line)
      || /\bSide\s+\d+(?:-\d+)?\s*$/i.test(line)) continue;
    if (/(?:beskrevet\s+under|se|henvises\s+til|bestemmelser,?)\s+post(?:\s*(?:nr\.?|nummer))?\s*:?\s*$/i.test(previous)
      || /(?:^|[_\s])IO[- ]liste(?:\s+fordeling)?\s*$/i.test(previous)) continue;
    if (numberedPostHeading(previous, line)) continue;
    const explicit = line.match(/^((?:[A-Z]\d*\.)?\d+(?:\.\d+)+)\.?(?=\s|[|)]|$)/i);
    const short = table ? line.match(/^(\d{1,6})\s+[A-ZÆØÅa-zæøå]/) : null;
    const parsed = parseStructuredPostStart(lines, index);
    if (!explicit && !short && !parsed) continue;
    const postNumber = parsed?.postNumber ?? explicit?.[1] ?? short![1];
    starts.push({ lineIndex: index, postNumber });
    index += (parsed?.consumedLineCount ?? 1) - 1;
  }
  return { method: "text", posts: starts.map((start, index) => ({ postNumber: start.postNumber,
    sourceText: lines.slice(start.lineIndex, starts[index + 1]?.lineIndex)
      .filter(line => !isPdfTableTotalFooter(line) && !/^(?:Prosjekt:|Kapittel:|Postnr[.:]|Side\s+\d|Kopi-)/i.test(line)).join("\n") })) };
}

export function pagePostInventory(page: TechnicalDescriptionPage): PostInventory {
  if (page.postInventory) return page.postInventory;
  if (page.postTable) {
    const lines = page.postTable.text.split(/\r?\n/);
    return { method: "column", posts: page.postTable.posts.map((post, index, posts) => ({
      postNumber: post.postNumber, sourceText: lines.slice(post.lineIndex, posts[index + 1]?.lineIndex).join("\n")
    })) };
  }
  return textPostInventory(page.text);
}
