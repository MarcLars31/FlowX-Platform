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
const NS3420_BASE_POST_PATTERN = /^(\d+(?:\.\d+){2,})\.$/;
const NS3420_ROW_NUMBER_PATTERN = /^(\d+(?:\.\d+)*)$/;
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
      /Prosjekt:\s*(.+?)(?:\s+Side\s+\d+[-/]\d+|$)/i
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
  const tableLines = extractNs3420TableLines(pages);
  if (tableLines.length > 0) return tableLines;

  return extractLegacyMaterialLines(pages, warnings);
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
            page
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

    for (let index = 0; index < pageLines.length - 1; index += 1) {
      const baseMatch = pageLines[index].match(NS3420_BASE_POST_PATTERN);
      if (!baseMatch) continue;

      const rowNumber = pageLines[index + 1]?.match(NS3420_ROW_NUMBER_PATTERN)?.[1];
      if (!rowNumber) continue;

      let blockEnd = index + 2;
      while (
        blockEnd < pageLines.length &&
        !NS3420_BASE_POST_PATTERN.test(pageLines[blockEnd]) &&
        !isTableFooter(pageLines[blockEnd])
      ) {
        blockEnd += 1;
      }

      const blockLines = pageLines.slice(index + 2, blockEnd);
      const quantity = findTableQuantity(blockLines);
      const fullPostNumber = `${baseMatch[1]}.${rowNumber}`;
      const descriptionParts = quantity
        ? blockLines.slice(0, quantity.lineIndex)
        : blockLines;
      if (quantity?.descriptionPrefix) {
        descriptionParts.push(quantity.descriptionPrefix);
      }
      const { nsCode, description } = tableDescription(descriptionParts);
      const sourceText = [pageLines[index], rowNumber, ...blockLines].join("\n");
      const ownAttributes = {
        ...extractTableAttributes(blockLines),
        ...extractInlineAttributes(description)
      };
      const ownStandardRefs = unique(
        [...sourceText.matchAll(STANDARD_PATTERN)].map((match) =>
          normalizeStandard(match[1])
        )
      );

      if (!rowNumber.includes(".")) {
        parentContexts.set(fullPostNumber, {
          nsCode,
          attributes: ownAttributes,
          system: inferSystem(`${description}\n${sourceText}`.toLocaleLowerCase()),
          standardRefs: ownStandardRefs,
          sourceText
        });
      }

      if (!quantity || quantity.quantity <= 0) {
        index = Math.max(index, blockEnd - 1);
        continue;
      }

      const key = `${page.pageNumber}:${fullPostNumber}`;
      if (seen.has(key)) {
        index = Math.max(index, blockEnd - 1);
        continue;
      }

      const parentPostNumber = rowNumber.includes(".")
        ? `${baseMatch[1]}.${rowNumber.split(".")[0]}`
        : undefined;
      const parent = parentPostNumber
        ? parentContexts.get(parentPostNumber)
        : undefined;
      const attributes = {
        ...(parent?.attributes ?? {}),
        ...ownAttributes
      };
      const normalizedText = `${description}\n${sourceText}\n${parent?.system ?? ""}`.toLocaleLowerCase();
      const category = inferCategory(description.toLocaleLowerCase());
      const operation = inferOperation(normalizedText, true);
      const reviewFlags: string[] = [];
      if (category === "unknown") reviewFlags.push("unknown-category");
      if (page.method === "ocr") reviewFlags.push("ocr-source");
      if (category === "pipe" && quantity.unit !== "m") {
        reviewFlags.push("pipe-unit-not-length");
      }

      materialLines.push({
        id: `technical-material-${page.pageNumber}-${fullPostNumber.replace(/[^a-zA-Z0-9]+/g, "-")}`,
        postNumber: fullPostNumber,
        parentPostNumber,
        nsCode: nsCode ?? parent?.nsCode,
        category,
        description: description || categoryLabel(category),
        operation,
        quantity: quantity.quantity,
        quantityText: quantity.text,
        unit: quantity.unit,
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
      index = Math.max(index, blockEnd - 1);
    }
  }

  return materialLines;
}

type TableParentContext = {
  nsCode?: string;
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
};

function createBlock(
  postNumber: string | undefined,
  nsCode: string | undefined,
  rawLine: string,
  page: TechnicalDescriptionPage
): ParsedBlock {
  return {
    postNumber,
    nsCode,
    title: rawLine.replace(ITEM_CODE_PATTERN, "").replace(POST_NUMBER_PATTERN, "").trim(),
    lines: [rawLine],
    attributes: {},
    standardRefs: [],
    sourcePage: page.pageNumber,
    ocrConfidence: page.confidence
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
  if (/fitting|bend|muffe|kobling|kupling|t-rør|rørdel|overgang|endebunn|anborring/.test(text)) {
    return "fitting";
  }
  if (/rør\b|rørledning|rillerør|rillede rør|\bpipe\b|red pipe/.test(text)) {
    return "pipe";
  }
  if (/oppheng|støtte|support/.test(text)) return "support";
  if (/kontroll|alarm|sensor|detektor|sentral|signalapparat|strømningsvakt|melder/.test(text)) {
    return "control";
  }
  if (/sprinkler|sprinklerhode|standard spray|utvidet dekning/.test(text)) {
    return "sprinkler_head";
  }
  return "unknown";
}

function inferOperation(text: string, hasQuantity: boolean) {
  if (/demontering|demontere|fjerne|riving|eksisterende/.test(text)) {
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
