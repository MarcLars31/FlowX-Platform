import type {
  TechnicalDescriptionCategory,
  TechnicalDescriptionExtractionResult,
  TechnicalDescriptionMaterialLine,
  TechnicalDescriptionPage,
  TechnicalDescriptionRuleHint,
  TechnicalDescriptionWarning
} from "./types";

type ExtractOptions = {
  fileName?: string;
};

const ITEM_CODE_PATTERN =
  /^\s*(?:(\d{2}\.\d{3}(?:\.\d+)?)\s*[|:]?\s*)?([A-ZÆØÅ]{2}\d[\w.-]*)\b/i;
const POST_NUMBER_PATTERN = /^\s*(\d{2}\.\d{3}(?:\.\d+)?)/;
const NS_CODE_PATTERN = /\b([A-ZÆØÅ]{2}\d[\w.-]*)\b/i;
const STANDARD_PATTERN =
  /\b((?:NS(?:[-\s]?EN)?|NFPA)\s*\d+(?:[-:]\d+)*(?:\s*\+\s*\d+)*)\b/gi;
const ATTRIBUTE_PATTERN = /^\s*([^:]{2,60}):\s*(.*?)\s*$/;
const NS3420_CODE_PATTERN =
  /^(%?[A-ZÆØÅ][A-ZÆØÅ0-9]*\.[A-ZÆØÅ0-9.]+[A-ZÆØÅ]?)\s*(?:-\s*)?(.*)$/i;
const TABLE_QUANTITY_PATTERN = new RegExp(
  String.raw`(?:^|\s)(?:Antall\s+)?(stk|st|pcs?|m|lm|meter|løpemeter|m2|m²|m3|m³|kg|l)\s+(\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?=\s|$)`,
  "i"
);

const ATTRIBUTE_KEYS = [
  "sprinkleranlegg",
  "type sprinkler",
  "plassering",
  "følsomhetsgrad",
  "folsomhetsgrad",
  "utløsningstemperatur",
  "utlesningstemperatur",
  "lokalisering",
  "k-faktor",
  "trykk",
  "gjengedimensjon (dn)",
  "overflatebehandling",
  "dekkskive/pyntering (ved innfelling)",
  "beskyttelse",
  "dokumentasjon"
];

export function extractTechnicalDescriptionFromPages(
  pages: TechnicalDescriptionPage[],
  options: ExtractOptions = {}
): TechnicalDescriptionExtractionResult {
  const warnings: TechnicalDescriptionWarning[] = [];
  const project = extractProject(pages);
  const materialLines = extractMaterialLines(pages, warnings);
  const standards = unique(
    pages.flatMap((page) =>
      [...page.text.matchAll(STANDARD_PATTERN)].map((match) =>
        normalizeStandard(match[1])
      )
    )
  );
  const ruleHints = extractRuleHints(pages);
  const extractionMethod = getExtractionMethod(pages);

  if (pages.every((page) => page.text.length === 0)) {
    warnings.push({
      id: "technical-description-no-text",
      code: "NO_TEXT",
      message: "No text or OCR content could be extracted from the document.",
      severity: "warning"
    });
  }

  if (materialLines.length === 0) {
    warnings.push({
      id: "technical-description-no-material-lines",
      code: "NO_MATERIAL_LINES",
      message: "No technical-description material rows were detected.",
      severity: "warning"
    });
  }

  const missingQuantityLines = materialLines.filter(
    (line) => line.quantity === undefined && line.operation !== "remove"
  );
  if (missingQuantityLines.length > 0) {
    warnings.push({
      id: "technical-description-missing-quantities",
      code: "MISSING_QUANTITY",
      message:
        String(missingQuantityLines.length) +
        " material row(s) need a quantity review.",
      severity: "warning"
    });
  }

  return {
    document: {
      fileName: options.fileName,
      pageCount: pages.length,
      extractionMethod,
      extractedAt: new Date().toISOString()
    },
    project,
    materialLines,
    standards,
    ruleHints,
    pages,
    warnings
  };
}

