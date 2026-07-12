import type {
  ExtractedLineItem,
  ExtractedLineItemCategory,
  ExtractedPageText,
  ExtractedProject,
  ExtractedRequirement,
  ExtractedSection,
  ExtractedStandard,
  ExtractedSystem,
  ExtractionWarning,
  PdfExtractionResult
} from "./types";

type ExtractOptions = {
  fileName?: string;
};

type SystemPattern = {
  name: string;
  normalizedName: string;
  patterns: RegExp[];
};

type MaterialSourceRow = {
  text: string;
  sourceText: string;
  method: ExtractedLineItem["extractionMethod"];
  startLineIndex: number;
  endLineIndex: number;
};

type ParsedQuantity = {
  description: string;
  quantity: number;
  quantityText: string;
  unit: string;
};

type ParsedMaterialLine = ParsedQuantity & {
  postNumber?: string;
  nsCode?: string;
  specificationCode?: string;
};

const systemPatterns: SystemPattern[] = [
  {
    name: "T\u00f8rropplegg / fire department connection",
    normalizedName: "dry-riser",
    patterns: [
      /t(?:\u00f8|o)rropplegg/i,
      /dry\s+riser/i,
      /fire\s+department\s+connection/i,
      /brannvesen/i
    ]
  },
  {
    name: "Sprinkleranlegg A10",
    normalizedName: "sprinkler-a10",
    patterns: [/sprinkleranlegg\s*a10/i]
  },
  {
    name: "V\u00e5tanlegg",
    normalizedName: "wet-sprinkler",
    patterns: [/v(?:\u00e5|a)tanlegg/i, /wet\s+sprinkler/i]
  },
  {
    name: "Delugeanlegg",
    normalizedName: "deluge",
    patterns: [/delugeanlegg/i, /deluge/i]
  }
];

const standardPattern = /\b(NFPA\s*13|NFPA\s*14|NS-?\s*EN\s*12845|FM|UL|VdS)\b/gi;
const postNumberPattern = /^(\d{2,4}(?:\.\d+){2,})(?:\s+|$)/;
const quantityPatternSource =
  String.raw`(?:\d{1,3}(?:[ .]\d{3})+(?:[,.]\d+)?|\d+(?:[,.]\d+)?)`;
const unitPatternSource =
  String.raw`(?:m[23]|m[²³]|lm|meter|metre|stk|stykk|pcs|pc|ea|each|RS|sett|set|kg|l|liter|litre|par|pair|pkt|punkt|m)`;
const trailingUnitQuantityPattern = new RegExp(
  String.raw`(?:^|[\s|;:,\-]+)(?<unit>${unitPatternSource})\.?\s*(?<quantity>${quantityPatternSource})\s*$`,
  "i"
);
const trailingQuantityUnitPattern = new RegExp(
  String.raw`(?:^|[\s|;:,\-]+)(?<quantity>${quantityPatternSource})\s*(?<unit>${unitPatternSource})\.?\s*$`,
  "i"
);
const leadingUnitQuantityPattern = new RegExp(
  String.raw`^(?<unit>${unitPatternSource})\.?\s*(?<quantity>${quantityPatternSource})\s+(?<description>.+)$`,
  "i"
);
const leadingQuantityUnitPattern = new RegExp(
  String.raw`^(?<quantity>${quantityPatternSource})\s*(?<unit>${unitPatternSource})\.?\s+(?<description>.+)$`,
  "i"
);
const embeddedUnitQuantityPattern = new RegExp(
  String.raw`(?:^|[\s|;:,\-]+)(?<unit>${unitPatternSource})\.?\s*(?<quantity>${quantityPatternSource})(?=$|[\s|;:,\-]+)`,
  "gi"
);
const embeddedQuantityUnitPattern = new RegExp(
  String.raw`(?:^|[\s|;:,\-]+)(?<quantity>${quantityPatternSource})\s*(?<unit>${unitPatternSource})\.?(?=$|[\s|;:,\-]+)`,
  "gi"
);
const currencyOrPriceTailPattern =
  /^(?:nok|kr|eur|sek|sum|pris|enhetspris|bel(?:ø|o)p|amount|price|rate|total|[-\s.,\d])+$/i;

