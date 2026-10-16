import type { TechnicalDescriptionPage } from "./types";
import { numberedChaptersFromPages } from "./chapters";
import {
  NS3420_CODE_PATTERN, extractInlineAttributes, extractPostScope, extractTableAttributes,
  findTableQuantity, footerIndex, normalizedPageLines, parseStructuredPostStart,
  recoverDisplacedOcrPostNumbers, recoverMissingStructuredPostNumbers, tableDescription,
  type StructuredPostStart
} from "./document-parser";

export type PdfDocumentNode = {
  id: string;
  kind: "chapter" | "post";
  number: string;
  title: string;
  code?: string;
  parentId?: string;
  sourcePages: number[];
  /** This node's own source, separate from its ancestors. */
  text: string;
  quantity?: number;
  unit?: string;
  attributes: Record<string, string>;
  /** Combined source and fields; an explicit child field takes precedence. */
  specification: string;
  effectiveAttributes: Record<string, string>;
  children: PdfDocumentNode[];
};

export type PdfDocumentStructure = {
  version: 1;
  fileName?: string;
  pageCount: number;
  chapters: PdfDocumentNode[];
  /** All original pages remain available, including pages without numbered posts. */
  pages: TechnicalDescriptionPage[];
};

/** A document model independent of products, trades, catalogues and matching. */
export function buildPdfDocumentStructure(
  pages: readonly TechnicalDescriptionPage[], fileName?: string
): PdfDocumentStructure {
  const prepared = recoverMissingStructuredPostNumbers(pages.map(page =>
    page.method === "ocr" ? recoverDisplacedOcrPostNumbers(normalizedPageLines(page.text)) : normalizedPageLines(page.text)));
  const headings = numberedChaptersFromPages(pages);
  const postNumbers = prepared.pageLines.flatMap(lines => lines.flatMap((_, index) => {
    const start = parseStructuredPostStart(lines, index);
    return start ? [start.postNumber] : [];
  }));
  const roots: PdfDocumentNode[] = [];
  const contexts = new Map<string, PdfDocumentNode>();
  let scope = "";
  let scopeChapter: PdfDocumentNode | undefined;
  let previous: PdfDocumentNode | undefined;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const lines = prepared.pageLines[pageIndex];
    const pageScope = extractPostScope(lines);
    if (pageScope && pageScope !== scope) {
      contexts.clear();
      previous = undefined;
      scope = pageScope;
      const header = lines.find(line => /^Kapittel:/i.test(line))!;
      const segments = header.replace(/^Kapittel:\s*/i, "").split(/\s+-\s+/).filter(Boolean);
      scopeChapter = undefined;
      for (const [index, segment] of segments.entries()) {
        const heading = segment.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
        const node: PdfDocumentNode = {
          id: `pdf-chapter-${page.pageNumber}-${index}`, kind: "chapter",
          number: heading?.[1] ?? "", title: heading?.[2] ?? segment,
          parentId: scopeChapter?.id, sourcePages: [page.pageNumber], text: segment,
          attributes: {}, effectiveAttributes: {}, specification: "", children: []
        };
        (scopeChapter?.children ?? roots).push(node);
        scopeChapter = node;
      }
    }
    const starts: Array<StructuredPostStart & { chapter?: boolean }> = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const chapter = headings.find(heading => heading.sourcePage === page.pageNumber
        && line.replace(/\s/g, "") === heading.label.replace(/\s/g, ""));
      const singleHeading = line.match(/^(\d{1,6})\s+([A-ZÆØÅÄÖ][^\n]+)$/);
      const parsed = parseStructuredPostStart(lines, index);
      const hasDescendants = (number: string) => postNumbers.some(post => post.startsWith(`${number}.`));
      const hasCode = parsed && NS3420_CODE_PATTERN.test(parsed.description || lines[index + parsed.consumedLineCount] || "");
      // Numbers inside specification prose are not automatically post numbers.
      // A short heading needs numbering evidence or an actual coded/quantity row.
      const isSupportedStart = parsed && (parsed.postNumber.includes(".")
        || parsed.quantity || hasCode || hasDescendants(parsed.postNumber)
        || findTableQuantity(lines.slice(index + parsed.consumedLineCount, index + parsed.consumedLineCount + 2)));
      const unrelatedSystemReference = parsed && /^\d{3}\.\d{3}$/.test(parsed.postNumber)
        && !hasCode && !parsed.quantity && roots.length > 0
        && ![...contexts.values()].some(node => parsed.postNumber.startsWith(`${node.number}.`));
      if (chapter) {
        starts.push({ lineIndex: index, consumedLineCount: 1, postNumber: chapter.number,
          description: chapter.label.slice(chapter.number.length).trim(), chapter: true });
      } else if (isSupportedStart && !unrelatedSystemReference) {
        starts.push(parsed);
        index += parsed.consumedLineCount - 1;
      } else if (singleHeading && !NS3420_CODE_PATTERN.test(singleHeading[2])
        && hasDescendants(singleHeading[1]) && !findTableQuantity([line]) && !/\.{2,}/.test(line)) {
        starts.push({ lineIndex: index, consumedLineCount: 1, postNumber: singleHeading[1],
          description: singleHeading[2], chapter: true });
      }
    }

    // Preserve continuation prose without adding page headers to a post.
    const leading = lines.slice(0, Math.min(starts[0]?.lineIndex ?? lines.length, footerIndex(lines, -1)))
      .filter(line => !isDocumentFurniture(line));
    if (previous && previous.sourcePages.at(-1) === page.pageNumber - 1 && leading.length
      && !leading.some(line => NS3420_CODE_PATTERN.test(line))) {
      appendText(previous, leading.join("\n"), page.pageNumber);
    }

    for (let index = 0; index < starts.length; index++) {
      const start = starts[index];
      const end = Math.min(starts[index + 1]?.lineIndex ?? lines.length, footerIndex(lines, start.lineIndex));
      const body = [start.description, ...lines.slice(start.lineIndex + start.consumedLineCount, end)]
        .filter(line => line && !isDocumentFurniture(line));
      const quantity = start.quantity ?? findTableQuantity(body);
      const titleParts = quantity && !start.quantity ? body.slice(0, quantity.lineIndex) : body;
      if (!start.quantity && quantity?.descriptionPrefix) titleParts.push(quantity.descriptionPrefix);
      const parsed = tableDescription(titleParts);
      const text = lines.slice(start.lineIndex, end).filter(line => !isDocumentFurniture(line)).join("\n");
      const existing = contexts.get(start.postNumber);
      if (existing && existing.sourcePages.at(-1) === page.pageNumber - 1) {
        appendText(existing, text, page.pageNumber);
        previous = existing;
        continue;
      }
      const parent = [...contexts.values()].filter(node => start.postNumber.startsWith(`${node.number}.`))
        .sort((left, right) => right.number.length - left.number.length)[0] ?? scopeChapter;
      const node: PdfDocumentNode = {
        id: `pdf-node-${page.pageNumber}-${start.lineIndex}-${start.postNumber}`,
        kind: start.chapter ? "chapter" : "post", number: start.postNumber,
        title: start.chapter ? start.description : parsed.description || start.description, code: parsed.nsCode,
        parentId: parent?.id, sourcePages: [page.pageNumber], text,
        quantity: quantity?.quantity, unit: quantity?.unit,
        attributes: { ...extractTableAttributes(body), ...extractInlineAttributes(parsed.description) },
        specification: "", effectiveAttributes: {}, children: []
      };
      (parent?.children ?? roots).push(node);
      contexts.set(node.number, node);
      previous = node;
    }
  }

  const inherit = (nodes: PdfDocumentNode[], parent?: PdfDocumentNode) => {
    for (const node of nodes) {
      node.specification = [parent?.specification, node.text].filter(Boolean).join("\n\nUNDERPOST\n");
      node.effectiveAttributes = { ...parent?.effectiveAttributes, ...node.attributes };
      // Codes belong to the specification; dimensions and quantities remain local.
      node.code ??= parent?.code;
      inherit(node.children, node);
    }
  };
  inherit(roots);
  return { version: 1, fileName, pageCount: pages.length, chapters: roots, pages: [...pages] };
}

function appendText(node: PdfDocumentNode, text: string, page: number) {
  node.text += `\n\n${text}`;
  node.sourcePages.push(page);
  node.attributes = { ...node.attributes, ...extractTableAttributes(node.text.split("\n")) };
  const quantity = findTableQuantity(text.split("\n"));
  if (node.quantity === undefined && quantity) {
    node.quantity = quantity.quantity;
    node.unit = quantity.unit;
  }
}

function isDocumentFurniture(line: string) {
  return /^(?:Prosjekt:|Objekt:|Kapittel:|Postnr(?:[.:]|\s|$)|Side\s+\d|Sum(?: denne side)?\s*:|Akkumulert\b)/i.test(line)
    || /^\d{1,2}\.\d{1,2}\.(?:19|20)\d{2}$/.test(line);
}
