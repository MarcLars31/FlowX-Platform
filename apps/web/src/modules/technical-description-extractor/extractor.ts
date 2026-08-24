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
const QUANTITY_UNIT_SOURCE = String.raw`(?:stk|st|pcs?|m|lm|[i1]m|meter|løpemeter|m2|m²|m3|m³|kg|l)`;
const QUANTITY_NUMBER_SOURCE = String.raw`(?:\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;
const TABLE_QUANTITY_PATTERN = new RegExp(
  String.raw`^(?:(?:Antall|Lengde)\s+)?(${QUANTITY_UNIT_SOURCE})\.?\s+(${QUANTITY_NUMBER_SOURCE})(?=\s|$)`,
  "i"
);
const INLINE_TABLE_QUANTITY_PATTERN = new RegExp(
  String.raw`^(.*?)\s+(${QUANTITY_UNIT_SOURCE})\.?\s+(${QUANTITY_NUMBER_SOURCE})(?:\s+${QUANTITY_NUMBER_SOURCE}){1,3}$`,
  "i"
);

const ATTRIBUTE_KEYS = [
  "sprinkleranlegg",
  "type sprinkler",
  "plassering",
  "følsomhetsgrad",
  "folsomhetsgrad",
  "felsomhetsgrad",
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
  let fallbackChapter: {
    chapter: string;
    sourcePage: number;
    confidence: number;
  } | undefined;

  for (const page of pages) {
    const tenderCoverMatch = page.text.match(
      /\b(Sprinkelprosjekt|Sprinklerprosjekt)\s*[\r\n]+\s*([^\r\n]{3,120})/i
    );
    if (tenderCoverMatch) {
      return {
        name: `${tenderCoverMatch[1]} ${tenderCoverMatch[2]}`
          .replace(/\s+/g, " ")
          .trim(),
        sourcePage: page.pageNumber,
        confidence: page.method === "ocr" ? page.confidence : 0.98
      };
    }

    const projectMatch = page.text.match(
      /Prosjekt\s*:\s*([^\r\n\t]+?)(?=\s+Side\b|[\r\n\t]|$)/i
    );
    const projectNameMatch = page.text.match(
      /^\s*Prosjektnavn\s*:?[ \t]+([^\r\n\t]+)/im
    );
    const requestMatch = page.text.match(/^\s*Anlegg\s*:\s*([^\r\n\t]+)/im);
    const pageHeadingMatch = page.text.match(/^\s*([^\r\n]{5,120}?)\s+Side\s+\d+\s*$/im);
    const projectNumberMatch = page.text.match(
      /(?:Prosjekt\s*nr\.?|Prosjektnr\.?|Project number)\s*:\s*([A-Z0-9][\w.-]*)/i
    );
    const chapterMatch = page.text.match(/Kapittel:\s*([^\n]+)/i);
    if (chapterMatch && !fallbackChapter) {
      fallbackChapter = {
        chapter: chapterMatch[1].trim(),
        sourcePage: page.pageNumber,
        confidence: page.method === "ocr" ? page.confidence : 0.98
      };
    }
    if (!projectMatch && !projectNameMatch && !requestMatch && !pageHeadingMatch) continue;

    const projectName = (
      projectMatch?.[1]
      ?? projectNameMatch?.[1]
      ?? requestMatch?.[1]
      ?? pageHeadingMatch?.[1]
    )?.trim();
    const projectNumber = projectNumberMatch?.[1]
      ?? projectName?.match(/^([A-Z]\d+|[A-Z]?\.?[\d.]+)/i)?.[1];
    return {
      name: projectName,
      projectNumber,
      chapter: chapterMatch?.[1]?.trim() ?? fallbackChapter?.chapter,
      sourcePage: page.pageNumber,
      confidence: page.method === "ocr" ? page.confidence : 0.98
    };
  }

  if (fallbackChapter) {
    return {
      chapter: fallbackChapter.chapter,
      sourcePage: fallbackChapter.sourcePage,
      confidence: fallbackChapter.confidence
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
    warnings.push(...structuredExtractionWarnings(structuredLines));
    return structuredLines;
  }

  warnings.push(...legacyWarnings);
  return legacyLines;
}

function structuredExtractionWarnings(lines: TechnicalDescriptionMaterialLine[]) {
  return lines
    .filter((line) => line.reviewFlags.includes("inferred-post-number"))
    .map<TechnicalDescriptionWarning>((line) => ({
      id: `inferred-post-${line.sourcePage}-${line.postNumber ?? line.id}`,
      code: "INFERRED_POST_NUMBER",
      message: `Post number was inferred for ${line.nsCode ?? line.description}.`,
      sourcePage: line.sourcePage,
      sourceText: line.sourceText,
      severity: "warning"
    }));
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
    if (isNonMaterialReferencePage(page.text)) continue;
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
        current.attributes[key] = normalizeAttributeValue(key, attributeMatch[2]);
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
  const prepared = recoverMissingStructuredPostNumbers(
    pages.map((page) => normalizedPageLines(page.text))
  );
  let previousMaterialLine: TechnicalDescriptionMaterialLine | undefined;
  let previousContext: TableParentContext | undefined;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (isNonMaterialReferencePage(page.text)) continue;
    const pageLines = prepared.pageLines[pageIndex];
    const pageText = pageLines.join("\n");
    const inFireProtectionSection = isFireProtectionPage(pageText)
      || isFireProtectionPage(prepared.pageLines[pageIndex - 1]?.join("\n") ?? "")
      || isFireProtectionPage(prepared.pageLines[pageIndex + 1]?.join("\n") ?? "");
    if (!inFireProtectionSection) continue;
    const chapterPost = extractChapterPost(pageLines);

    const starts: StructuredPostStart[] = [];
    for (let index = 0; index < pageLines.length; index += 1) {
      const start = parseStructuredPostStart(pageLines, index);
      if (!start) continue;
      starts.push(start);
      index += start.consumedLineCount - 1;
    }

    mergeLeadingPageContinuation({
      page,
      pageLines,
      firstStartIndex: starts[0]?.lineIndex,
      previousMaterialLine,
      previousContext
    });

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
      const ownCategory = inferStructuredCategory(description, sourceText);
      const inheritedCategory = parent?.category === "unknown"
        ? inferCategory(parent.sourceText.toLocaleLowerCase())
        : parent?.category;
      const category = resolveStructuredCategory(ownCategory, inheritedCategory, description);
      const system = inferSystem(`${description}\n${sourceText}`.toLocaleLowerCase()) ?? parent?.system;

      if (
        nsCode ||
        description ||
        category !== "unknown" ||
        Object.keys(ownAttributes).length > 0
      ) {
        const context = {
          postNumber: fullPostNumber,
          sourcePage: page.pageNumber,
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
        };
        parentContexts.set(fullPostNumber, context);
        previousContext = context;
      }

      const normalizedText = `${description}\n${sourceText}\n${parent?.sourceText ?? ""}`.toLocaleLowerCase();
      const operation = inferOperation(normalizedText, Boolean(quantity));
      if ((!quantity && operation !== "remove") || (quantity && quantity.quantity <= 0)) {
        continue;
      }

      const key = fullPostNumber;
      if (seen.has(key)) {
        continue;
      }
      const attributes: Record<string, string> = {
        ...(parent?.attributes ?? {}),
        ...ownAttributes
      };
      const reviewFlags: string[] = [];
      if (category === "unknown") reviewFlags.push("unknown-category");
      if (page.method === "ocr") reviewFlags.push("ocr-source");
      if (prepared.inferredPostNumbers.has(fullPostNumber)) {
        reviewFlags.push("inferred-post-number");
      }
      if (!quantity && operation !== "remove") reviewFlags.push("missing-quantity");
      if (
        category === "pipe"
        && quantity
        && quantity.unit !== "m"
        && !/slange|hose/i.test(`${description}\n${sourceText}`)
      ) {
        reviewFlags.push("pipe-unit-not-length");
      }

      const materialLine: TechnicalDescriptionMaterialLine = {
        id: `technical-material-${page.pageNumber}-${fullPostNumber.replace(/[^a-zA-Z0-9]+/g, "-")}`,
        postNumber: fullPostNumber,
        parentPostNumber: parent?.postNumber,
        nsCode: nsCode ?? parent?.nsCode,
        category,
        description: description
          || (attributes.dimensjon ? `Dimensjon: ${attributes.dimensjon}` : categoryLabel(category)),
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
      };
      materialLines.push(materialLine);
      previousMaterialLine = materialLine;
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

const STRUCTURED_NUMBER_SOURCE = QUANTITY_NUMBER_SOURCE;
const STRUCTURED_UNIT_SOURCE = QUANTITY_UNIT_SOURCE;
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
const FULL_POST_LINE_PATTERN = /^(\d+(?:\.\d+){1,7})(?:\s*[|)]{1,2}\s*|\s+)(.+)$/;
const PARENT_POST_LINE_PATTERN = /^(\d{1,4})\s+((?:%?[A-ZÆØÅ]{1,10}\d[\w.%-]*|[A-ZÆØÅ][A-ZÆØÅ /-]{4,}))$/;
const EXACT_POST_LINE_PATTERN = /^(\d+(?:\.\d+){1,7}\.?)\s*[|)]{0,2}$/;
const POST_CONTINUATION_PATTERN = /^(\.?\d+(?:\.\d+)*)\s*(.*)$/;
const EXPLICIT_POST_AT_START_PATTERN = /^(\d+(?:\.\d+){1,7})(?=\s|[|)])/;

function parseStructuredPostStart(
  lines: string[],
  lineIndex: number
): StructuredPostStart | undefined {
  const line = lines[lineIndex];
  const wrapped = parseWrappedVisualPostStart(lines, lineIndex);
  if (wrapped) return wrapped;

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

/**
 * Some GAB/NS 3420 PDFs wrap the narrow post-number column while the product
 * description remains on the first visual row. PDF.js then emits for example
 * `1403.33.332. Red pipe DN40` followed by `2.1 Antall m 0,81 0 0`.
 * Reconnect those two visual fragments before normal block parsing so neither
 * the description nor the quantity is assigned to the following product.
 */
function parseWrappedVisualPostStart(
  lines: string[],
  lineIndex: number
): StructuredPostStart | undefined {
  const baseMatch = lines[lineIndex].match(
    /^(\d+(?:\.\d+){2,7}\.?)\s+(.+)$/
  );
  const continuationMatch = lines[lineIndex + 1]?.match(
    /^(\.?\d+(?:\.\d+)*)(?:\s+(.+))?$/
  );
  if (!baseMatch || !continuationMatch) return undefined;

  const base = baseMatch[1];
  const continuation = continuationMatch[1];
  const baseParts = base.replace(/\.$/, "").split(".");
  const continuationWithoutDot = continuation.replace(/^\./, "");
  if (
    (baseParts.length < 4 && !base.endsWith("."))
    || (!continuation.includes(".") && !base.endsWith("."))
    || continuationWithoutDot.startsWith(`${base.replace(/\.$/, "")}.`)
    || !isLikelyWrappedPostDescription(baseMatch[2])
  ) {
    return undefined;
  }

  return {
    lineIndex,
    consumedLineCount: 2,
    postNumber: composeWrappedPostNumber(base, continuation),
    description: [baseMatch[2], continuationMatch[2]]
      .filter(Boolean)
      .join(" ")
      .trim()
  };
}

function isLikelyWrappedPostDescription(value: string) {
  return /(?:\bDN\s*\d|\b(?:Antall|Lengde)\b|\b(?:stk|st|m|lm)\s+\d|%?[A-ZÆØÅ]{1,10}\d[\w.%-]*|sprinkler|r[øo]r|ventil|bend|kupling|kobling|overgang|fitting)/i.test(value);
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

function recoverMissingStructuredPostNumbers(pageLines: string[][]) {
  type FlatLine = { pageIndex: number; lineIndex: number; text: string };
  const flatLines: FlatLine[] = pageLines.flatMap((lines, pageIndex) =>
    lines.map((text, lineIndex) => ({ pageIndex, lineIndex, text }))
  );
  const explicit = flatLines
    .map((line, flatIndex) => ({
      flatIndex,
      postNumber: line.text.match(EXPLICIT_POST_AT_START_PATTERN)?.[1]
    }))
    .filter((entry): entry is { flatIndex: number; postNumber: string } => Boolean(entry.postNumber));
  const candidates = flatLines
    .map((line, flatIndex) => ({ line, flatIndex }))
    .filter(({ line, flatIndex }) =>
      NS3420_CODE_PATTERN.test(line.text)
      && blockHasExplicitQuantity(flatLines, flatIndex)
    );
  const inferredPostNumbers = new Set<string>();

  for (const candidate of candidates) {
    const previous = [...explicit]
      .reverse()
      .find((entry) => entry.flatIndex < candidate.flatIndex);
    const next = explicit.find((entry) => entry.flatIndex > candidate.flatIndex);
    if (!next) continue;

    const group = candidates.filter((entry) => {
      const afterPrevious = previous ? entry.flatIndex > previous.flatIndex : true;
      return afterPrevious && entry.flatIndex < next.flatIndex;
    });
    const position = group.findIndex((entry) => entry.flatIndex === candidate.flatIndex);
    if (position < 0) continue;
    const decrement = group.length - position;
    const inferred = decrementFinalPostNumber(next.postNumber, decrement);
    if (!inferred || explicit.some((entry) => entry.postNumber === inferred)) continue;

    const { pageIndex, lineIndex, text } = candidate.line;
    pageLines[pageIndex][lineIndex] = `${inferred} ${text}`;
    inferredPostNumbers.add(inferred);
  }

  return { pageLines, inferredPostNumbers };
}

function blockHasExplicitQuantity(
  lines: Array<{ text: string }>,
  startIndex: number
) {
  for (let index = startIndex + 1; index < Math.min(lines.length, startIndex + 35); index += 1) {
    const text = lines[index].text;
    if (EXPLICIT_POST_AT_START_PATTERN.test(text) || NS3420_CODE_PATTERN.test(text)) {
      return false;
    }
    if (TABLE_QUANTITY_PATTERN.test(text) || INLINE_TABLE_QUANTITY_PATTERN.test(text)) {
      return true;
    }
    if (isTableFooter(text)) return false;
  }
  return false;
}

function decrementFinalPostNumber(postNumber: string, decrement: number) {
  const match = postNumber.match(/^(.*\.)(\d+)$/);
  if (!match) return undefined;
  const nextValue = Number.parseInt(match[2], 10);
  const inferredValue = nextValue - decrement;
  if (inferredValue <= 0) return undefined;
  return `${match[1]}${inferredValue}`;
}

function mergeLeadingPageContinuation({
  page,
  pageLines,
  firstStartIndex,
  previousMaterialLine,
  previousContext
}: {
  page: TechnicalDescriptionPage;
  pageLines: string[];
  firstStartIndex?: number;
  previousMaterialLine?: TechnicalDescriptionMaterialLine;
  previousContext?: TableParentContext;
}) {
  if (!previousMaterialLine && !previousContext) return;
  const leading = pageLines.slice(0, firstStartIndex ?? pageLines.length);
  const continuationStart = leading.findIndex(isTechnicalContinuationLine);
  if (continuationStart < 0) return;
  const continuation = leading
    .slice(continuationStart)
    .filter((line) => !isTableFooter(line));
  if (continuation.length === 0) return;

  const continuationText = continuation.join("\n");
  const attributes = extractTableAttributes(continuation);
  const standards = unique(
    [...continuationText.matchAll(STANDARD_PATTERN)].map((match) =>
      normalizeStandard(match[1])
    )
  );
  if (previousContext && previousContext.sourcePage === page.pageNumber - 1) {
    Object.assign(previousContext.attributes, attributes);
    previousContext.standardRefs = unique([...previousContext.standardRefs, ...standards]);
    previousContext.sourceText += `\n\nFORTSETTELSE SIDE ${page.pageNumber}\n${continuationText}`;
  }
  if (
    previousMaterialLine
    && previousMaterialLine.sourcePage === page.pageNumber - 1
    && (!previousContext || previousMaterialLine.postNumber === previousContext.postNumber)
  ) {
    Object.assign(previousMaterialLine.attributes, attributes);
    previousMaterialLine.standardRefs = unique([
      ...previousMaterialLine.standardRefs,
      ...standards
    ]);
    previousMaterialLine.sourceText += `\n\nFORTSETTELSE SIDE ${page.pageNumber}\n${continuationText}`;
    previousMaterialLine.technicalSpecification = previousContext?.sourceText
      ?? previousMaterialLine.sourceText;
  }
}

function isTechnicalContinuationLine(value: string) {
  const attribute = value.match(ATTRIBUTE_PATTERN);
  if (attribute) {
    const key = normalizeAttributeKey(attribute[1]);
    return ![
      "prosjekt",
      "kapittel",
      "anlegg",
      "anleggsadresse/sted",
      "konsulent",
      "tilbudsfrist leverandør",
      "postnr",
      "sum"
    ].includes(key);
  }
  return /^(?:Andre krav|[a-z]\)\s+)/i.test(value);
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
  return /sprinkler|brann(?:slokk|vann|vern)|slokke(?:anlegg|gass|vann)|inergen|håndsl[ou]kker|\b\d+(?:\.\d+)*\.332(?:\.|\b)/i.test(text);
}

function isNonMaterialReferencePage(text: string) {
  const hydraulicReport = /(?:^|\n)Sprinkler report\b/i.test(text)
    && /\b(?:Calculation date|Property Value Unit|General results)\b/i.test(text);
  const technicalDrawing = /\b(?:Tegningstittel|Tegningsnummer|Tegningsstatus|Arbeidstegning)\b/i.test(text)
    && /\b(?:Målestokk|Format|Disiplin)\b/i.test(text);
  return hydraulicReport || technicalDrawing;
}

type TableParentContext = {
  postNumber: string;
  sourcePage: number;
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
    .map((line) => normalizeOcrArtifacts(line.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

function normalizeOcrArtifacts(value: string) {
  return value
    .replace(/\bDNB(\d{2,3})\b/gi, "DN$1")
    .replace(/\bDNS0\b/gi, "DN50")
    .replace(/\bDN6S5\b/gi, "DN65");
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
  return /^(?:Sum(?: denne side)?\s*:|Akkumulert\b|Prosjekt:|Postnr:)/i.test(value);
}

function findTableQuantity(lines: string[]) {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const anchoredMatch = line.match(TABLE_QUANTITY_PATTERN);
    const inlineMatch = anchoredMatch ? undefined : line.match(INLINE_TABLE_QUANTITY_PATTERN);
    const wrappedDescriptionMatch = anchoredMatch || inlineMatch
      ? undefined
      : line.match(new RegExp(
        String.raw`^(.+?)\s+(?:Antall|Lengde)\s+(${QUANTITY_UNIT_SOURCE})\.?\s+(${QUANTITY_NUMBER_SOURCE})$`,
        "i"
      ));
    const descriptiveMatch = anchoredMatch || inlineMatch || wrappedDescriptionMatch
      ? undefined
      : line.match(new RegExp(
        String.raw`^((?:Antall|Lengde|Løpemeter|Areal|Vekt|Volum|Masse)\b.*?)\s+(${QUANTITY_UNIT_SOURCE})\.?\s+(${QUANTITY_NUMBER_SOURCE})$`,
        "i"
      ));
    const match = anchoredMatch ?? inlineMatch ?? wrappedDescriptionMatch ?? descriptiveMatch;
    if (!match) continue;

    const hasDescriptionPrefix = Boolean(
      inlineMatch || wrappedDescriptionMatch || descriptiveMatch
    );
    const quantity = parseLocalizedNumber(
      hasDescriptionPrefix ? match[3] : match[2]
    );
    if (quantity === undefined) continue;

    return {
      quantity,
      unit: normalizeUnit(hasDescriptionPrefix ? match[2] : match[1]),
      text: hasDescriptionPrefix
        ? `${match[3]} ${match[2]}`
        : match[0].trim(),
      lineIndex,
      descriptionPrefix: hasDescriptionPrefix
        ? match[1].trim().replace(/\b(?:Antall|Lengde)\s*$/i, "").trim()
        : line.slice(0, match.index).trim()
    };
  }

  return undefined;
}

function tableDescription(parts: string[]) {
  const cleaned = parts
    .map((part) => part.trim().replace(/^[|)]{1,2}\s*/, ""))
    .filter(Boolean);
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
      if (!/^[A-ZÆØÅ][A-ZÆØÅ0-9 ()/,.+-]{1,59}$/i.test(match[1].trim())) {
        continue;
      }
      const key = normalizeAttributeKey(match[1]);
      if (["gjelder", "andre krav", "postnr"].includes(key)) continue;
      attributes[key] = normalizeAttributeValue(key, match[2]);
      activeKey = hasTableQuantity(line) ? null : key;
      continue;
    }

    if (
      activeKey &&
      !/^(?:[a-z]\)|Sum denne side|Akkumulert|Prosjekt:|\d{2}\.\d{2}\.\d{4})/i.test(line)
    ) {
      if (hasTableQuantity(line)) {
        activeKey = null;
        continue;
      }
      attributes[activeKey] = `${attributes[activeKey]} ${line}`.replace(/\s+/g, " ");
    }
  }

  return attributes;
}

function hasTableQuantity(value: string) {
  return TABLE_QUANTITY_PATTERN.test(value)
    || INLINE_TABLE_QUANTITY_PATTERN.test(value);
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
  if (/h[åa]ndsl[ou]kker|h[åa]ndslukkeapparat|brannsl[ou]kker/.test(text)) {
    if (/slokkemiddel\s*:\s*skum|skumsl[ou]kker|foam/.test(text)) {
      return "foam-extinguisher";
    }
    return "portable-fire-extinguisher";
  }
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
  if (/h[åa]ndsl[ou]kker|h[åa]ndslukkeapparat|brannsl[ou]kker|gassslokke?flaske|reserveutstyr|veggskap|metallkurv|l[åa]sereim/.test(text)) {
    return "other";
  }
  if (/kontrollventilsett/.test(text)) return "valve";
  if (/kontroll|alarm|sensor|detektor|sentral|signalapparat|strømningsvakt|trykkvakt|pressostat|måleinstrument|manometer|måleblende|kapasitetsmåler|kapasitetsmaaler|kompressor|pumpe|melder/.test(text)) {
    return "control";
  }
  if (/ventil|valve/.test(text)) return "valve";
  if (/fitting|bend|muffe|kobling|kupling|t-r[øo]r|t-klave|r[øo]rdel|overgang|endebunn|anborring|blindflens|filter|partikkelutskiller/.test(text)) {
    return "fitting";
  }
  if (/innendørs r[øo]rledning|r[øo]rledningsanlegg|r[øo]rledning\s*[—-]\s*brannslokking/.test(text)) {
    return "pipe";
  }
  if (/r[øo]r\b|r[øo]rledning|vannledning|st[åa]lr[øo]r|riller[øo]r|rillede r[øo]r|sprinklerslange|\bpipe\b|red pipe/.test(text)) {
    return "pipe";
  }
  if (/oppheng|støtte|support/.test(text)) return "support";
  if (/\bsprinkler\b|sprinklerhode|sprinklerdyse|standard spray|utvidet dekning/.test(text)) {
    return "sprinkler_head";
  }
  return "unknown";
}

function inferStructuredCategory(description: string, sourceText: string) {
  const descriptionCategory = inferCategory(description.toLocaleLowerCase());
  if (descriptionCategory !== "unknown") return descriptionCategory;
  return inferCategory(sourceText.toLocaleLowerCase());
}

function resolveStructuredCategory(
  ownCategory: TechnicalDescriptionCategory,
  parentCategory: TechnicalDescriptionCategory | undefined,
  description: string
) {
  if (!parentCategory) return ownCategory;
  if (ownCategory === "unknown") return parentCategory;
  if (
    parentCategory === "pipe"
    && !/ventil|sprinkler|h[åa]ndsl[ou]kker|bend|kobling|kupling/i.test(description)
  ) {
    return "pipe";
  }
  return ownCategory;
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
    other: "Annet brannslokkingsutstyr",
    unknown: "Teknisk materiallinje"
  }[category];
}

function parseQuantityLine(value: string) {
  const match = value.match(
    new RegExp(
      String.raw`^\s*Antall\s+(${QUANTITY_UNIT_SOURCE})\.?\s+(\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`,
      "i"
    )
  );
  if (!match) return undefined;
  return parseQuantity(match[2] + " " + match[1]);
}

function parseQuantity(value: string) {
  const match = value.match(
    new RegExp(
      String.raw`(\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(${QUANTITY_UNIT_SOURCE})`,
      "i"
    )
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
  if (["m", "lm", "im", "1m", "meter", "løpemeter"].includes(normalized)) return "m";
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
    .replace(/(?:folsomhetsgrad|felsomhetsgrad)/g, "følsomhetsgrad")
    .replace(/utlesningstemperatur/g, "utløsningstemperatur");
}

function normalizeAttributeValue(key: string, value: string) {
  let normalized = normalizeOcrArtifacts(value.trim().replace(/^[|I]\s+/, ""));
  if (key === "dimensjon") {
    const dimension = normalized.match(/\bDN\s*\d+(?:\s*\/\s*\d+\s*\/\s*\d+\"?)?/i)?.[0];
    if (dimension) normalized = dimension.replace(/DN\s+/i, "DN");
  }
  if (key === "k-faktor") {
    normalized = normalized.replace(/(\d),(\d)/g, "$1.$2");
    if (/^\d{4}$/.test(normalized) && normalized.endsWith("5")) {
      normalized = `${normalized.slice(0, -1)}.${normalized.slice(-1)}`;
    }
  }
  if (key === "utløsningstemperatur") {
    normalized = normalized
      .replace(/\s*[°*]\s*C\b/gi, " °C")
      .replace(/\s+°C/g, " °C");
  }
  return normalized;
}

function normalizeStandard(value: string) {
  return value
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .toUpperCase()
    .replace(/^NS(?=\d)/, "NS-")
    .replace(/^NS-?EN(?=\d)/, "NS-EN-")
    .replace(/^NFPA(?=\d)/, "NFPA-");
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