const mojibakeReplacements: Array<[RegExp, string]> = [
  [/\u00c3\u00b8/g, "\u00f8"],
  [/\u00c3\u0098/g, "\u00d8"],
  [/\u00c3\u00a5/g, "\u00e5"],
  [/\u00c3\u0085/g, "\u00c5"],
  [/\u00c3\u00a6/g, "\u00e6"],
  [/\u00c3\u0086/g, "\u00c6"],
  [/\u00c2\u00b0/g, "\u00b0"],
  [/\u00e2\u20ac\u201d/g, "-"],
  [/\u00e2\u20ac\u201c/g, "-"],
  [/\u00e2\u20ac\u2122/g, "'"],
  [/\u00e2\u20ac\u0153/g, '"'],
  [/\u00e2\u20ac\ufffd/g, '"']
];

export function extractTechnicalSpecificationFromPages(
  rawPages: ExtractedPageText[],
  options: ExtractOptions = {}
): PdfExtractionResult {
  const pages = normalizePages(rawPages);
  const warnings: ExtractionWarning[] = [];
  const standards = extractStandards(pages);
  const systems = extractSystems(pages);
  const sections = extractSections(pages);
  const lineItems = extractLineItems(pages, systems, standards);
  const requirements = extractRequirements(pages, standards);

  if (pages.length === 0 || pages.every((page) => page.text.length === 0)) {
    warnings.push({
      id: "warning-no-text",
      code: "NO_TEXT_EXTRACTED",
      message: "No readable text was extracted from the PDF.",
      severity: "warning"
    });
  }

  if (standards.length === 0) {
    warnings.push({
      id: "warning-no-standards",
      code: "NO_STANDARDS_DETECTED",
      message: "No known sprinkler standards were detected.",
      severity: "warning"
    });
  }

  if (lineItems.length === 0) {
    warnings.push({
      id: "warning-no-line-items",
      code: "NO_LINE_ITEMS_DETECTED",
      message: "No material-like line items with quantities were detected.",
      severity: "warning"
    });
  }

  const unknownCount = lineItems.filter((item) => item.category === "unknown").length;
  const reviewCount = lineItems.filter((item) =>
    item.reviewFlags?.some((flag) => flag !== "high-confidence")
  ).length;

  if (unknownCount > 0) {
    warnings.push({
      id: "warning-unknown-line-items",
      code: "UNKNOWN_LINE_ITEMS_INCLUDED",
      message: `${unknownCount} extracted line item(s) need human categorization.`,
      severity: "info"
    });
  }

  if (reviewCount > 0) {
    warnings.push({
      id: "warning-review-line-items",
      code: "MATERIAL_LINES_NEED_REVIEW",
      message: `${reviewCount} measurable material line(s) were extracted with review flags.`,
      severity: "info"
    });
  }

  return {
    document: {
      fileName: options.fileName,
      pageCount: pages.length,
      extractedAt: new Date().toISOString()
    },
    project: extractProject(pages, options.fileName),
    systems,
    standards,
    sections,
    lineItems,
    requirements,
    warnings
  };
}