function extractProject(pages: TechnicalDescriptionPage[]) {
  for (const page of pages) {
    const projectMatch = page.text.match(
      /Prosjekt:\s*([^\r\n\t]+?)(?=\s+Side\b|$)/i
    );
    const chapterMatch = page.text.match(/Kapittel:\s*([^\n]+)/i);
    if (!projectMatch && !chapterMatch) continue;

    const projectName = projectMatch?.[1]?.trim();
    const projectNumber = projectName?.match(/^([A-Z]?\.?[\d.]+)/i)?.[1];
    return {
      name: projectName,
      projectNumber,
      chapter: chapterMatch?.[1]?.trim(),
      sourcePage: page.pageNumber,
      confidence: page.method === "ocr" ? page.confidence : 0.98
    };
  }

  return { confidence: 0.35 };
}

function extractMaterialLines(
  pages: TechnicalDescriptionPage[],
  warnings: TechnicalDescriptionWarning[]
) {
  const structuredLines = extractNs3420TableLines(pages);
  const legacyWarnings: TechnicalDescriptionWarning[] = [];
  const legacyLines = extractLegacyMaterialLines(pages, legacyWarnings);

  if (structuredLines.length === 0) {
    warnings.push(...legacyWarnings);
    return legacyLines;
  }

  const structuredUsable = usableMaterialLineCount(structuredLines);
  const legacyUsable = usableMaterialLineCount(legacyLines);
  if (
    (structuredLines.length >= 2 && structuredUsable === structuredLines.length) ||
    structuredUsable >= legacyUsable ||
    materialLineQuality(structuredLines) >= materialLineQuality(legacyLines)
  ) {
    return structuredLines;
  }

  warnings.push(...legacyWarnings);
  return legacyLines;
}

function usableMaterialLineCount(lines: TechnicalDescriptionMaterialLine[]) {
  return lines.filter(
    (line) => line.quantity !== undefined || line.operation === "remove"
  ).length;
}

function materialLineQuality(lines: TechnicalDescriptionMaterialLine[]) {
  return lines.reduce(
    (score, line) =>
      score +
      (line.postNumber ? 2 : -2) +
      (line.quantity !== undefined ? 3 : line.operation === "remove" ? 1 : -1) +
      (line.category === "unknown" ? -0.5 : 1) -
      (line.reviewFlags.includes("inferred-post-number") ? 3 : 0),
    0
  );
}

function extractLegacyMaterialLines(
  pages: TechnicalDescriptionPage[],
  warnings: TechnicalDescriptionWarning[]
) {
  const lines: TechnicalDescriptionMaterialLine[] = [];
  let previousPostNumber: string | undefined;
  const knownPostNumbers = pages.flatMap((page) =>
    [...page.text.matchAll(/\b\d{2}\.\d{3}(?:\.\d+)?\b/g)].map(
      (match) => match[0]
    )
  );

  for (const page of pages) {
    const pageLines = page.text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    let current: ParsedBlock | undefined;
    let pendingPostNumber: string | undefined;

    const flush = () => {
      if (!current) return;
      const line = buildMaterialLine(current, page);
      if (line) lines.push(line);
      current = undefined;
    };

    for (const rawLine of pageLines) {
      const itemMatch = rawLine.match(ITEM_CODE_PATTERN);
      const standalonePost = rawLine.match(POST_NUMBER_PATTERN);

      if (itemMatch || standalonePost) {
        flush();

        if (itemMatch) {
          const postNumber =
            itemMatch[1] ??
            pendingPostNumber ??
            inferNextPostNumber(previousPostNumber) ??
            inferPreviousPostNumber(knownPostNumbers[0]);
          const nsCode = itemMatch[2] ?? rawLine.match(NS_CODE_PATTERN)?.[1];
          current = createBlock(
            postNumber,
            nsCode,
            rawLine,
            page,
            !itemMatch[1]
          );
          previousPostNumber = postNumber;
          pendingPostNumber = undefined;
          if (!itemMatch[1]) {
            warnings.push({
              id:
                "inferred-post-" +
                String(page.pageNumber) +
                "-" +
                String(lines.length + 1),
              code: "INFERRED_POST_NUMBER",
              message: "Post number was inferred for " + (nsCode ?? "an item") + ".",
              sourcePage: page.pageNumber,
              sourceText: rawLine,
              severity: "warning"
            });
          }
          continue;
        }

        if (standalonePost && !rawLine.match(NS_CODE_PATTERN)) {
          pendingPostNumber = standalonePost[1];
          previousPostNumber = standalonePost[1];
          continue;
        }

        if (standalonePost) {
          current = createBlock(standalonePost[1], undefined, rawLine, page);
          previousPostNumber = standalonePost[1];
          continue;
        }
      }

      if (!current) continue;
      current.lines.push(rawLine);
      const attributeMatch = rawLine.match(ATTRIBUTE_PATTERN);
      if (attributeMatch && isKnownAttribute(attributeMatch[1])) {
        const key = normalizeAttributeKey(attributeMatch[1]);
        current.attributes[key] = attributeMatch[2].trim();
      }

      const quantity = parseQuantityLine(rawLine);
      if (quantity) {
        current.quantity = quantity.quantity;
        current.quantityText = quantity.text;
        current.unit = quantity.unit;
      }

      current.standardRefs.push(
        ...[...rawLine.matchAll(STANDARD_PATTERN)].map((match) =>
          normalizeStandard(match[1])
        )
      );
    }

    flush();
  }

  return lines;
}

