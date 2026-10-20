import { normalizeQuantityUnit, parseQuantityNumber } from "@/lib/quantity-value";
import { normalizePdfMeasurementUnit } from "@/lib/pdf-measurement-unit";
import { numberedPostHeading } from "./numbered-post-heading";
import { isPdfTableTotalFooter, normalizeOcrDnTokens, pdfLumpSumLine } from "@/lib/pdf-post-text";

// Document syntax only; product classification belongs to consumers.
export const ATTRIBUTE_PATTERN = /^\s*([^:]{2,60}):\s*(.*?)\s*$/;

export const NS3420_CODE_PATTERN =
  /^(%?[A-ZÆØÅ]{2}\d(?:\.[A-ZÆØÅ0-9]+)*[A-ZÆØÅ]?|RQA?|AOA|WZA|WSA|YBA|XEA)(?=\s|$)\s*(?:-\s*)?(.*)$/i;

export const QUANTITY_UNIT_SOURCE = String.raw`(?:stk|st|pcs?|m|lm|[i1]m|meter|løpemeter|m2|m²|m3|m³|kg|liter|l)`;

const QUANTITY_NUMBER_SOURCE = String.raw`(?:\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;

const TABLE_QUANTITY_PATTERN = new RegExp(
  String.raw`^(?:(?:(?:Samlet\s+)?Lengde|Antall|Areal|Volum|Vekt|Masse)\s+)?(${QUANTITY_UNIT_SOURCE})\.?\s+(${QUANTITY_NUMBER_SOURCE})(?=\s|$)`,
  "i"
);

const INLINE_TABLE_QUANTITY_PATTERN = new RegExp(
  String.raw`^(.*?)\s+(${QUANTITY_UNIT_SOURCE})\.?\s+(${QUANTITY_NUMBER_SOURCE})(?:\s+${QUANTITY_NUMBER_SOURCE}){0,3}$`,
  "i"
);

export type StructuredPostStart = {
  lineIndex: number;
  consumedLineCount: number;
  postNumber: string;
  description: string;
  chapter?: boolean;
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

export const STRUCTURED_POST_SOURCE = String.raw`(?:[A-Z]\d*\.)?\d+(?:\.\d+){1,10}`;

const LEADING_QUANTITY_POST_PATTERN = new RegExp(
  String.raw`^(?:(?:Antall|Lengde)\s+)?(?<unit>${STRUCTURED_UNIT_SOURCE})\.?\s+(?<quantity>${STRUCTURED_NUMBER_SOURCE})(?:\s+${STRUCTURED_NUMBER_SOURCE}){1,3}\s+(?<post>${STRUCTURED_POST_SOURCE}\.?)\s*(?<description>.*)$`,
  "i"
);

const LEADING_LUMP_SUM_POST_PATTERN = new RegExp(
  String.raw`^RS(?:\s+${STRUCTURED_NUMBER_SOURCE}){0,3}\s+(?<post>${STRUCTURED_POST_SOURCE}\.?)\s*(?<description>.*)$`,
  "i"
);

const SHORT_LEADING_QUANTITY_POST_PATTERN = new RegExp(
  String.raw`^(?<unit>${STRUCTURED_UNIT_SOURCE})\.?\s+(?<quantity>${STRUCTURED_NUMBER_SOURCE})\s+(?<post>\d{1,4})\s+(?<description>[A-ZÆØÅ].*)$`, "i"
);

const TRAILING_QUANTITY_POST_PATTERN = new RegExp(
  String.raw`^(?<post>${STRUCTURED_POST_SOURCE}\.?)\s+(?<description>.+?)\s+(?<unit>${STRUCTURED_UNIT_SOURCE})\.?\s+(?<quantity>${STRUCTURED_NUMBER_SOURCE})(?:\s+${STRUCTURED_NUMBER_SOURCE}){0,3}$`,
  "i"
);

const FULL_POST_LINE_PATTERN = new RegExp(String.raw`^(${STRUCTURED_POST_SOURCE})(?:\s*[|)]{1,2}\s*|\s+)(.+)$`, "i");

const PARENT_POST_LINE_PATTERN = /^(\d{1,4})\s+((?:%?[A-ZÆØÅ]{1,10}\d[\w.%-]*|RQA?|AOA|[A-ZÆØÅ][A-ZÆØÅ /-]{4,}))$/;

const EXACT_POST_LINE_PATTERN = new RegExp(String.raw`^(${STRUCTURED_POST_SOURCE}\.?)\s*[|)]{0,2}$`, "i");

const POST_CONTINUATION_PATTERN = /^(\.?\d+(?:\.\d+)*)\s*(.*)$/;

const EXPLICIT_POST_AT_START_PATTERN = new RegExp(String.raw`^(${STRUCTURED_POST_SOURCE})(?=\s|[|)])`, "i");

export function parseStructuredPostStart(
  lines: string[],
  lineIndex: number
): StructuredPostStart | undefined {
  const line = withoutPriceColumns(lines[lineIndex]);
  if (isTechnicalDescriptionDateHeader(line.split(/\s+/)[0])) return undefined;
  // Wrapped IO-list identifiers are references inside a specification, not
  // rows in the post-number column.
  if (/^\d+(?:\.\d+)+$/.test(line) && /(?:^|[_\s])IO[- ]liste(?:\s+fordeling)?\s*$/i.test(lines[lineIndex - 1] ?? "")) return undefined;
  // References such as "krav gitt i tekniske bestemmelser, post" often wrap
  // immediately before the next row. Keep that number in the specification;
  // treating it as a row would consume the next row's wrapped prefix.
  if (/(?:beskrevet\s+under|se|henvises\s+til|bestemmelser,?)\s+post(?:\s*(?:nr\.?|nummer))?\s*:?\s*$/i.test(lines[lineIndex - 1] ?? "")) return undefined;
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

  const leadingQuantity = line.match(LEADING_QUANTITY_POST_PATTERN) ?? line.match(SHORT_LEADING_QUANTITY_POST_PATTERN);
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
      description: leadingLumpSum.groups.description,
      quantity: { quantity: 1, unit: "RS", text: "Rund sum", lineIndex: 0, descriptionPrefix: "" }
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

function parseWrappedVisualPostStart(
  lines: string[],
  lineIndex: number
): StructuredPostStart | undefined {
  const baseMatch = lines[lineIndex].match(
    new RegExp(String.raw`^(${STRUCTURED_POST_SOURCE}\.?)\s*[|)]{0,2}\s+(.+)$`, "i")
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
    (baseParts.length < 3 && !base.endsWith("."))
    || (!continuation.includes(".") && !base.endsWith(".") && !/^[A-Z]/i.test(base))
    // A new post in the same chapter (including siblings and parents) is
    // never a wrapped suffix of the preceding post number.
    || continuationWithoutDot.startsWith(`${baseParts[0]}.`)
    || !/[a-zæøå]/i.test(baseMatch[2])
  ) {
    return undefined;
  }

  const quantity = findTableQuantity([baseMatch[2]]);
  return {
    lineIndex,
    consumedLineCount: 2,
    postNumber: composeWrappedPostNumber(base,
      /^[A-Z]/i.test(base) && !continuation.includes(".") && /^Dimensjon\b/i.test(baseMatch[2])
        ? `.${continuation}` : continuation),
    description: [quantity ? quantity.descriptionPrefix : baseMatch[2], continuationMatch[2]]
      .filter(Boolean)
      .join(" ")
      .trim(),
    quantity
  };
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

  const heading = numberedPostHeading(cleanPost, lines[lineIndex + 1] ?? "");
  if (heading) {
    return { lineIndex, consumedLineCount: 2, postNumber: heading.postNumber,
      description: heading.description, quantity };
  }
  const continuation = lines[lineIndex + 1]?.match(POST_CONTINUATION_PATTERN);
  if (!continuation || continuation[1].replace(/^\./, "").startsWith(`${cleanPost.split(".")[0]}.`)) {
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
  return `${base}${continuation}`;
}

export function isTechnicalDescriptionDateHeader(value: string) {
  return /^(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:19|20)\d{2}$/.test(value.trim());
}

export function recoverDisplacedOcrPostNumbers(lines: string[]) {
  const starts = lines.filter((line, index) => parseStructuredPostStart(lines, index));
  // Multiple detached numbers need layout coordinates to pair safely.
  if (starts.length !== 1) return lines;
  const recovered = [...lines];
  for (let index = 0; index < recovered.length - 1; index += 1) {
    if (!EXACT_POST_LINE_PATTERN.test(recovered[index])
      || isTechnicalDescriptionDateHeader(recovered[index])
      || !ATTRIBUTE_PATTERN.test(recovered[index + 1])) continue;
    for (let next = index + 1; next < recovered.length; next += 1) {
      if (NS3420_CODE_PATTERN.test(recovered[next])) {
        const [post] = recovered.splice(index, 1);
        recovered.splice(next - 1, 0, post);
        index = next - 1;
        break;
      }
      if (isTableFooter(recovered[next]) || hasTableQuantity(recovered[next])
        || parseStructuredPostStart(recovered, next)) break;
    }
  }
  return recovered;
}

export function recoverMissingStructuredPostNumbers(pageLines: string[][]) {
  type FlatLine = { pageIndex: number; lineIndex: number; text: string };
  const flatLines: FlatLine[] = pageLines.flatMap((lines, pageIndex) =>
    lines.map((text, lineIndex) => ({ pageIndex, lineIndex, text }))
  );
  // A code following a standalone or wrapped post number already has an
  // identity. Do not infer a replacement from the next page's first post.
  const attachedCodes = new Set<number>();
  let pageOffset = 0;
  for (const lines of pageLines) {
    for (let index = 0; index < lines.length; index += 1) {
      const start = parseStructuredPostStart(lines, index);
      if (!start) continue;
      attachedCodes.add(pageOffset + index + start.consumedLineCount);
      index += start.consumedLineCount - 1;
    }
    pageOffset += lines.length;
  }
  const explicit = flatLines
    .map((line, flatIndex) => ({
      flatIndex,
      postNumber: line.text.match(EXPLICIT_POST_AT_START_PATTERN)?.[1]
    }))
    .filter((entry): entry is { flatIndex: number; postNumber: string } => Boolean(entry.postNumber)
      && !isTechnicalDescriptionDateHeader(entry.postNumber!));
  const candidates = flatLines
    .map((line, flatIndex) => ({ line, flatIndex }))
    .filter(({ line, flatIndex }) =>
      NS3420_CODE_PATTERN.test(line.text)
      && !attachedCodes.has(flatIndex)
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
    // Missing quantities must not discard the entire row. Infer its identity
    // only when the surrounding explicit sequence accounts for every NS row.
    if (!blockHasExplicitQuantity(flatLines, candidate.flatIndex)) {
      const previousParts = previous?.postNumber.match(/^(.*\.)(\d+)$/);
      const nextParts = next.postNumber.match(/^(.*\.)(\d+)$/);
      if (!previousParts || !nextParts || previousParts[1] !== nextParts[1]
        || Number(nextParts[2]) - Number(previousParts[2]) !== group.length + 1) continue;
    }

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

export function footerIndex(lines: string[], afterIndex: number) {
  const offset = lines.slice(afterIndex + 1).findIndex(isTableFooter);
  return offset < 0 ? lines.length : afterIndex + 1 + offset;
}

export function normalizedPageLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => normalizeOcrArtifacts(withoutPriceColumns(line).replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

/** Tabs are physical cell boundaries. Consume exactly the cell after the unit,
 * including an empty cell; prices must not become a quantity or its suffix.
 * Spaces inside one quantity cell (e.g. 1 234,50) remain significant. */
function withoutPriceColumns(line: string) {
  line = normalizePdfMeasurementUnit(line);
  if (!line.includes("\t")) return line;
  const cells = line.split("\t");
  const unitCell = cells.findIndex(cell => new RegExp(`(?:^|\\s)${QUANTITY_UNIT_SOURCE}\\.?$`, "i").test(cell.trim()));
  return unitCell < 0 || unitCell + 1 >= cells.length ? line : cells.slice(0, unitCell + 2).join(" ");
}

export function extractPostScope(lines: string[]) {
  const chapter = lines.find(line => /^Kapittel:/i.test(line));
  if (!chapter) return undefined;
  const path = chapter.replace(/^Kapittel:\s*/i, "").replace(/(?:\s*-)+\s*$/, "").trim();
  return path.toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");
}

function normalizeOcrArtifacts(value: string) {
  return normalizeOcrDnTokens(value)
    .replace(/^((?:[A-Z]\d*\.)?\d+(?:[.,]\d+){2,})(?=\s+%?[A-ZÆØÅ]{2}\d|\s*$)/i, post => post.replace(/,/g, "."))
    .replace(/^(.*?\s)?((?:UB|UC|UE|CD)\d),(\d[\w.]*)\b/i, "$1$2.$3")
    .replace(/^((?:[A-Z]\d*\.)?\d+(?:\.\d+)+)\s*\]/i, "$1 | ")
    .replace(/\bDNB(\d{2,3})\b/gi, "DN$1")
    .replace(/\bDNS0\b/gi, "DN50")
    .replace(/\bDN[ASG](25|32|40|50|65|80|100|125|150|200)\b/gi, "DN$1")
    .replace(/\bDN6S5\b/gi, "DN65");
}

export function extractChapterPost(lines: string[]) {
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
  return isPdfTableTotalFooter(value)
    || /^(?:Prosjekt:|Postnr:|Kopi-)/i.test(value);
}

export function findTableQuantity(lines: string[]) {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    let line = withoutPriceColumns(lines[lineIndex]);
    // PDF text streams can place a row's label, unit and amount on separate
    // consecutive lines. Join only a complete quantity, never the next post.
    const label = String.raw`(?:(?:Samlet\s+)?Lengde|Antall|Areal|Volum|Vekt|Masse)`;
    if (new RegExp(String.raw`^(?:${label}(?:\s+${QUANTITY_UNIT_SOURCE})?|${QUANTITY_UNIT_SOURCE})\.?$`, "i").test(line)) {
      for (let count = 2; count <= 3; count++) {
        const candidate = withoutPriceColumns(lines.slice(lineIndex, lineIndex + count).join(" "));
        if (new RegExp(String.raw`^(?:${label}\s+)?${QUANTITY_UNIT_SOURCE}\.?\s+${QUANTITY_NUMBER_SOURCE}(?:\s+${QUANTITY_NUMBER_SOURCE}){0,3}$`, "i").test(candidate)) {
          line = candidate;
          break;
        }
      }
    }
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

  // RS is a priced scope, not a zero quantity: the trailing zeroes belong to
  // price/sum columns. Prefer explicit numeric quantities (e.g. "Rund sum stk
  // 1") above, and retain the remaining lump sums as one scope in unit RS.
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const missingUnit = lines[lineIndex].match(new RegExp(String.raw`^(?:Antall|Lengde)\s+(${QUANTITY_NUMBER_SOURCE})$`, "i"));
    if (missingUnit) return { quantity: parseLocalizedNumber(missingUnit[1])!, unit: "?", text: lines[lineIndex], lineIndex, descriptionPrefix: "" };
  }
  const lumpSumRow = lines.findIndex(line => /^(?:Rund\s+sum(?:\s+RS)?|RS)(?:\s+[\d., ]+)?$/i.test(line));
  if (lumpSumRow >= 0) return { quantity: 1, unit: "RS", text: "Rund sum", lineIndex: lumpSumRow, descriptionPrefix: "" };
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const match = lines[lineIndex].match(/^(.*?)(?:^|\s)RS(?:\s+[\d., ]+)?$/i)
      ?? lines[lineIndex].match(/^(.*?)(?:^|\s)Rund\s+sum\s*$/i);
    if (match) return { quantity: 1, unit: "RS", text: "Rund sum", lineIndex, descriptionPrefix: match[1].trim() };
  }

  return undefined;
}

export function tableDescription(parts: string[]) {
  const cleaned = parts
    .map((part) => part.trim().replace(/^[|)]{1,2}\s*/, ""))
    .filter((part) => Boolean(part) && !/^(?:Antall(?: prøver)?|Lengde|Mengde|Rund sum)$/i.test(part));
  let nsCode: string | undefined;

  // The code belongs at the start of the description column. Hazard classes
  // such as OH1 deep inside chapter prose are not this row's NS code.
  for (let index = 0; index < Math.min(cleaned.length, 2); index += 1) {
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

export function extractTableAttributes(lines: string[]) {
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
      if (["gjelder", "andre krav", "postnr", "kapittel", "prosjekt"].includes(key)) continue;
      attributes[key] = normalizeAttributeValue(key, match[2]);
      activeKey = hasTableQuantity(line) ? null : key;
      continue;
    }

    if (/^(?:[a-z]\)|Andre krav|Merket\b|Sum\b|Akkumulert|Kopi-|Prisen\b|Det skal\b|Alle\b|Tilbehør\b)/i.test(line)
      || /^(?:Antall|Lengde|Mengde)\s*$/i.test(line)) activeKey = null;
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
  return pdfLumpSumLine.test(value) || TABLE_QUANTITY_PATTERN.test(value)
    || INLINE_TABLE_QUANTITY_PATTERN.test(value);
}

export function extractInlineAttributes(description: string) {
  const attributes: Record<string, string> = {};
  const dimensions = unique(
    [...description.matchAll(/\bDN\s*\d+(?:\s*-\s*DN?\s*\d+)*\b/gi)].map(
      (match) => match[0].replace(/\s+/g, "")
    )
  );
  if (dimensions.length > 0) attributes.dimensjon = dimensions.join(", ");

  // Short subposts often specify an outside diameter in mm instead of DN.
  // Keep that unit; an outside diameter must not be converted to nominal DN.
  const millimetres = description.match(/^(?:[Øø⌀]\s*)?\d+(?:[.,]\d+)?(?:\s*[x×/]\s*\d+(?:[.,]\d+)?){0,2}\s*mm$/i);
  if (!dimensions.length && millimetres) attributes.dimensjon = millimetres[0];

  const kFactor = description.match(/\bK\s*[=-]\s*(\d+(?:[.,]\d+)?)/i)?.[1];
  if (kFactor) attributes["k-faktor"] = kFactor.replace(",", ".");

  const temperature = description.match(/(-?\d+(?:[.,]\d+)?)\s*°\s*C\b/i)?.[1];
  if (temperature) {
    attributes["utløsningstemperatur"] = `${temperature.replace(",", ".")} °C`;
  }

  return attributes;
}

export function normalizeUnit(value: string) {
  return normalizeQuantityUnit(value);
}

export function parseLocalizedNumber(value: string) {
  return parseQuantityNumber(value) ?? undefined;
}

export function normalizeAttributeKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(?:folsomhetsgrad|felsomhetsgrad)/g, "følsomhetsgrad")
    .replace(/^utl[øoeög]sningstemperatur$/, "utløsningstemperatur");
}

export function normalizeAttributeValue(key: string, value: string) {
  let normalized = normalizeOcrArtifacts(value.trim().replace(/^\|\s+/, ""));
  if (key === "dimensjon") {
    const dimensions = normalized.match(/\bDN\s*\d+(?:\s*[-x×/]\s*(?:DN\s*)?\d+){0,2}\b/gi);
    if (dimensions) normalized = dimensions.map((dimension) => dimension.replace(/DN\s+/gi, "DN")).join(", ");
  }
  if (key === "k-faktor") {
    normalized = normalized.replace(/(\d),(\d)/g, "$1.$2");
  }
  if (key === "utløsningstemperatur") {
    normalized = normalized
      .replace(/\s*[°*]\s*C\b/gi, " °C")
      .replace(/\s+°C/g, " °C");
  }
  return normalized;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