export function normalizeNorwegianNumber(value: string): number | undefined {
  const compact = value.replace(/\s/g, "");
  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");
  let normalized = compact;

  if (hasComma && hasDot) {
    normalized =
      compact.lastIndexOf(",") > compact.lastIndexOf(".")
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.replace(/,/g, "");
  } else if (hasComma) {
    normalized = compact.replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(compact)) {
    normalized = compact.replace(/\./g, "");
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeExtractionText(value: string): string {
  const deMojibaked = mojibakeReplacements.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  );

  return deMojibaked
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizePages(pages: ExtractedPageText[]): ExtractedPageText[] {
  return pages.map((page, index) => ({
    pageNumber: page.pageNumber || index + 1,
    text: normalizeExtractionText(page.text)
  }));
}

function extractProject(
  pages: ExtractedPageText[],
  fileName?: string
): ExtractedProject {
  const firstText = pages[0]?.text ?? "";
  const projectNumber =
    fileName?.match(/\b\d{4}\b/)?.[0] ?? firstText.match(/\b\d{4}\b/)?.[0];
  const revision =
    fileName?.match(/\bRev\s*\d+/i)?.[0] ?? firstText.match(/\bRev\s*\d+/i)?.[0];
  const discipline = /sprinkler|brann|fire/i.test(`${fileName ?? ""}\n${firstText}`)
    ? "Sprinkler / fire suppression"
    : undefined;

  return {
    name: deriveProjectName(fileName, firstText),
    projectNumber,
    discipline,
    revision,
    sourcePage: pages[0]?.pageNumber,
    confidence: projectNumber || revision ? 74 : 46
  };
}

function deriveProjectName(fileName: string | undefined, firstText: string) {
  if (fileName) {
    return fileName.replace(/\.pdf$/i, "").trim();
  }

  return firstText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line.length < 90);
}

function extractSystems(pages: ExtractedPageText[]): ExtractedSystem[] {
  const systems = new Map<string, ExtractedSystem>();

  for (const page of pages) {
    for (const pattern of systemPatterns) {
      if (!pattern.patterns.some((regex) => regex.test(page.text))) {
        continue;
      }

      if (!systems.has(pattern.normalizedName)) {
        systems.set(pattern.normalizedName, {
          id: `system-${pattern.normalizedName}`,
          name: pattern.name,
          normalizedName: pattern.normalizedName,
          sourcePage: page.pageNumber,
          sourceText: findSourceLine(page.text, pattern.patterns) ?? pattern.name,
          confidence: 91
        });
      }
    }
  }

  return Array.from(systems.values());
}

function extractStandards(pages: ExtractedPageText[]): ExtractedStandard[] {
  const standards = new Map<string, ExtractedStandard>();

  for (const page of pages) {
    for (const match of page.text.matchAll(standardPattern)) {
      const code = normalizeStandardCode(match[1]);

      if (!standards.has(code)) {
        standards.set(code, {
          id: `standard-${slugify(code)}`,
          code,
          sourcePage: page.pageNumber,
          sourceText: findSourceLine(page.text, [new RegExp(escapeRegExp(match[1]), "i")]) ?? code,
          confidence: 96
        });
      }
    }
  }

  return Array.from(standards.values());
}

function extractSections(pages: ExtractedPageText[]): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const line of getLines(page.text)) {
      const system = detectSystem(line);
      const sectionTitle = detectSectionTitle(line);
      const title = sectionTitle ?? system?.name;

      if (!title || parseTrailingQuantity(line)) {
        continue;
      }

      const key = `${page.pageNumber}-${title.toLowerCase()}`;

      if (!seen.has(key)) {
        seen.add(key);
        sections.push({
          id: `section-${sections.length + 1}`,
          title,
          sourcePage: page.pageNumber,
          sourceText: line,
          confidence: sectionTitle ? 78 : 72
        });
      }
    }
  }

  return sections;
}

function extractLineItems(
  pages: ExtractedPageText[],
  systems: ExtractedSystem[],
  standards: ExtractedStandard[]
): ExtractedLineItem[] {
  const items: ExtractedLineItem[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    let activeSystem: string | undefined;
    const pageStandards = standards
      .filter((standard) => standard.sourcePage === page.pageNumber)
      .map((standard) => standard.code);

    for (const line of getLines(page.text)) {
      const systemMention = detectSystem(line);

      if (systemMention) {
        activeSystem = systemMention.name;
      }
    }

    for (const row of getMaterialSourceRows(page.text)) {
      const parsedLine = parseMaterialLine(row.text);

      if (!parsedLine) {
        continue;
      }

      const description = cleanMaterialDescription(parsedLine.description);

      if (description.length < 3) {
        continue;
      }

      const category = categorizeLineItem(description);
      const dimensions = extractDimensions(description);
      const dimension = dimensions[0];
      const material = extractMaterial(description);
      const lineSystem = detectSystem(description)?.name ?? activeSystem;
      const specificationCode = parsedLine.specificationCode ?? parsedLine.nsCode ?? extractNsCode(description);
      const sectionTitle =
        getSectionTitleForRow(page.text, row) ??
        lineSystem ??
        inferDefaultSystem(systems);
      const standardRefs = pageStandards.length
        ? pageStandards
        : standards.map((standard) => standard.code);
      const key = [
        page.pageNumber,
        parsedLine.postNumber ?? "",
        description.toLowerCase(),
        parsedLine.unit,
        parsedLine.quantity
      ].join("|");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const reviewFlags = getLineItemReviewFlags({
        category,
        description,
        dimension,
        dimensions,
        postNumber: parsedLine.postNumber,
        quantity: parsedLine.quantity,
        unit: parsedLine.unit
      });
      const confidence = scoreLineItem({
        category,
        description,
        dimension,
        dimensions,
        extractionMethod: row.method,
        postNumber: parsedLine.postNumber,
        quantity: parsedLine.quantity,
        reviewFlags,
        standardRefs,
        unit: parsedLine.unit
      });

      items.push({
        id: parsedLine.postNumber ? `line-${parsedLine.postNumber}` : `line-${items.length + 1}`,
        postNumber: parsedLine.postNumber,
        nsCode: specificationCode,
        specificationCode,
        sectionTitle,
        category,
        description,
        dimension,
        dimensions,
        material,
        system: lineSystem ?? inferDefaultSystem(systems),
        standardRefs,
        quantity: parsedLine.quantity,
        quantityText: parsedLine.quantityText,
        unit: parsedLine.unit,
        sourcePage: page.pageNumber,
        sourceText: row.sourceText,
        sourceTextBlock: row.sourceText,
        extractionMethod: row.method,
        reviewFlags,
        confidence
      });
    }
  }

  return items;
}