function extractNs3420TableLines(pages: TechnicalDescriptionPage[]) {
  const materialLines: TechnicalDescriptionMaterialLine[] = [];
  const seen = new Set<string>();
  const parentContexts = new Map<string, TableParentContext>();

  for (const page of pages) {
    const pageLines = normalizedPageLines(page.text);
    if (!isFireProtectionPage(page.text)) continue;
    const chapterPost = extractChapterPost(pageLines);

    const starts: StructuredPostStart[] = [];
    for (let index = 0; index < pageLines.length; index += 1) {
      const start = parseStructuredPostStart(pageLines, index);
      if (!start) continue;
      starts.push(start);
      index += start.consumedLineCount - 1;
    }

    for (let startIndex = 0; startIndex < starts.length; startIndex += 1) {
      const start = starts[startIndex];
      const blockEnd = Math.min(
        starts[startIndex + 1]?.lineIndex ?? pageLines.length,
        footerIndex(pageLines, start.lineIndex)
      );
      const bodyStart = start.lineIndex + start.consumedLineCount;
      const blockLines = [
        ...(start.description ? [start.description] : []),
        ...pageLines.slice(bodyStart, blockEnd)
      ];
      const quantity = start.quantity ?? findTableQuantity(blockLines);
      const fullPostNumber = start.postNumber;
      const descriptionParts = start.quantity
        ? blockLines
        : quantity
          ? blockLines.slice(0, quantity.lineIndex)
          : blockLines;
      if (quantity?.descriptionPrefix) {
        descriptionParts.push(quantity.descriptionPrefix);
      }
      const parsedDescription = tableDescription(descriptionParts);
      const nsCode = parsedDescription.nsCode;
      const description = parsedDescription.description
        || (start.quantity ? start.description.trim() : "");
      const sourceText = pageLines.slice(start.lineIndex, blockEnd).join("\n");
      const ownAttributes = {
        ...(chapterPost ? { kapittelpost: chapterPost } : {}),
        ...extractTableAttributes(blockLines),
        ...extractInlineAttributes(description)
      };
      const ownStandardRefs = unique(
        [...sourceText.matchAll(STANDARD_PATTERN)].map((match) =>
          normalizeStandard(match[1])
        )
      );
      const parent = findTableParent(parentContexts, fullPostNumber);
      const ownCategory = inferCategory(`${description}\n${sourceText}`.toLocaleLowerCase());
      const category = ownCategory === "unknown"
        ? parent?.category ?? ownCategory
        : ownCategory;
      const system = inferSystem(`${description}\n${sourceText}`.toLocaleLowerCase()) ?? parent?.system;

      if (
        nsCode ||
        description ||
        category !== "unknown" ||
        Object.keys(ownAttributes).length > 0
      ) {
        parentContexts.set(fullPostNumber, {
          postNumber: fullPostNumber,
          nsCode: nsCode ?? parent?.nsCode,
          category,
          attributes: {
            ...(parent?.attributes ?? {}),
            ...ownAttributes
          },
          system,
          standardRefs: unique([...(parent?.standardRefs ?? []), ...ownStandardRefs]),
          sourceText: parent
            ? `${parent.sourceText}\n\nUNDERPOST\n${sourceText}`
            : sourceText
        });
      }

      const normalizedText = `${description}\n${sourceText}\n${parent?.sourceText ?? ""}`.toLocaleLowerCase();
      const operation = inferOperation(normalizedText, Boolean(quantity));
      if (!quantity || quantity.quantity <= 0) continue;

      const key = fullPostNumber;
      if (seen.has(key)) {
        continue;
      }
      const attributes = {
        ...(parent?.attributes ?? {}),
        ...ownAttributes
      };
      const reviewFlags: string[] = [];
      if (category === "unknown") reviewFlags.push("unknown-category");
      if (page.method === "ocr") reviewFlags.push("ocr-source");
      if (!quantity && operation !== "remove") reviewFlags.push("missing-quantity");
      if (category === "pipe" && quantity && quantity.unit !== "m") {
        reviewFlags.push("pipe-unit-not-length");
      }

      materialLines.push({
        id: `technical-material-${page.pageNumber}-${fullPostNumber.replace(/[^a-zA-Z0-9]+/g, "-")}`,
        postNumber: fullPostNumber,
        parentPostNumber: parent?.postNumber,
        nsCode: nsCode ?? parent?.nsCode,
        category,
        description: description || categoryLabel(category),
        operation,
        quantity: quantity?.quantity,
        quantityText: quantity?.text,
        unit: quantity?.unit,
        attributes,
        system: inferSystem(normalizedText) ?? parent?.system,
        standardRefs: unique([
          ...(parent?.standardRefs ?? []),
          ...ownStandardRefs
        ]),
        technicalSpecification: parent
          ? `${parent.sourceText}\n\nUNDERPOST\n${sourceText}`
          : sourceText,
        sourcePage: page.pageNumber,
        sourceText,
        confidence: Math.min(
          0.99,
          Math.max(
            0.45,
            page.confidence -
              (category === "unknown" ? 0.12 : 0) -
              (page.method === "ocr" ? 0.04 : 0)
          )
        ),
        reviewFlags
      });
      seen.add(key);
    }
  }

  return materialLines;
}

