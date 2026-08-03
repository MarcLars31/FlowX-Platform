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

const ITEM_CODE_PATTERN = /^\s*(?:(\d{2}\.\d{3}(?:\.\d+)?)\s*[|:]?\s*)?(UE\d[\w.-]*)\b/i;
const POST_NUMBER_PATTERN = /^\s*(\d{2}\.\d{3}(?:\.\d+)?)/;
const NS_CODE_PATTERN = /\b(UE\d[\w.-]*)\b/i;
const STANDARD_PATTERN = /\b(NS[-\s]EN\s*\d+(?:[-:]\d+)*(?:\s*\+\s*\d+)*)\b/gi;
const ATTRIBUTE_PATTERN = /^\s*([^:]{2,60}):\s*(.*?)\s*$/;

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
    const projectNumber = projectName?.match(/^([A-Z]\.?[\d.]+)/i)?.[1];
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
  const operation = /demontering|demontere|fjerne|eksisterende/i.test(
    normalizedText
  )
    ? "remove"
    : /montering|installasjon|levering/i.test(normalizedText) ||
        block.quantity !== undefined
      ? "install"
      : "unknown";
  const reviewFlags: string[] = [];

  if (!block.quantity && operation !== "remove") reviewFlags.push("missing-quantity");
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
  if (/sprinkler|sprinklerhode/.test(text)) return "sprinkler_head";
  if (/\brør\b|\bpipe\b/.test(text)) return "pipe";
  if (/fitting|bend|muffe|kobling/.test(text)) return "fitting";
  if (/ventil|valve/.test(text)) return "valve";
  if (/oppheng|støtte|support/.test(text)) return "support";
  if (/kontroll|alarm|sensor/.test(text)) return "control";
  return "unknown";
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
  const match = value.match(/^\s*Antall\s+([a-zA-ZæøåÆØÅ]+)\s+([\d\s.,]+)/i);
  if (!match) return undefined;
  return parseQuantity(match[2] + " " + match[1]);
}

function parseQuantity(value: string) {
  const match = value.match(/([\d][\d\s.,]*)\s*([a-zA-ZæøåÆØÅ]+)/);
  if (!match) return undefined;

  const normalized = match[1].replace(/\s/g, "").replace(",", ".");
  const quantity = Number.parseFloat(normalized);
  if (!Number.isFinite(quantity)) return undefined;

  return {
    quantity,
    text: match[0].trim(),
    unit: normalizeUnit(match[2])
  };
}

function normalizeUnit(value: string) {
  const normalized = value.toLocaleLowerCase();
  if (normalized === "stk" || normalized === "st") return "pcs";
  if (normalized === "m2" || normalized === "m²") return "m2";
  return normalized;
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