function extractRequirements(
  pages: ExtractedPageText[],
  standards: ExtractedStandard[]
): ExtractedRequirement[] {
  const requirements: ExtractedRequirement[] = standards.map((standard) => ({
    id: `requirement-${standard.id}`,
    type: "standard",
    value: standard.code,
    sourcePage: standard.sourcePage,
    sourceText: standard.sourceText,
    confidence: standard.confidence
  }));
  const seen = new Set(requirements.map((requirement) => requirement.id));
  const requirementPatterns: Array<{
    type: ExtractedRequirement["type"];
    regex: RegExp;
  }> = [
    { type: "pressure", regex: /\b\d{1,3}(?:[,.]\d+)?\s*bar\b/gi },
    { type: "property", regex: /\bQR\b/gi },
    { type: "property", regex: /\bK\s*=\s*(80|115)\b/gi },
    { type: "property", regex: /\b\d{2,3}\s*\u00b0\s*C\b/gi },
    { type: "dimension", regex: /\bDN\s?\d{2,3}\b/gi }
  ];

  for (const page of pages) {
    for (const requirementPattern of requirementPatterns) {
      for (const match of page.text.matchAll(requirementPattern.regex)) {
        const value = normalizeRequirementValue(match[0]);
        const id = `requirement-${requirementPattern.type}-${slugify(value)}-${page.pageNumber}`;

        if (seen.has(id)) {
          continue;
        }

        seen.add(id);
        requirements.push({
          id,
          type: requirementPattern.type,
          value,
          sourcePage: page.pageNumber,
          sourceText:
            findSourceLine(page.text, [new RegExp(escapeRegExp(match[0]), "i")]) ?? value,
          confidence: requirementPattern.type === "dimension" ? 86 : 92
        });
      }
    }
  }

  return requirements;
}

function getMaterialSourceRows(text: string): MaterialSourceRow[] {
  const rows: MaterialSourceRow[] = [];
  const pending: string[] = [];
  const pendingSource: string[] = [];
  const pendingIndexes: number[] = [];

  for (const [lineIndex, rawLine] of getLines(text).entries()) {
    const line = normalizeTableLine(rawLine);

    if (parseMaterialLine(line)) {
      flushPendingIfComplete(rows, pending, pendingSource, pendingIndexes);
      rows.push({
        text: line,
        sourceText: rawLine,
        method: isTableLikeLine(rawLine) ? "table-row" : "single-line",
        startLineIndex: lineIndex,
        endLineIndex: lineIndex
      });
      continue;
    }

    if (pending.length > 0) {
      const combined = [...pending, line].join(" ");

      if (parseMaterialLine(combined)) {
        rows.push({
          text: combined,
          sourceText: [...pendingSource, rawLine].join(" "),
          method: "wrapped-line",
          startLineIndex: pendingIndexes[0] ?? lineIndex,
          endLineIndex: lineIndex
        });
        pending.length = 0;
        pendingSource.length = 0;
        pendingIndexes.length = 0;
        continue;
      }

      if (startsNewMaterialRow(line) || !shouldJoinContinuation(pending.join(" "), line)) {
        pending.length = 0;
        pendingSource.length = 0;
        pendingIndexes.length = 0;
      } else {
        pending.push(line);
        pendingSource.push(rawLine);
        pendingIndexes.push(lineIndex);
        continue;
      }
    }

    if (startsNewMaterialRow(line) || looksLikeMaterialDescription(line)) {
      pending.push(line);
      pendingSource.push(rawLine);
      pendingIndexes.push(lineIndex);
    }
  }

  flushPendingIfComplete(rows, pending, pendingSource, pendingIndexes);

  return rows;
}