type StructuredPostStart = {
  lineIndex: number;
  consumedLineCount: number;
  postNumber: string;
  description: string;
  quantity?: {
    quantity: number;
    text: string;
    unit: string;
    lineIndex: number;
    descriptionPrefix: string;
  };
};

const STRUCTURED_NUMBER_SOURCE = String.raw`(?:\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;
const STRUCTURED_UNIT_SOURCE = String.raw`(?:stk|st|pcs?|m|lm|meter|løpemeter|m2|m²|m3|m³|kg|l)`;
const LEADING_QUANTITY_POST_PATTERN = new RegExp(
  String.raw`^(?:(?:Antall|Lengde)\s+)?(?<unit>${STRUCTURED_UNIT_SOURCE})\.?\s+(?<quantity>${STRUCTURED_NUMBER_SOURCE})(?:\s+${STRUCTURED_NUMBER_SOURCE}){1,3}\s+(?<post>\d+(?:\.\d+){1,7}\.?)\s*(?<description>.*)$`,
  "i"
);
const LEADING_LUMP_SUM_POST_PATTERN = new RegExp(
  String.raw`^RS(?:\s+${STRUCTURED_NUMBER_SOURCE}){1,3}\s+(?<post>\d+(?:\.\d+){1,7}\.?)\s*(?<description>.*)$`,
  "i"
);
const TRAILING_QUANTITY_POST_PATTERN = new RegExp(
  String.raw`^(?<post>\d+(?:\.\d+){1,7}\.?)\s+(?<description>.+?)\s+(?<unit>${STRUCTURED_UNIT_SOURCE})\.?\s+(?<quantity>${STRUCTURED_NUMBER_SOURCE})(?:\s+${STRUCTURED_NUMBER_SOURCE}){1,3}$`,
  "i"
);
const FULL_POST_LINE_PATTERN = /^(\d+(?:\.\d+){1,7})\s+(.+)$/;
const PARENT_POST_LINE_PATTERN = /^(\d{1,4})\s+((?:%?[A-ZÆØÅ]{1,10}\d[\w.%-]*|[A-ZÆØÅ][A-ZÆØÅ /-]{4,}))$/;
const EXACT_POST_LINE_PATTERN = /^(\d+(?:\.\d+){1,7}\.?)$/;
const POST_CONTINUATION_PATTERN = /^(\.?\d+(?:\.\d+)*)\s*(.*)$/;

function parseStructuredPostStart(
  lines: string[],
  lineIndex: number
): StructuredPostStart | undefined {
  const line = lines[lineIndex];
  const trailingQuantity = line.match(TRAILING_QUANTITY_POST_PATTERN);
  if (trailingQuantity?.groups) {
    const quantityValue = parseLocalizedNumber(trailingQuantity.groups.quantity);
    if (quantityValue === undefined) return undefined;
    return completeStructuredStart({
      lines,
      lineIndex,
      post: trailingQuantity.groups.post,
      description: trailingQuantity.groups.description,
      quantity: {
        quantity: quantityValue,
        unit: normalizeUnit(trailingQuantity.groups.unit),
        text: `${trailingQuantity.groups.quantity} ${trailingQuantity.groups.unit}`,
        lineIndex: 0,
        descriptionPrefix: ""
      }
    });
  }

  const leadingQuantity = line.match(LEADING_QUANTITY_POST_PATTERN);
  if (leadingQuantity?.groups) {
    const quantityValue = parseLocalizedNumber(leadingQuantity.groups.quantity);
    if (quantityValue === undefined) return undefined;
    return completeStructuredStart({
      lines,
      lineIndex,
      post: leadingQuantity.groups.post,
      description: leadingQuantity.groups.description,
      quantity: {
        quantity: quantityValue,
        unit: normalizeUnit(leadingQuantity.groups.unit),
        text: `${leadingQuantity.groups.unit} ${leadingQuantity.groups.quantity}`,
        lineIndex: 0,
        descriptionPrefix: ""
      }
    });
  }

  const leadingLumpSum = line.match(LEADING_LUMP_SUM_POST_PATTERN);
  if (leadingLumpSum?.groups) {
    return completeStructuredStart({
      lines,
      lineIndex,
      post: leadingLumpSum.groups.post,
      description: leadingLumpSum.groups.description
    });
  }

  const fullPost = line.match(FULL_POST_LINE_PATTERN);
  if (fullPost) {
    return {
      lineIndex,
      consumedLineCount: 1,
      postNumber: fullPost[1],
      description: fullPost[2].trim()
    };
  }

  const parentPost = line.match(PARENT_POST_LINE_PATTERN);
  if (parentPost) {
    return {
      lineIndex,
      consumedLineCount: 1,
      postNumber: parentPost[1],
      description: parentPost[2].trim()
    };
  }

  const exactPost = line.match(EXACT_POST_LINE_PATTERN);
  if (!exactPost) return undefined;
  return completeStructuredStart({
    lines,
    lineIndex,
    post: exactPost[1],
    description: ""
  });
}

function completeStructuredStart({
  lines,
  lineIndex,
  post,
  description,
  quantity
}: {
  lines: string[];
  lineIndex: number;
  post: string;
  description: string;
  quantity?: StructuredPostStart["quantity"];
}): StructuredPostStart {
  const cleanPost = post.trim();
  if (description.trim()) {
    return {
      lineIndex,
      consumedLineCount: 1,
      postNumber: cleanPost.replace(/\.$/, ""),
      description: description.trim(),
      quantity
    };
  }

  const continuation = lines[lineIndex + 1]?.match(POST_CONTINUATION_PATTERN);
  if (!continuation) {
    return {
      lineIndex,
      consumedLineCount: 1,
      postNumber: cleanPost.replace(/\.$/, ""),
      description: "",
      quantity
    };
  }

  const continuationNumber = continuation[1];
  return {
    lineIndex,
    consumedLineCount: 2,
    postNumber: composeWrappedPostNumber(cleanPost, continuationNumber),
    description: continuation[2].trim(),
    quantity
  };
}

function composeWrappedPostNumber(base: string, continuation: string) {
  if (continuation.startsWith(".")) {
    return `${base.replace(/\.$/, "")}${continuation}`;
  }
  if (base.endsWith(".")) return `${base}${continuation}`;
  return `${base} ${continuation}`;
}

function footerIndex(lines: string[], afterIndex: number) {
  const offset = lines.slice(afterIndex + 1).findIndex(isTableFooter);
  return offset < 0 ? lines.length : afterIndex + 1 + offset;
}

function findTableParent(
  contexts: Map<string, TableParentContext>,
  postNumber: string
) {
  return [...contexts.values()]
    .filter((context) => postNumber.startsWith(`${context.postNumber}.`))
    .sort((left, right) => right.postNumber.length - left.postNumber.length)[0];
}

function isFireProtectionPage(text: string) {
  return /sprinkler|brann(?:slokk|vann|vern)|slokke(?:anlegg|gass|vann)|inergen|håndslukker/i.test(text);
}

type TableParentContext = {
  postNumber: string;
  nsCode?: string;
  category: TechnicalDescriptionCategory;
  attributes: Record<string, string>;
  system?: string;
  standardRefs: string[];
  sourceText: string;
};

function normalizedPageLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractChapterPost(lines: string[]) {
  const chapterLine = lines.find((line) => /^Kapittel:/i.test(line));
  if (!chapterLine) return undefined;
  const chapterPath = chapterLine.replace(/^Kapittel:\s*/i, "");
  const segments = [...chapterPath.matchAll(
    /(?:^|\s+-\s+)(\d{2,6})\s+(.+?)(?=\s+-\s+\d{2,6}\s+|$)/g
  )];
  const last = segments.at(-1);
  return last ? `${last[1]} ${last[2].trim()}` : undefined;
}

function isTableFooter(value: string) {
  return /^(?:Sum denne side|Akkumulert\b|Prosjekt:|Postnr:)/i.test(value);
}

function findTableQuantity(lines: string[]) {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const match = line.match(TABLE_QUANTITY_PATTERN);
    if (!match) continue;

    const quantity = parseLocalizedNumber(match[2]);
    if (quantity === undefined) continue;

    return {
      quantity,
      unit: normalizeUnit(match[1]),
      text: match[0].trim(),
      lineIndex,
      descriptionPrefix: line.slice(0, match.index).trim()
    };
  }

  return undefined;
}

function tableDescription(parts: string[]) {
  const cleaned = parts.map((part) => part.trim()).filter(Boolean);
  let nsCode: string | undefined;

  for (let index = 0; index < cleaned.length; index += 1) {
    const codeMatch = cleaned[index].match(NS3420_CODE_PATTERN);
    if (!codeMatch) continue;
    nsCode = codeMatch[1];
    if (codeMatch[2]) cleaned[index] = codeMatch[2].trim();
    else cleaned.splice(index, 1);
    break;
  }

  const descriptionParts: string[] = [];
  for (const part of cleaned) {
    if (ATTRIBUTE_PATTERN.test(part) || /^(?:Andre krav|[a-z]\))/i.test(part)) break;
    descriptionParts.push(part);
  }

  return {
    nsCode,
    description: descriptionParts.join(" ").replace(/\s+/g, " ").trim()
  };
}

function extractTableAttributes(lines: string[]) {
  const attributes: Record<string, string> = {};
  let activeKey: string | null = null;

  for (const line of lines) {
    const match = line.match(ATTRIBUTE_PATTERN);
    if (match) {
      activeKey = null;
      if (!match[2].trim()) continue;
      const key = normalizeAttributeKey(match[1]);
      if (["gjelder", "andre krav", "postnr"].includes(key)) continue;
      attributes[key] = match[2].trim();
      activeKey = key;
      continue;
    }

    if (
      activeKey &&
      !/^(?:[a-z]\)|Sum denne side|Akkumulert|Prosjekt:|\d{2}\.\d{2}\.\d{4})/i.test(line)
    ) {
      attributes[activeKey] = `${attributes[activeKey]} ${line}`.replace(/\s+/g, " ");
    }
  }

  return attributes;
}

function extractInlineAttributes(description: string) {
  const attributes: Record<string, string> = {};
  const dimensions = unique(
    [...description.matchAll(/\bDN\s*\d+(?:\s*-\s*DN?\s*\d+)*/gi)].map(
      (match) => match[0].replace(/\s+/g, "")
    )
  );
  if (dimensions.length > 0) attributes.dimensjon = dimensions.join(", ");

  const kFactor = description.match(/\bK\s*[=-]\s*(\d+(?:[.,]\d+)?)/i)?.[1];
  if (kFactor) attributes["k-faktor"] = kFactor.replace(",", ".");

  const temperature = description.match(/(-?\d+(?:[.,]\d+)?)\s*°\s*C\b/i)?.[1];
  if (temperature) {
    attributes["utløsningstemperatur"] = `${temperature.replace(",", ".")} °C`;
  }

  return attributes;
}

function inferSystem(text: string) {
  if (/sprinkler/.test(text)) return "sprinkler";
  if (/slokkegass|gasslokke|ig541/.test(text)) return "inert-gas";
  if (/tørr(?:opplegg|anlegg)/.test(text)) return "dry-fire-main";
  return undefined;
}

type ParsedBlock = {
  postNumber?: string;
  nsCode?: string;
  title: string;
  lines: string[];
  attributes: Record<string, string>;
  standardRefs: string[];
  quantity?: number;
  quantityText?: string;
  unit?: string;
  sourcePage: number;
  ocrConfidence: number;
  inferredPostNumber?: boolean;
};

function createBlock(
  postNumber: string | undefined,
  nsCode: string | undefined,
  rawLine: string,
  page: TechnicalDescriptionPage,
  inferredPostNumber = false
): ParsedBlock {
  return {
    postNumber,
    nsCode,
    title: rawLine.replace(ITEM_CODE_PATTERN, "").replace(POST_NUMBER_PATTERN, "").trim(),
    lines: [rawLine],
    attributes: {},
    standardRefs: [],
    sourcePage: page.pageNumber,
    ocrConfidence: page.confidence,
    inferredPostNumber
  };
}

function buildMaterialLine(
  block: ParsedBlock,
  page: TechnicalDescriptionPage
): TechnicalDescriptionMaterialLine | null {
  const sourceText = block.lines.join("\n");
  const normalizedText = sourceText.toLocaleLowerCase();
  const category = inferCategory(normalizedText);
  const description =
    block.title.replace(/\bSPRINKLER\b/gi, "").trim() ||
    block.attributes["type sprinkler"] ||
    categoryLabel(category);
  const operation = inferOperation(
    normalizedText,
    block.quantity !== undefined
  );
  const reviewFlags: string[] = [];

  if (block.quantity === undefined && operation !== "remove") {
    reviewFlags.push("missing-quantity");
  }
  if (category === "unknown") reviewFlags.push("unknown-category");
  if (page.method === "ocr") reviewFlags.push("ocr-source");
  if (!block.postNumber) reviewFlags.push("missing-post-number");
  if (block.inferredPostNumber) reviewFlags.push("inferred-post-number");

  const confidence = Math.min(
    0.99,
    Math.max(
      0.35,
      block.ocrConfidence -
        (reviewFlags.includes("missing-quantity") ? 0.2 : 0) -
        (reviewFlags.includes("unknown-category") ? 0.15 : 0) -
        (reviewFlags.includes("missing-post-number") ? 0.12 : 0)
    )
  );

  return {
    id:
      "technical-material-" +
      String(page.pageNumber) +
      "-" +
      (block.postNumber ?? String(block.lines.length)),
    postNumber: block.postNumber,
    nsCode: block.nsCode,
    category,
    description,
    operation,
    quantity: block.quantity,
    quantityText: block.quantityText,
    unit: block.unit,
    attributes: block.attributes,
    system: block.attributes.sprinkleranlegg,
    standardRefs: unique(block.standardRefs),
    technicalSpecification: sourceText,
    sourcePage: page.pageNumber,
    sourceText,
    confidence,
    reviewFlags
  };
}

function extractRuleHints(pages: TechnicalDescriptionPage[]) {
  const hints: TechnicalDescriptionRuleHint[] = [];
  for (const page of pages) {
    const spareMatch = page.text.match(/Hoder som er til overs[^.]*reservehoder/i);
    if (spareMatch) {
      hints.push({
        key: "sprinkler_head_reserve",
        value: "reserve_heads_are_required",
        sourcePage: page.pageNumber,
        sourceText: spareMatch[0],
        confidence: page.confidence
      });
    }

    const standardMatch = page.text.match(/NS[-\s]EN\s*12845/i);
    if (standardMatch) {
      hints.push({
        key: "sprinkler_standard",
        value: normalizeStandard(standardMatch[0]),
        sourcePage: page.pageNumber,
        sourceText: standardMatch[0],
        confidence: page.confidence
      });
    }
  }
  return uniqueHints(hints);
}

function inferCategory(text: string): TechnicalDescriptionCategory {
  if (/ventil|valve/.test(text)) return "valve";
  if (/fitting|bend|muffe|kobling|kupling|t-rør|t-klave|rørdel|overgang|endebunn|anborring|blindflens/.test(text)) {
    return "fitting";
  }
  if (/rør\b|rørledning|vannledning|stålrør|rillerør|rillede rør|sprinklerslange|\bpipe\b|red pipe/.test(text)) {
    return "pipe";
  }
  if (/oppheng|støtte|support/.test(text)) return "support";
  if (/kontroll|alarm|sensor|detektor|sentral|signalapparat|strømningsvakt|trykkvakt|måleinstrument|manometer|måleblende|kapasitetsmåler|kapasitetsmaaler|kompressor|melder/.test(text)) {
    return "control";
  }
  if (/\bsprinkler\b|sprinklerhode|sprinklerdyse|standard spray|utvidet dekning/.test(text)) {
    return "sprinkler_head";
  }
  return "unknown";
}

function inferOperation(text: string, hasQuantity: boolean) {
  if (/demontering|demontere|frakobling|fjerne|riving/.test(text)) {
    return "remove" as const;
  }
  if (/montering|installasjon|levering/.test(text) || hasQuantity) {
    return "install" as const;
  }
  return "unknown" as const;
}

function categoryLabel(category: TechnicalDescriptionCategory) {
  return {
    sprinkler_head: "Sprinklerhode",
    pipe: "Rør",
    fitting: "Fitting",
    valve: "Ventil",
    support: "Oppheng",
    control: "Kontrollutstyr",
    unknown: "Teknisk materiallinje"
  }[category];
}

function parseQuantityLine(value: string) {
  const match = value.match(
    /^\s*Antall\s+(stk|st|pcs?|m|lm|meter|løpemeter|m2|m²|m3|m³|kg|l)\s+(\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/i
  );
  if (!match) return undefined;
  return parseQuantity(match[2] + " " + match[1]);
}

function parseQuantity(value: string) {
  const match = value.match(
    /(\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(stk|st|pcs?|m|lm|meter|løpemeter|m2|m²|m3|m³|kg|l)/i
  );
  if (!match) return undefined;

  const quantity = parseLocalizedNumber(match[1]);
  if (quantity === undefined) return undefined;

  return {
    quantity,
    text: match[0].trim(),
    unit: normalizeUnit(match[2])
  };
}

function normalizeUnit(value: string) {
  const normalized = value.toLocaleLowerCase();
  if (["stk", "st", "pc", "pcs"].includes(normalized)) return "st";
  if (["m", "lm", "meter", "løpemeter"].includes(normalized)) return "m";
  if (normalized === "m2" || normalized === "m²") return "m2";
  if (normalized === "m3" || normalized === "m³") return "m3";
  return normalized;
}

function parseLocalizedNumber(value: string) {
  const compact = value.replace(/\s/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let normalized = compact;

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? compact.replaceAll(".", "").replace(",", ".")
      : compact.replaceAll(",", "");
  } else if (lastComma >= 0) {
    normalized = compact.replace(",", ".");
  }

  const quantity = Number.parseFloat(normalized);
  return Number.isFinite(quantity) ? quantity : undefined;
}

function isKnownAttribute(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized === "antall" || ATTRIBUTE_KEYS.includes(normalized);
}

function normalizeAttributeKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/folsomhetsgrad/g, "følsomhetsgrad")
    .replace(/utlesningstemperatur/g, "utløsningstemperatur");
}

function normalizeStandard(value: string) {
  return value.replace(/\s+/g, "-").replace(/--+/g, "-").toUpperCase();
}

function inferNextPostNumber(previous: string | undefined) {
  if (!previous) return undefined;
  const match = previous.match(/^(.*\.)(\d+)$/);
  if (!match) return undefined;
  return match[1] + String(Number.parseInt(match[2], 10) + 1);
}

function inferPreviousPostNumber(next: string | undefined) {
  if (!next) return undefined;
  const match = next.match(/^(.*\.)(\d+)$/);
  if (!match) return undefined;
  const number = Number.parseInt(match[2], 10) - 1;
  return number > 0 ? match[1] + String(number) : undefined;
}

function getExtractionMethod(pages: TechnicalDescriptionPage[]) {
  const methods = new Set(pages.map((page) => page.method));
  if (methods.size === 1) return methods.has("ocr") ? "ocr" : "text";
  return "mixed";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueHints(hints: TechnicalDescriptionRuleHint[]) {
  const seen = new Set<string>();
  return hints.filter((hint) => {
    const key = hint.key + ":" + hint.value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