function flushPendingIfComplete(
  rows: MaterialSourceRow[],
  pending: string[],
  pendingSource: string[],
  pendingIndexes: number[]
) {
  if (pending.length === 0) {
    return;
  }

  const combined = pending.join(" ");

  if (parseMaterialLine(combined)) {
    rows.push({
      text: combined,
      sourceText: pendingSource.join(" "),
      method: pending.length > 1 ? "wrapped-line" : "single-line",
      startLineIndex: pendingIndexes[0] ?? 0,
      endLineIndex: pendingIndexes[pendingIndexes.length - 1] ?? pendingIndexes[0] ?? 0
    });
  }

  pending.length = 0;
  pendingSource.length = 0;
  pendingIndexes.length = 0;
}

function parseMaterialLine(line: string): ParsedMaterialLine | undefined {
  const normalizedLine = normalizeTableLine(line);
  const codeParts = stripLeadingLineCodes(normalizedLine);
  const parsedQuantity =
    parseTrailingQuantity(codeParts.text) ??
    parseLeadingQuantity(codeParts.text) ??
    parseEmbeddedQuantity(codeParts.text);

  if (!parsedQuantity) {
    return undefined;
  }

  const description = cleanMaterialDescription(parsedQuantity.description);

  if (
    !isMeasurableMaterialCandidate(description, parsedQuantity, {
      postNumber: codeParts.postNumber,
      nsCode: codeParts.nsCode
    })
  ) {
    return undefined;
  }

  return {
    ...parsedQuantity,
    description,
    postNumber: codeParts.postNumber,
    nsCode: codeParts.nsCode ?? extractNsCode(description),
    specificationCode: codeParts.nsCode ?? extractNsCode(description)
  };
}

function parseTrailingQuantity(line: string): ParsedQuantity | undefined {
  for (const pattern of [trailingUnitQuantityPattern, trailingQuantityUnitPattern]) {
    const match = line.match(pattern);

    if (!match) {
      continue;
    }

    const quantityText = match.groups?.quantity;
    const rawUnit = match.groups?.unit;

    if (!quantityText || !rawUnit) {
      continue;
    }

    const quantity = normalizeNorwegianNumber(quantityText);

    if (quantity === undefined) {
      continue;
    }

    const matchIndex = match.index ?? line.length - match[0].length;

    return {
      description: line.slice(0, matchIndex).replace(/[-:,\s]+$/g, "").trim(),
      quantityText,
      quantity,
      unit: normalizeUnit(rawUnit)
    };
  }

  return undefined;
}

function parseLeadingQuantity(line: string): ParsedQuantity | undefined {
  for (const pattern of [leadingUnitQuantityPattern, leadingQuantityUnitPattern]) {
    const match = line.match(pattern);

    if (!match?.groups) {
      continue;
    }

    const quantityText = match.groups.quantity;
    const rawUnit = match.groups.unit;
    const quantity = normalizeNorwegianNumber(quantityText);

    if (quantity === undefined) {
      continue;
    }

    return {
      description: match.groups.description.replace(/^[-:,\s]+/g, "").trim(),
      quantityText,
      quantity,
      unit: normalizeUnit(rawUnit)
    };
  }

  return undefined;
}

function parseEmbeddedQuantity(line: string): ParsedQuantity | undefined {
  const candidates = [
    ...Array.from(line.matchAll(embeddedUnitQuantityPattern)),
    ...Array.from(line.matchAll(embeddedQuantityUnitPattern))
  ]
    .map((match) => buildEmbeddedQuantityCandidate(line, match))
    .filter((candidate): candidate is ParsedQuantity => Boolean(candidate));

  return candidates.find((candidate) =>
    looksLikeMaterialDescription(candidate.description)
  );
}

function buildEmbeddedQuantityCandidate(
  line: string,
  match: RegExpMatchArray
): ParsedQuantity | undefined {
  if (!match.groups) {
    return undefined;
  }

  const quantityText = match.groups.quantity;
  const rawUnit = match.groups.unit;
  const quantity = normalizeNorwegianNumber(quantityText);

  if (quantity === undefined || !rawUnit) {
    return undefined;
  }

  const leadingDelimiterLength = match[0].match(/^[\s|;:,\-]+/)?.[0].length ?? 0;
  const tokenStart = (match.index ?? 0) + leadingDelimiterLength;
  const tokenEnd = (match.index ?? 0) + match[0].length;
  const before = line.slice(0, tokenStart).replace(/[-:,\s]+$/g, "").trim();
  const after = line.slice(tokenEnd).replace(/^[-:,\s]+/g, "").trim();
  const description = currencyOrPriceTailPattern.test(after)
    ? before
    : `${before} ${after}`.trim();

  if (!description) {
    return undefined;
  }

  return {
    description,
    quantityText,
    quantity,
    unit: normalizeUnit(rawUnit)
  };
}

function normalizeTableLine(line: string) {
  return normalizeExtractionText(line)
    .replace(/[|]+/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\b(?:enhet|unit)\b\s*[:=]\s*/gi, "")
    .replace(/\b(?:mengde|quantity|qty)\b\s*[:=]\s*/gi, "")
    .trim();
}

function detectSectionTitle(line: string) {
  const normalized = normalizeExtractionText(line);
  const numberedSection = normalized.match(
    /^\d{1,4}(?:\.\d+){1,}\s+([A-ZÆØÅ0-9][A-ZÆØÅ0-9\s/.,:&()–-]{6,160})$/i
  );

  if (numberedSection && !parseTrailingQuantity(normalized)) {
    return numberedSection[1].trim();
  }

  if (
    normalized.length >= 8 &&
    normalized.length <= 160 &&
    normalized === normalized.toLocaleUpperCase("nb-NO") &&
    /[A-ZÆØÅ]{3}/.test(normalized) &&
    !parseTrailingQuantity(normalized)
  ) {
    return normalized;
  }

  return undefined;
}

function getSectionTitleForRow(pageText: string, row: MaterialSourceRow) {
  const lines = getLines(pageText);

  for (let index = row.startLineIndex; index >= 0; index -= 1) {
    const title = detectSectionTitle(lines[index] ?? "");

    if (title) {
      return title;
    }
  }

  return undefined;
}

function isTableLikeLine(line: string) {
  return /\t|\s{3,}|\|/.test(line);
}

function startsNewMaterialRow(line: string) {
  return postNumberPattern.test(line) || /^[A-Z]{1,4}\d{1,4}(?:\.\d+)?\s+/i.test(line);
}

function shouldJoinContinuation(previous: string, next: string) {
  if (startsNewMaterialRow(next)) {
    return false;
  }

  if (/^(?:side|page)\s+\d+/i.test(next)) {
    return false;
  }

  return (
    looksLikeMaterialDescription(previous) ||
    looksLikeMaterialDescription(next) ||
    Boolean(next.match(trailingUnitQuantityPattern)) ||
    Boolean(next.match(trailingQuantityUnitPattern)) ||
    Boolean(next.match(leadingUnitQuantityPattern)) ||
    Boolean(next.match(leadingQuantityUnitPattern))
  );
}

function stripLeadingLineCodes(line: string) {
  let text = line.trim();
  const postMatch = text.match(postNumberPattern);
  const postNumber = postMatch?.[1];

  if (postMatch) {
    text = text.slice(postMatch[0].length).trim();
  }

  const nsMatch = text.match(/^([A-ZÆØÅ]{1,4}\d[A-Z0-9]*(?:\.[A-Z0-9]+)*[A-Z0-9]?)\s+(?!bar\b)/i);
  const nsCode = nsMatch && !/^DN/i.test(nsMatch[1]) ? nsMatch[1] : undefined;

  if (nsCode && nsMatch) {
    text = text.slice(nsMatch[0].length).trim();
  }

  return { text, postNumber, nsCode };
}

function cleanMaterialDescription(description: string) {
  return description
    .replace(/^(?:post|pos\.?|nr\.?)\s*\d+(?:\.\d+)*\s*/i, "")
    .replace(/^(?:beskrivelse|description)\s*[:.-]?\s*/i, "")
    .replace(/^(?:NFPA\s*13|NFPA\s*14|NS-?\s*EN\s*12845|FM|UL|VdS)\b\s*/i, "")
    .replace(/\b(?:enhet|unit|mengde|quantity|qty)\b\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[-:,\s]+|[-:,\s]+$/g, "")
    .trim();
}

function isMeasurableMaterialCandidate(
  description: string,
  parsedQuantity: ParsedQuantity,
  codes: { postNumber?: string; nsCode?: string }
) {
  if (!description || parsedQuantity.quantity <= 0) {
    return false;
  }

  if (/^\d+(?:[,.]\d+)?\s*(?:bar|kpa|mpa|pa|c|°c)$/i.test(description)) {
    return false;
  }

  if (/^(?:sum|subtotal|total|side|page|kapittel|chapter)\b/i.test(description)) {
    return false;
  }

  if (looksLikeMaterialDescription(description)) {
    return true;
  }

  return Boolean(codes.postNumber || codes.nsCode);
}

function looksLikeMaterialDescription(description: string) {
  const lower = description.toLowerCase();

  return Boolean(
    extractDimensions(description).length > 0 ||
      /r(?:ø|o)r|pipe|bend|t-r(?:ø|o)r|overgang|reduksjon|nippel|adapter|endebunn|plug|cap|flens|pakning|gasket|bolt|mutter|coupling|kupling|kobling|muffe|albue|fitting|ventil|valve|sprinkler|standard\s+spray|dyse|nozzle|fleksibelslange|slange|hose|str(?:ø|o)mningsvakt|flow\s*switch|i\/?o|modul|module|enhet|sensor|pressostat|manometer|klammer|oppheng|brakett|bracket|support|hanger|isolering|insulation|plate|panel|skap|cabinet|deksel|cover|mansjett|sleeve|merking|skilt|label|test|drenering/.test(
        lower
      )
  );
}

function categorizeLineItem(description: string): ExtractedLineItemCategory {
  const lower = description.toLowerCase();

  if (/\bi\/?o\s+enhet\b|\binput\/output\b|\binterface\b|modul|module|kontrollenhet/.test(lower)) {
    return "control";
  }

  if (/str(?:\u00f8|o)mningsvakt|flow\s*switch|pressostat|manometer|sensor|monitor/.test(lower)) {
    return "sensor";
  }

  if (/fleksibelslange|flex(?:ible)?\s*sprinkler\s*hose/.test(lower)) {
    return "hose";
  }

  if (/standard\s+spray|sprinklerhode|sprinkler\s*head|\bsprinkler\b|\bqr\b|\bk\s*=|dyse|nozzle/.test(lower)) {
    return "sprinkler";
  }

  if (/kuleventil|stengeventil|tilbakeslagsventil|alarmventil|butterfly|\bventil\b|\bvalve\b/.test(lower)) {
    return "valve";
  }

  if (
    /bend|t-r(?:\u00f8|o)r|overgang|reduksjon|nippel|adapter|endebunn|plug|cap|flens|pakning|gasket|bolt|mutter|coupling|kupling|kobling|muffe|albue|fitting|klammer|oppheng|brakett|bracket|support|hanger/.test(
      lower
    )
  ) {
    return "fitting";
  }

  if (/rillede\s+r(?:\u00f8|o)r|\briller(?:\u00f8|o)r\b|\br(?:\u00f8|o)r\b|\bpipe\b/.test(lower)) {
    return "pipe";
  }

  if (/test|pr(?:\u00f8|o)ving|drenering/.test(lower)) {
    return "test";
  }

  if (/merking|marking|skilt|label/.test(lower)) {
    return "marking";
  }

  return "unknown";
}

function extractDimensions(description: string) {
  const patterns = [
    /\bDN\s?\d{2,4}\b/gi,
    /\bK\s*=\s*\d{2,3}\b/gi,
    /\b\d{2,3}\s*\u00b0\s*C\b/gi,
    /\b(?:Ø|OD)\s*\d{1,4}(?:[,.]\d+)?\b/gi,
    /\b\d{1,4}(?:[,.]\d+)?\s*x\s*\d{1,4}(?:[,.]\d+)?(?:\s*mm)?\b/gi,
    /\b\d{1,4}(?:[,.]\d+)?\s*mm\b/gi
  ];
  const dimensions = patterns.flatMap((pattern) =>
    Array.from(description.matchAll(pattern), ([match]) => normalizeDimension(match))
  );

  return Array.from(new Set(dimensions));
}

function normalizeDimension(value: string) {
  return value
    .replace(/\s+/g, "")
    .replace(/^dn/i, "DN")
    .replace(/^k=/i, "K=")
    .replace(/^od/i, "OD")
    .replace("°c", "°C");
}

function extractMaterial(description: string) {
  if (/pulverlakkert|powder\s*coated/i.test(description)) {
    return "Powder coated";
  }

  if (/galvanisert|galvanized|varmforsinket/i.test(description)) {
    return "Galvanized steel";
  }

  if (/st(?:\u00e5|a)l|steel/i.test(description)) {
    return "Steel";
  }

  return undefined;
}

function extractNsCode(description: string) {
  const match = description.match(/\b([A-ZÆØÅ]{1,4}\d[A-Z0-9]*(?:\.[A-Z0-9]+)*[A-Z0-9]?)\b/i);

  if (!match || /^DN/i.test(match[1])) {
    return undefined;
  }

  return match[1];
}

function getLineItemReviewFlags(input: {
  category: ExtractedLineItemCategory;
  description: string;
  dimension?: string;
  dimensions: string[];
  postNumber?: string;
  quantity?: number;
  unit?: string;
}) {
  const flags: string[] = [];
  const dimensionCritical = ["pipe", "fitting", "valve", "hose"].includes(
    input.category
  );

  if (input.category === "unknown") {
    flags.push("unknown-category");
  }

  if (!input.quantity || !input.unit) {
    flags.push("missing-quantity-or-unit");
  }

  if (dimensionCritical && !input.dimension) {
    flags.push("missing-dimension");
  }

  if (!looksLikeMaterialDescription(input.description) && !input.postNumber) {
    flags.push("weak-material-evidence");
  }

  return flags.length > 0 ? flags : ["high-confidence"];
}

function scoreLineItem(input: {
  category: ExtractedLineItemCategory;
  description: string;
  dimension?: string;
  dimensions: string[];
  extractionMethod?: ExtractedLineItem["extractionMethod"];
  postNumber?: string;
  quantity?: number;
  reviewFlags: string[];
  standardRefs: string[];
  unit?: string;
}) {
  let score = 52;

  if (input.quantity !== undefined && input.unit) score += 18;
  if (input.dimension) score += 11;
  if (input.dimensions.length > 1) score += 3;
  if (input.category !== "unknown") score += 12;
  if (input.standardRefs.length > 0) score += 5;
  if (input.postNumber) score += 4;
  if (input.extractionMethod === "table-row") score += 2;
  if (input.extractionMethod === "wrapped-line") score -= 3;
  if (input.reviewFlags.includes("unknown-category")) score -= 12;
  if (input.reviewFlags.includes("missing-dimension")) score -= 7;
  if (input.reviewFlags.includes("weak-material-evidence")) score -= 10;

  return Math.max(35, Math.min(score, 99));
}

function detectSystem(text: string) {
  return systemPatterns.find((pattern) =>
    pattern.patterns.some((regex) => regex.test(text))
  );
}

function inferDefaultSystem(systems: ExtractedSystem[]) {
  return systems.find((system) => system.normalizedName === "sprinkler-a10")?.name;
}

function normalizeStandardCode(code: string) {
  return code
    .replace(/\s+/g, " ")
    .replace(/NS-?\s*EN/i, "NS-EN ")
    .replace(/NFPA\s*/i, "NFPA ")
    .trim()
    .toUpperCase()
    .replace("VDS", "VdS");
}

function normalizeRequirementValue(value: string) {
  return value.replace(/\s+/g, " ").replace(/DN\s+/i, "DN").trim();
}

function normalizeUnit(unit: string) {
  const normalized = unit.toLowerCase().replace(/\s+/g, "");

  if (["pcs", "pc", "ea", "each", "stykk"].includes(normalized)) {
    return "stk";
  }

  if (normalized === "rs") {
    return "RS";
  }

  if (["set"].includes(normalized)) {
    return "sett";
  }

  if (["meter", "metre", "lm"].includes(normalized)) {
    return "m";
  }

  if (["m2", "m²"].includes(normalized)) {
    return "m2";
  }

  if (["m3", "m³"].includes(normalized)) {
    return "m3";
  }

  if (["liter", "litre"].includes(normalized)) {
    return "l";
  }

  if (["pair", "par"].includes(normalized)) {
    return "par";
  }

  if (["punkt"].includes(normalized)) {
    return "pkt";
  }

  return normalized;
}

function getLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function findSourceLine(text: string, patterns: RegExp[]) {
  return getLines(text).find((line) => patterns.some((pattern) => pattern.test(line)));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
