import { ownPostHeadingSource, splitPostHeading } from "./post-heading";
import { hasSprinklerContext, hasSprinklerHeadEvidence, hasSprinklerText } from "@/lib/sprinkler-requirement-context";
import { productExtractionCategory } from "@/lib/product-classification";
import { ATTRIBUTE_PATTERN, NS3420_CODE_PATTERN, QUANTITY_UNIT_SOURCE, type StructuredPostStart, STRUCTURED_POST_SOURCE, parseStructuredPostStart, recoverDisplacedOcrPostNumbers, recoverMissingStructuredPostNumbers, footerIndex, normalizedPageLines, extractPostScope, extractChapterPost, findTableQuantity, tableDescription, extractTableAttributes, extractInlineAttributes, normalizeAttributeKey, normalizeAttributeValue } from "./document-parser";
export { isTechnicalDescriptionDateHeader } from "./document-parser";
import { buildPdfDocumentStructure } from "./document-structure";
import { isPdfConsultantDateHeader } from "@/lib/pdf-post-text";
import type {
  TechnicalDescriptionCategory,
  TechnicalDescriptionExtractionResult,
  TechnicalDescriptionMaterialLine,
  TechnicalDescriptionPage,
  TechnicalDescriptionRuleHint,
  TechnicalDescriptionWarning
} from "./types";
import {
  MAX_SUPPORTED_SPRINKLER_K_FACTOR,
  parseSprinklerKFactor
} from "@/lib/project-requirement-data-warnings";
import { isManifoldCabinetProduct } from "@/lib/ahlsell-manifold-cabinet";
import { distributorRequirementKind } from "@/lib/distributor-requirement-lines";
import { conflictingMaterialRequirement } from "@/lib/requirement-extraction-warnings";
import { attachNumberedChapters, numberedChaptersFromPages } from "./chapters";
import { pdfChaptersByPage } from "./pdf-chapters";
import { withSiteTableChapterHeadings } from "./pdf-post-table";
import { sortMaterialLinesBySource } from "./post-source-order";
import { reconcileSourcePosts } from "./post-coverage";
import { pdfPostDescriptionText, pdfPostColumnValues } from "./pdf-post-description";

type ExtractOptions = {
  fileName?: string;
};

const ITEM_CODE_PATTERN =
  /^\s*(?:(\d{2}\.\d{3}(?:\.\d+)*)\s*[|:]?\s*)?([A-ZÆØÅ]{2}\d[\w.-]*)\b/i;
const POST_NUMBER_PATTERN = /^\s*(\d{2}\.\d{3}(?:\.\d+)*)/;
const NS_CODE_PATTERN = /\b([A-ZÆØÅ]{2}\d[\w.-]*)\b/i;
const STANDARD_PATTERN =
  /\b((?:NS(?:[-\s]?EN)?|NFPA)\s*\d+(?:[-:]\d+)*(?:\s*\+\s*\d+)*)\b/gi;

export function extractTechnicalDescriptionFromPages(
  pages: TechnicalDescriptionPage[],
  options: ExtractOptions = {}
): TechnicalDescriptionExtractionResult {
  pages = withSiteTableChapterHeadings(pages);
  const documentStructure = buildPdfDocumentStructure(pages, options.fileName);
  const warnings: TechnicalDescriptionWarning[] = [];
  const numberedChapters = numberedChaptersFromPages(pages);
  const project = extractProject(pages);
  if (!project.chapter && numberedChapters.length) project.chapter = numberedChapters[0].label;
  const materialLines = extractMaterialLines(pages, warnings);
  const postChecks = reconcileSourcePosts(pages, materialLines, warnings);
  sortMaterialLinesBySource(pages, materialLines);
  const chapters = pdfChaptersByPage(pages);
  const unrecognizedQuantityPages = new Set(pages
    .filter(page => page.postTable?.quantityColumnsUnrecognized).map(page => page.pageNumber));
  const uncertainPages = new Map(pages.filter(page => page.method === "ocr" && page.confidence < 0.7).map(page => [page.pageNumber,page.confidence]));
  for (const [index, line] of materialLines.entries()) {
    const originalColumns = pages.find(page => page.pageNumber === line.sourcePage && page.method === "ocr")?.sourceColumnQuantities
      ?.filter(cell => cell.postNumber === line.postNumber);
    if (originalColumns?.length === 1 && materialLines.filter(other => other.sourcePage === line.sourcePage && other.postNumber === line.postNumber).length === 1) {
      const original = originalColumns[0];
      line.quantity = original.quantity; line.unit = original.unit; line.quantityText = original.text; line.quantitySourcePage = line.sourcePage;
      line.reviewFlags = line.reviewFlags.filter(flag => !["missing-quantity", "missing-unit", "project-information"].includes(flag));
    }
    const pdfDescriptionText = pdfPostDescriptionText(pages, line);
    if (pdfDescriptionText) {
      line.pdfDescriptionText = pdfDescriptionText;

    }
    line.pdfColumnValues = pdfPostColumnValues(pages, line);
    const page = pages.find(page => page.pageNumber === line.sourcePage);
    const source = page?.headingSources?.filter(source => source.postNumber === line.postNumber);
    const physicalSource = source?.length === 1 && (line.sourcePages?.length ?? 1) === 1 ? source[0] : undefined;
    const savedLines = normalizedPageLines(line.sourceText);
    const ownStart = parseStructuredPostStart(savedLines, 0);
    const ownBody = ownStart && ownStart.postNumber === line.postNumber
      ? [ownStart.description, ...savedLines.slice(ownStart.consumedLineCount)].filter(Boolean).join("\n") : line.sourceText;
    const headingSource = ownPostHeadingSource(physicalSource?.text ?? pdfDescriptionText ?? ownBody, line.postNumber, line.nsCode);
    const split = splitPostHeading(headingSource, physicalSource?.layout ?? page?.headingLayout);
    line.headingSplit = split;
    line.requirementText = split.requirementText;
    if (split.status === "separated" && split.title) line.description = split.title;
    line.title = line.description;
    if (split.status === "review") {
      line.reviewFlags = unique([...line.reviewFlags, "unverified-heading-boundary"]);
      warnings.push({ id: `heading-${line.id}`, code: "PDF_HEADING_UNVERIFIED", severity: "warning", sourcePage: line.sourcePage,
        message: "Rubrikens gräns kunde inte verifieras. Hela originaltexten är bevarad för kontroll.", sourceText: headingSource });
    }
    let chapter = chapters.get(line.sourcePage);
    const nextChapter = chapters.get(line.sourcePage + 1);
    // A chapter can begin halfway down a page whose footer still names the
    // preceding chapter. The post number and next page must both confirm it.
    if (nextChapter && nextChapter.sourcePage === line.sourcePage + 1 && postBelongsToChapter(line.postNumber, nextChapter.title)) {
      nextChapter.sourcePage = line.sourcePage;
      chapter = nextChapter;
    }
    const table = pages.find(page => page.pageNumber === line.sourcePage)?.postTable;
    if (table) chapter = { title: table.siteTitle,
      sourcePage: pages.find(page => page.postTable?.siteTitle === table.siteTitle)!.pageNumber };
    if (chapter) line.sourceChapter = chapter;
    if ((line.sourcePages ?? [line.sourcePage]).some(pageNumber => unrecognizedQuantityPages.has(pageNumber))) {
      line.reviewFlags = unique([...line.reviewFlags, "unrecognized-quantity-columns"]);
    }
    if ((line.sourcePages ?? [line.sourcePage]).some(number => pages.find(page => page.pageNumber === number)?.priceColumns?.status === "review")) {
      line.reviewFlags = unique([...line.reviewFlags, "unverified-price-columns"]);
    }
    const uncertainSources = (line.sourcePages ?? [line.sourcePage]).flatMap(number => uncertainPages.has(number) ? [uncertainPages.get(number)!] : []);
    if ((line.sourcePages ?? [line.sourcePage]).some(number => pages.find(page => page.pageNumber === number)?.sourceTextMerge)) {
      line.reviewFlags = unique([...line.reviewFlags, "merged-source-text"]);
    }
    if (uncertainSources.length) {
      line.reviewFlags = unique([...line.reviewFlags, "low-ocr-confidence"]);
      line.confidence = Math.min(line.confidence, ...uncertainSources);
    }
    line.sourceOrder = index + 1;
    line.chapterInformation = Boolean(chapter && line.sourcePage === chapter.sourcePage
      && line.reviewFlags.includes("project-information") && !line.unit && line.quantity === undefined);
  }
  attachNumberedChapters(materialLines, numberedChapters);
  const pageChecks = reconcilePageQuantities(pages, materialLines, warnings);
  appendMaterialLineValidationWarnings(materialLines, warnings);
  const standards = unique(
    pages.flatMap((page) =>
      [...page.text.matchAll(STANDARD_PATTERN)].map((match) =>
        normalizeStandard(match[1])
      )
    )
  );
  const ruleHints = extractRuleHints(pages);
  const extractionMethod = getExtractionMethod(pages);

  for (const page of pages) {
    if (page.priceColumns?.status === "review") {
      warnings.push({ id: `price-columns-${page.pageNumber}`, code: "PDF_PRICE_COLUMNS_UNVERIFIED",
        message: `Sida ${page.pageNumber}: pris- och summaceller kunde inte skiljas från all kravtext med säkerhet. Osäkert innehåll har bevarats; kontrollera original-PDF:n.`,
        sourcePage: page.pageNumber, severity: "warning" });
    }
    if (page.postTable?.quantityColumnsUnrecognized) {
      warnings.push({
        id: `quantity-columns-${page.pageNumber}`,
        code: "PDF_QUANTITY_COLUMNS_UNRECOGNIZED",
        message: `Sida ${page.pageNumber}: kolumnerna för enhet och mängd kunde inte identifieras säkert. Kontrollera mängderna i original-PDF:n.`,
        sourcePage: page.pageNumber,
        severity: "warning"
      });
    }
    if (page.annotations?.length) {
      const comments = page.annotations.map((annotation, index) =>
        `${index + 1}. ${annotation.text}`
      ).join("\n");
      warnings.push({
        id: `pdf-comments-${page.pageNumber}`,
        code: "PDF_COMMENTS_REQUIRE_REVIEW",
        message: `PDF-kommentarer på sida ${page.pageNumber} behöver granskas separat från specifikationen: ${comments}`,
        sourcePage: page.pageNumber,
        sourceText: comments,
        severity: "warning"
      });
    }
    if (page.annotationReadFailed) {
      warnings.push({
        id: `pdf-comments-failed-${page.pageNumber}`,
        code: "PDF_COMMENTS_READ_FAILED",
        message: `PDF-kommentarerna på sida ${page.pageNumber} kunde inte läsas. Kontrollera dem i original-PDF:n.`,
        sourcePage: page.pageNumber,
        severity: "warning"
      });
    }
    if (page.status !== "failed" && page.status !== "partial") continue;
    warnings.push({
      id: `incomplete-page-${page.pageNumber}`,
      code: "PAGE_EXTRACTION_INCOMPLETE",
      message: `Sida ${page.pageNumber} kunde inte läsas fullständigt. Kontrollera original-PDF:n; materialposter eller krav kan saknas.`,
      sourcePage: page.pageNumber,
      severity: "warning"
    });
  }

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
    (line) => line.quantity === undefined && line.operation !== "remove" && line.reviewFlags.includes("missing-quantity")
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
    structure: { version: documentStructure.version, fileName: documentStructure.fileName,
      pageCount: documentStructure.pageCount, chapters: documentStructure.chapters },
    pageChecks,
    postChecks,
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

function appendMaterialLineValidationWarnings(
  lines: TechnicalDescriptionMaterialLine[],
  warnings: TechnicalDescriptionWarning[]
) {
  for (const line of lines) {
    const conflict = conflictingMaterialRequirement(line.attributes, line.technicalSpecification ?? line.sourceText);
    if (conflict) {
      line.reviewFlags.push("conflicting-material-requirement");
      warnings.push({ id: `material-conflict-${line.id}`, code: "CONFLICTING_MATERIAL_REQUIREMENT", message: conflict,
        sourcePage: line.sourcePage, sourceText: line.sourceText, severity: "warning" });
    }
    if (line.reviewFlags.includes("inferred-parent-context")) warnings.push({ id: `parent-context-${line.id}`, code: "INFERRED_PARENT_CONTEXT",
      message: `Post ${line.postNumber} har avvikande numrering. Gemensamma rörkrav har preliminärt kopplats från ${line.parentPostNumber}; kontrollera original-PDF:n.`,
      sourcePage: line.sourcePage, sourceText: line.sourceText, severity: "warning" });
    if (line.category !== "sprinkler_head" || !hasSprinklerHeadEvidence({ value_text: line.description, value_json: line })) continue;
    const kFactor = numericAttributeValue(line.attributes, "k-faktor");
    if (kFactor === null || kFactor <= MAX_SUPPORTED_SPRINKLER_K_FACTOR) continue;

    if (!line.reviewFlags.includes("implausible-k-factor")) {
      line.reviewFlags.push("implausible-k-factor");
    }
    warnings.push({
      id: `implausible-k-factor-${line.sourcePage}-${line.postNumber ?? line.id}`,
      code: "IMPLAUSIBLE_K_FACTOR",
      message: `PDF-post ${line.postNumber ?? line.description} anger K-faktor ${formatValidationNumber(kFactor)}, vilket är över ${MAX_SUPPORTED_SPRINKLER_K_FACTOR}. Kontrollera värdet i original-PDF:n innan en produkt väljs.`,
      sourcePage: line.sourcePage,
      sourceText: line.sourceText,
      severity: "warning"
    });
  }
}

function numericAttributeValue(
  attributes: Record<string, string>,
  expectedKey: string
) {
  const value = Object.entries(attributes).find(
    ([key]) => normalizeAttributeKey(key) === expectedKey
  )?.[1];
  return parseSprinklerKFactor(value);
}

function formatValidationNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
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
  const legacyLines = extractLegacyMaterialLines(pages.filter(page => !page.postTable), legacyWarnings);

  const retained = legacyLines.filter(line => (!structuredLines.length
    || (line.postNumber && !line.reviewFlags.includes("inferred-post-number"))) && !structuredLines.some(item =>
    (item.sourcePages ?? [item.sourcePage]).includes(line.sourcePage) && (
      item.postNumber === line.postNumber
      || (line.postNumber && item.postNumber?.startsWith(`${line.postNumber}.`))
      || (line.postNumber && item.postNumber?.startsWith(line.postNumber) && item.nsCode === line.nsCode
        && (line.quantity === undefined || item.quantity === line.quantity))
      || item.sourceText.replace(/\s+/g, " ").includes(line.sourceText.replace(/\s+/g, " "))
    )));
  for (const line of retained) {
    line.reviewFlags = unique([...line.reviewFlags, "fallback-source-post",
      ...(line.quantity === undefined ? ["project-information"] : [])]);
  }
  const merged = [...structuredLines, ...retained].sort((a, b) => a.sourcePage - b.sourcePage
    || (a.postNumber ?? "").localeCompare(b.postNumber ?? "", "nb", { numeric: true }));
  warnings.push(...structuredExtractionWarnings(merged));
  return merged;
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

function extractLegacyMaterialLines(
  pages: TechnicalDescriptionPage[],
  warnings: TechnicalDescriptionWarning[]
) {
  const lines: TechnicalDescriptionMaterialLine[] = [];
  let previousPostNumber: string | undefined;
  const knownPostNumbers = pages.flatMap((page) =>
    [...page.text.matchAll(/\b\d{2}\.\d{3}(?:\.\d+)*\b/g)].map(
      (match) => match[0]
    )
  );

  for (const page of pages) {
    if (isNonMaterialReferencePage(page.text)) continue;
    const pageLines = normalizedPageLines(page.text);
    let current: ParsedBlock | undefined;
    let pendingPostNumber: string | undefined;

    const flush = () => {
      if (!current) return;
      const measured = findTableQuantity(normalizedPageLines(current.lines.join("\n")));
      if (measured) {
        current.quantity = measured.quantity;
        current.quantityText = measured.text;
        current.unit = measured.unit;
      }
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
      if (attributeMatch) {
        const key = normalizeAttributeKey(attributeMatch[1]);
        current.attributes[key] = normalizeAttributeValue(key, attributeMatch[2]);
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

function postBelongsToChapter(postNumber: string | undefined, title: string) {
  const parts = title.match(/^(\d{3,6})\s+[A-ZÆØÅ][\wÆØÅæøå-]*\s+[-–—]\s+(\d+(?:\.\d+)*)\s/);
  return Boolean(parts && parts[2].includes(".") && postNumber?.startsWith(`${parts[1]}.${parts[2]}.`));
}

function extractNs3420TableLines(pages: TechnicalDescriptionPage[]) {
  const materialLines: TechnicalDescriptionMaterialLine[] = [];
  const chapters = pdfChaptersByPage(pages);
  const projectHeading = extractProject(pages).name?.replace(/\s+/g, " ").trim();
  const occurrences = new Map<string, number>();
  const parentContexts = new Map<string, TableParentContext>();
  const prepared = recoverMissingStructuredPostNumbers(
    pages.map((page) => page.method === "ocr"
      ? recoverDisplacedOcrPostNumbers(normalizedPageLines(page.text))
      : normalizedPageLines(page.text))
  );
  let previousMaterialLine: TechnicalDescriptionMaterialLine | undefined;
  let previousContext: TableParentContext | undefined;
  let pipeSection: { number: string; sourcePage: number; text: string } | undefined;
  let postScope = "";
  let chapterTitle: string | undefined;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (isNonMaterialReferencePage(page.text)) {
      previousContext = undefined;
      previousMaterialLine = undefined;
      continue;
    }
    if (!page.postTable && pages[pageIndex - 1]?.postTable) {
      previousContext = undefined;
      previousMaterialLine = undefined;
    }
    const pageLines = page.postTable ? normalizedPageLines(page.postTable.text) : prepared.pageLines[pageIndex];
    const nextChapterTitle = chapters.get(page.pageNumber)?.title;
    if (chapterTitle && nextChapterTitle && nextChapterTitle !== chapterTitle
      && !postBelongsToChapter(previousContext?.postNumber ?? previousMaterialLine?.postNumber, nextChapterTitle)) {
      parentContexts.clear();
      previousContext = undefined;
      previousMaterialLine = undefined;
      pipeSection = undefined;
    }
    if (nextChapterTitle) chapterTitle = nextChapterTitle;
    const scope = extractPostScope(pageLines);
    if (scope && scope !== postScope) {
      parentContexts.clear();
      previousContext = undefined;
      previousMaterialLine = undefined;
      pipeSection = undefined;
      postScope = scope;
    }
    const chapterPost = extractChapterPost(pageLines);

    const starts: StructuredPostStart[] = page.postTable
      ? page.postTable.posts.map(post => ({ ...post, consumedLineCount: 1 })) : [];
    for (let index = 0; !page.postTable && index < pageLines.length; index += 1) {
      const start = parseStructuredPostStart(pageLines, index);
      if (!start) continue;
      starts.push(start);
      index += start.consumedLineCount - 1;
    }

    const sectionIndex = pageLines.findIndex(line => /^\d{4}\s+Ledningsnett\b/i.test(line));
    if (sectionIndex >= 0) {
      pipeSection = { number: pageLines[sectionIndex].split(" ")[0], sourcePage: page.pageNumber,
        text: pageLines.slice(sectionIndex, starts[0]?.lineIndex ?? footerIndex(pageLines, sectionIndex)).join("\n") };
    } else if (pipeSection && page.pageNumber === pipeSection.sourcePage + 1) {
      const headingEnd = pageLines.findIndex(line => /^Postnr\./i.test(line));
      // Only a visual header at the start of the page bounds a continuation.
      const firstStart = starts[0]?.lineIndex ?? footerIndex(pageLines, -1);
      const contentStart = headingEnd >= 0 && headingEnd < firstStart ? headingEnd + 1 : 0;
      pipeSection.text += `\n${pageLines.slice(contentStart, firstStart)
        .filter(line => !/^(?:Prosjekt:|Kapittel:|Postnr\.)/i.test(line)).join("\n")}`;
    }

    const attachedContinuation = mergeLeadingPageContinuation({
      page,
      pageLines,
      projectHeading,
      firstStartIndex: starts[0]?.lineIndex,
      previousMaterialLine,
      previousContext
    });
    if (!attachedContinuation) {
      const leading = leadingPageBody(pageLines, starts[0]?.lineIndex, projectHeading);
      // A fragment from a page omitted from this file has no trustworthy post
      // number or quantity. Preserve it without assigning it to the next post.
      if (leading.length && !(leading.length === 1 && leading[0] === chapterTitle) && !leading.some(line => NS3420_CODE_PATTERN.test(line))
        && (pageLines.some(line => /^Postnr(?:[.:]|\s|$)/i.test(line)) || Boolean(chapterTitle))
        && (leading.some(isTechnicalContinuationLine) || (leading.some(line => /[\p{L}]{2}/u.test(line)) && pageLines.some(line => /^Postnr(?:[.:]|\s|$)/i.test(line))) || (leading.length > 1 && leading.join(" ").length > 80)
          || (chapters.get(page.pageNumber)?.sourcePage === page.pageNumber
            && leading[0] !== chapterTitle && /^\d+\s+\S/.test(leading[0])
            && Boolean(chapterTitle?.toLocaleLowerCase("nb-NO").replace(/[-–—]/g, "").replace(/\s+/g, " ")
              .endsWith(leading[0].toLocaleLowerCase("nb-NO").replace(/[-–—]/g, "").replace(/\s+/g, " ")))))) {
        const sourceText = leading.join("\n");
        const attributes = extractTableAttributes(leading);
        const comments = (page.annotations ?? []).filter(comment => comment.continuesPreviousPost);
        if (comments.length) attributes["pdf-kommentar"] = comments.map(comment => comment.text).join("\n\n");
        const information: TechnicalDescriptionMaterialLine = {
          id: `technical-information-${page.pageNumber}`, postScope: postScope || undefined,
          category: "other", operation: "unknown", description: leading[0],
          attributes: { ...(chapterPost ? { kapittelpost: chapterPost } : {}), ...attributes },
          standardRefs: unique([...sourceText.matchAll(STANDARD_PATTERN)].map(match => normalizeStandard(match[1]))),
          sourcePage: page.pageNumber, sourcePages: [page.pageNumber], sourceText,
          technicalSpecification: sourceText, confidence: page.confidence,
          reviewFlags: ["project-information"]
        };
        materialLines.push(information);
        previousMaterialLine = information;
        previousContext = undefined;
      }
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
        ...pageLines.slice(bodyStart, blockEnd).filter(line => page.postTable || !isPageFurniture(line))
      ];
      const quantity = page.postTable ? start.quantity : start.quantity ?? findTableQuantity(blockLines);
      const fullPostNumber = start.postNumber;
      const key = `${postScope}|${fullPostNumber}`;
      const existing = materialLines.find(line => line.postScope === (postScope || undefined) && line.postNumber === fullPostNumber);
      if (existing && existing === previousMaterialLine && startIndex === 0
        && (existing.sourcePages?.at(-1) ?? existing.sourcePage) === page.pageNumber - 1
        && !(existing.quantity !== undefined && quantity)
        && isRepeatedPostContinuation(start.description, blockLines, existing)) {
        const context = parentContexts.get(fullPostNumber);
        appendPostContinuation(page, blockLines, existing, context);
        previousMaterialLine = existing;
        previousContext = context;
        continue;
      }
      const descriptionParts = page.postTable && quantity
        ? blockLines.slice(0, quantity.lineIndex - start.lineIndex)
        : start.quantity
        ? blockLines
        : quantity
          ? blockLines.slice(0, quantity.lineIndex)
          : blockLines;
      if (!start.quantity && quantity?.descriptionPrefix) {
        descriptionParts.push(quantity.descriptionPrefix);
      }
      const parsedDescription = tableDescription(page.postTable && /^[A-Z]{3}$/.test(start.description) ? descriptionParts.slice(1) : descriptionParts, page.headingLayout);
      const nsCode = parsedDescription.nsCode ?? (page.postTable && /^[A-Z]{3}$/.test(start.description) ? start.description : undefined);
      const description = parsedDescription.description
        || (start.description && !NS3420_CODE_PATTERN.test(start.description) ? start.description.trim().replace(/:$/, "") : "");
      const sourceText = pageLines.slice(start.lineIndex, blockEnd).filter(line => page.postTable || !isPageFurniture(line)).join("\n");
      const ownAttributes: Record<string, string> = {
        ...(chapterPost ? { kapittelpost: chapterPost } : {}),
        ...extractTableAttributes(blockLines),
        ...extractInlineAttributes(descriptionParts.join(" "))
      };
      const comments = (page.annotations ?? []).filter(comment => comment.postNumber === fullPostNumber);
      if (comments.length) ownAttributes["pdf-kommentar"] = comments.map(comment => comment.text).join("\n\n");
      const ownStandardRefs = unique(
        [...sourceText.matchAll(STANDARD_PATTERN)].map((match) =>
          normalizeStandard(match[1])
        )
      );
      const numberedParent = findTableParent(parentContexts, fullPostNumber);
      const adjacentPipeParent = !numberedParent && quantity?.unit === "m"
        && /^DN\s*\d+\s+komplett med deler\b/i.test(description)
        ? [...parentContexts.values()].reverse().find(context => context.sourcePage === page.pageNumber
          && context.category === "pipe" && context.isSpecification
          && context.postNumber.split(".").slice(0, -1).join(".") === fullPostNumber.split(".").slice(0, -2).join("."))
        : undefined;
      const parent = numberedParent ?? adjacentPipeParent;
      const dimensionOnly = /^(?:Dimensjon\s*:\s*)?DN\s*\d+\b/i.test(description || String(ownAttributes.dimensjon ?? ""));
      const missingParent = !parent?.nsCode && !nsCode && dimensionOnly
        && !Object.keys(ownAttributes).some(key => /^(?:materiale|skjøt|type sprinkler|type ventil)$/i.test(key));
      const effectiveNsCode = nsCode ?? parent?.nsCode;
      const classifiedCategory = productExtractionCategory({ value_text: description,
        value_json: { nsCode: effectiveNsCode, unit: quantity?.unit, attributes: ownAttributes } });
      const ownCategory = classifiedCategory !== "unknown" ? classifiedCategory : inferStructuredCategory(description, sourceText);
      const inheritedCategory = parent?.category === "unknown"
        ? inferCategory(parent.sourceText.toLocaleLowerCase())
        : parent?.category;
      const category = missingParent && quantity?.unit === "m" ? "pipe" : resolveStructuredCategory(ownCategory, inheritedCategory, description);
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
          sourcePages: [page.pageNumber],
          description,
          nsCode: effectiveNsCode,
          category,
          isSpecification: !quantity || quantity.unit === "RS",
          attributes: {
            ...(parent?.attributes ?? {}),
            ...ownAttributes
          },
          attributeSources: {
            ...(parent?.attributeSources ?? {}),
            ...Object.fromEntries(Object.keys(ownAttributes).map(key => [key, { postNumber: fullPostNumber, sourcePage: page.pageNumber }]))
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
      const hasMissingQuantityMarker = new RegExp(`^${STRUCTURED_POST_SOURCE}$`, "i").test(fullPostNumber)
        && blockLines.some(line => new RegExp(
        String.raw`^(?:Antall|Lengde)(?:\s+${QUANTITY_UNIT_SOURCE}\.?)?\s*$`, "i"
      ).test(line.trim()));
      // Identity and source position determine inclusion, never amount or title length.
      // Repeated identifiers remain separate occurrences unless a continuation was proven above.
      const occurrence = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, occurrence);
      const attributes: Record<string, string> = {
        ...(parent?.attributes ?? {}),
        ...ownAttributes
      };
      if (pipeSection && fullPostNumber.includes(`.${pipeSection.number}.`)
        && (category === "pipe" || category === "fitting")) {
        attributes["generelle krav"] = `PDF side ${pipeSection.sourcePage}:\n${pipeSection.text}`;
      }
      if (parent?.attributes["pdf-kommentar"] && ownAttributes["pdf-kommentar"]) {
        attributes["pdf-kommentar"] = `${parent.attributes["pdf-kommentar"]}\n\n${ownAttributes["pdf-kommentar"]}`;
      }
      const reviewFlags: string[] = [];
      if (!description && !nsCode && !Object.keys(ownAttributes).some(key => key !== "kapittelpost")) reviewFlags.push("empty-post-body");
      if (quantity && quantity.quantity < 0) reviewFlags.push("invalid-source-quantity");
      if (occurrence > 1) {
        reviewFlags.push("duplicate-post-number");
        for (const earlier of materialLines.filter(line => line.postScope === (postScope || undefined) && line.postNumber === fullPostNumber)) {
          earlier.reviewFlags = unique([...earlier.reviewFlags, "duplicate-post-number"]);
        }
      }
      if (!quantity || quantity.unit === "?") reviewFlags.push("project-information");
      if (missingParent) reviewFlags.push("missing-parent-context");
      if (adjacentPipeParent) reviewFlags.push("inferred-parent-context");
      if (category === "unknown") reviewFlags.push("unknown-category");
      if (page.method === "ocr") reviewFlags.push("ocr-source");
      if (quantity?.unit === "?") reviewFlags.push("missing-unit");
      if (page.method === "ocr" && page.confidence < 0.7) reviewFlags.push("low-ocr-confidence");
      if (prepared.inferredPostNumbers.has(fullPostNumber)) {
        reviewFlags.push("inferred-post-number");
      }
      if (!quantity && operation !== "remove" && !start.chapter && (hasMissingQuantityMarker || nsCode || (page.postTable && category !== "unknown"))) reviewFlags.push("missing-quantity");
      if (
        category === "pipe"
        && quantity
        && quantity.unit !== "m"
        && !/slange|hose/i.test(`${description}\n${sourceText}`)
      ) {
        reviewFlags.push("pipe-unit-not-length");
      }

      const materialLine: TechnicalDescriptionMaterialLine = {
        id: `technical-material-${page.pageNumber}-${fullPostNumber.replace(/[^a-zA-Z0-9]+/g, "-")}${occurrence > 1 ? `-${occurrence}` : ""}`,
        postNumber: fullPostNumber,
        parentPostNumber: parent?.postNumber,
        parentDescription: parent?.description,
        postScope: postScope || undefined,
        nsCode: effectiveNsCode,
        category,
        description: description
          || (attributes.dimensjon ? `Dimensjon: ${attributes.dimensjon}` : categoryLabel(category)),
        operation,
        quantity: quantity?.quantity,
        quantityText: quantity?.text,
        quantitySourcePage: quantity ? page.pageNumber : undefined,
        unit: quantity?.unit,
        attributes,
        attributeSources: {
          ...(parent?.attributeSources ?? {}),
          ...Object.fromEntries(Object.keys(ownAttributes).map(key => [key, { postNumber: fullPostNumber, sourcePage: page.pageNumber }]))
        },
        system: inferSystem(normalizedText) ?? parent?.system,
        standardRefs: unique([
          ...(parent?.standardRefs ?? []),
          ...ownStandardRefs
        ]),
        technicalSpecification: parent
          ? `${parent.sourceText}\n\nUNDERPOST\n${sourceText}`
          : sourceText,
        sourcePage: page.pageNumber,
        sourcePages: [page.pageNumber],
        sourceText,
        confidence: Math.min(
          0.99,
          Math.max(
            page.method === "ocr" ? 0 : 0.45,
            page.confidence -
              (category === "unknown" ? 0.12 : 0) -
              (page.method === "ocr" ? 0.04 : 0)
          )
        ),
        reviewFlags
      };
      materialLines.push(materialLine);
      previousMaterialLine = materialLine;
    }
  }

  // Keep unquantified parents as project information as well as preserving
  // their shared requirements on the measured children.
  for (const line of materialLines) {
    if (line.quantity === undefined && line.postNumber && materialLines.some(child =>
      child.quantity !== undefined && child.postScope === line.postScope && child.postNumber?.startsWith(`${line.postNumber}.`))) {
      line.reviewFlags = line.reviewFlags.filter(flag => flag !== "missing-quantity");
    }
  }
  return materialLines;
}

function mergeLeadingPageContinuation({
  page,
  pageLines,
  projectHeading,
  firstStartIndex,
  previousMaterialLine,
  previousContext
}: {
  page: TechnicalDescriptionPage;
  pageLines: string[];
  projectHeading?: string;
  firstStartIndex?: number;
  previousMaterialLine?: TechnicalDescriptionMaterialLine;
  previousContext?: TableParentContext;
}) {
  if (!previousMaterialLine && !previousContext) return;
  const chapter = extractChapterPost(pageLines);
  const previousChapter = previousContext?.attributes.kapittelpost ?? previousMaterialLine?.attributes.kapittelpost;
  // Headers may be at the end of extracted page text. Check the whole page
  // before attaching leading prose to the last quantified post. Orientation
  // pages may identify their chapter only through a page label such as 33-1.
  const chapterNumber = chapter?.match(/^\d+/)?.[0]
    ?? pageLines.map(line => line.match(/\bSide\s+(\d{2,6})-\d+\b/i)?.[1]).find(Boolean);
  const previousChapterNumber = previousChapter?.match(/^\d+/)?.[0];
  if (chapterNumber && previousChapterNumber && Number(chapterNumber) !== Number(previousChapterNumber)) return;
  const lastPage = previousContext?.sourcePages.at(-1)
    ?? previousMaterialLine?.sourcePages?.at(-1) ?? previousMaterialLine?.sourcePage;
  if (lastPage !== page.pageNumber - 1) return;
  const continuation = page.postTable ? pageLines.slice(0, firstStartIndex ?? pageLines.length)
    : leadingPageBody(pageLines, firstStartIndex, projectHeading);
  if (continuation.length === 0) return;
  // An unplaced NS row is a new post, never an extension of the previous one.
  // OCR recovery or manual review must establish its identity first.
  const precedingText = previousContext?.sourceText ?? previousMaterialLine?.sourceText ?? "";
  const environmentalSpecification = /NEK\s*400|ytre påvirkninger|Tabell\s+51A/i.test(`${precedingText}\n${continuation.join("\n")}`);
  if (!page.postTable && continuation.some(line => NS3420_CODE_PATTERN.test(line)
    // Wrapped environmental classifications (for example "AE4 - Lett støv")
    // are prose within the open NEK 400 specification, not new NS 3420 rows.
    && !(environmentalSpecification && /^(?:A[A-HK-NP-S]|B[A-E]|C[AB])\d\s*[-–—]\s*\S/i.test(line)))) return;
  // Prose and captions before the next post belong to the still-open row too.
  // Never infer a continuation through an unrelated chapter/orientation page.
  if (!page.postTable && !pageLines.some(line => /^Postnr(?:[.:]|\s|$)/i.test(line)) && firstStartIndex === undefined && !continuation.some(isTechnicalContinuationLine)
    && (!previousContext?.nsCode || /^(?:\d+\s+|[A-ZÆØÅ -]{12,}$)/.test(continuation[0]))) return;
  appendPostContinuation(page, continuation,
    !previousContext || previousMaterialLine?.postNumber === previousContext.postNumber ? previousMaterialLine : undefined,
    previousContext, true);
  return true;
}

/** A repeated number alone never proves a continuation. A new heading,
 * quantity or contradictory own field keeps a separate occurrence. */
function isRepeatedPostContinuation(description: string, body: string[], previous: TechnicalDescriptionMaterialLine) {
  const first = description || body.find(line => line.trim()) || "";
  const explicit = /^(?:fortsettelse|forts[.:]|fortsättning|continued)\b/i.test(first);
  const field = isTechnicalContinuationLine(first) || Boolean(findTableQuantity([first]));
  if (!explicit && !field) return false;
  if (NS3420_CODE_PATTERN.test(first)) return false;
  const attributes = extractTableAttributes(body);
  for (const [key, value] of Object.entries(attributes)) {
    const prior = previous.attributes[key];
    if (prior && prior.replace(/\s+/g, " ").trim() !== value.replace(/\s+/g, " ").trim()) return false;
  }
  return true;
}

function leadingPageBody(pageLines: string[], firstStartIndex?: number, projectHeading?: string) {
  const leading = pageLines.slice(0, firstStartIndex ?? pageLines.length);
  // OCR can put the project title and page number on separate lines. Only
  // discard the known title beside a page marker, never mentions in the body.
  const candidateHeader = leading.findIndex(line => /^Postnr(?:[.:]|\s|$)/i.test(line));
  const isHeaderLine = (line: string, index: number) => isPageFurniture(line)
    // Restrict consultant/date removal to the prefix before a table header;
    // the same company name inside the specification is still source text.
    || (index < candidateHeader && isPdfConsultantDateHeader(line))
    || (projectHeading && line.toLocaleLowerCase() === projectHeading.toLocaleLowerCase()
      && /^Side\s+\d/i.test(leading[index + 1] ?? ""));
  const headerIndex = candidateHeader >= 0 && leading.slice(0, candidateHeader).every(isHeaderLine) ? candidateHeader : -1;
  const bodyStart = headerIndex >= 0 ? headerIndex + 1 : 0;
  const body = leading.slice(bodyStart);
  return body.slice(0, footerIndex(body, -1)).filter((line, index) => !isHeaderLine(line, bodyStart + index));
}

function isPageFurniture(line: string) {
  return /^(?:Prosjekt:|Kapittel:|Postnr(?:[.:]|\s|$)|Kopi-|NS[-\s]*(?:3420\s*)?(?:kode|Spesifikasjon)|Enh\.?$|Enhet$|Mengde$|Enhetspris$|Pris$|Sum$|Side\s+\d|Multiconsult\b)/i.test(line)
    || /^\d{1,2}\.\d{1,2}\.(?:19|20)\d{2}$/.test(line)
    || /\bSide\s+\d+(?:-\d+)?\s*$/i.test(line)
    || /^\d{2}\s+(?:VVS|Brannslokking|Sanitær)\b/i.test(line);
}

function appendPostContinuation(page: TechnicalDescriptionPage, continuation: string[], line?: TechnicalDescriptionMaterialLine, context?: TableParentContext, leading = false) {
  const body = continuation.filter(part => page.postTable || !isPageFurniture(part));
  if (!body.length) return;
  const text = body.join("\n");
  const postNumber = context?.postNumber ?? line?.postNumber;
  const comments = (page.annotations ?? []).filter(comment => comment.postNumber === postNumber
    || (leading && comment.continuesPreviousPost));
  for (const target of [context, line]) {
    if (!target) continue;
    // Reparse the full text so an attribute sentence broken between pages is
    // joined rather than losing the words before the next attribute label.
    const combined = `${target.sourceText}\n\nFORTSETTELSE SIDE ${page.pageNumber}\n${text}`
      .replace(/([^\n]*)\n+FORTSETTELSE SIDE \d+\n([^\n]*)/g, (_match, previous: string, next: string) =>
        previous && !/[.!?:;]$/.test(previous) && !isTechnicalContinuationLine(next) && !findTableQuantity([next])
          ? `${previous} ${next}` : `${previous}\n${next}`);
    const attributes = extractTableAttributes(combined.split("\n"));
    for (const [key, value] of Object.entries(attributes)) {
      if (target.attributes[key] !== value) {
        target.attributes[key] = value;
        if (postNumber) target.attributeSources = { ...target.attributeSources, [key]: { postNumber, sourcePage: page.pageNumber } };
      }
    }
    if (comments.length) target.attributes["pdf-kommentar"] = [target.attributes["pdf-kommentar"], ...comments.map(comment => comment.text)].filter(Boolean).join("\n\n");
    target.standardRefs = unique([...target.standardRefs, ...[...text.matchAll(STANDARD_PATTERN)].map(match => normalizeStandard(match[1]))]);
    target.sourceText += `\n\nFORTSETTELSE SIDE ${page.pageNumber}\n${text}`;
    target.sourcePages = [...new Set([...(target.sourcePages ?? [target.sourcePage]), page.pageNumber])];
  }
  if (line) {
    line.technicalSpecification = context?.sourceText ?? line.sourceText;
    if (line.quantity === undefined) {
      const quantity = page.postTable ? page.postTable.quantities.find(quantity => quantity.lineIndex < (page.postTable!.posts[0]?.lineIndex ?? Infinity)) : findTableQuantity(body);
      if (quantity) {
        line.quantity = quantity.quantity; line.unit = quantity.unit; line.quantityText = quantity.text;
        line.quantitySourcePage = page.pageNumber;
        line.reviewFlags = line.reviewFlags.filter(flag => flag !== "missing-quantity");
      }
    }
    if (line.quantity !== undefined && line.unit && line.unit !== "?") {
      line.reviewFlags = line.reviewFlags.filter(flag => flag !== "project-information");
    }
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

function findTableParent(
  contexts: Map<string, TableParentContext>,
  postNumber: string
) {
  return [...contexts.values()]
    .filter((context) => postNumber.startsWith(`${context.postNumber}.`))
    .sort((left, right) => right.postNumber.length - left.postNumber.length)[0];
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
  sourcePages: number[];
  description: string;
  nsCode?: string;
  category: TechnicalDescriptionCategory;
  isSpecification?: boolean;
  attributes: Record<string, string>;
  attributeSources: NonNullable<TechnicalDescriptionMaterialLine["attributeSources"]>;
  system?: string;
  standardRefs: string[];
  sourceText: string;
};

function reconcilePageQuantities(pages: TechnicalDescriptionPage[], lines: TechnicalDescriptionMaterialLine[], warnings: TechnicalDescriptionWarning[]) {
  return pages.filter(page => !isNonMaterialReferencePage(page.text)).flatMap(page => {
    const pageLines = normalizedPageLines(page.text);
    // "Rund sum" in the measurement rules repeats the RS table cell; it is
    // not a second quantity. Also count rows whose unit precedes the post.
    const observed = page.postTable ? page.postTable.quantities.length : pageLines.filter((text, index) => !/^Rund\s+sum\s*$/i.test(text)
      && (parseStructuredPostStart(pageLines, index)?.quantity?.quantity ?? findTableQuantity([text])?.quantity ?? 0) > 0).length;
    const extracted = lines.filter(line => line.sourcePage === page.pageNumber);
    if (!observed && !extracted.length) return [];
    const quantified = lines.filter(line => line.quantity !== undefined
      && (line.quantitySourcePage ?? line.sourcePage) === page.pageNumber).length;
    const unresolved = Math.max(0, observed - quantified);
    if (unresolved) {
      for (const line of extracted) line.reviewFlags = unique([...line.reviewFlags, "unresolved-source-quantity"]);
      warnings.push({
      id: `page-quantity-check-${page.pageNumber}`, code: "UNRESOLVED_QUANTITY_ROWS", sourcePage: page.pageNumber,
      message: `Sida ${page.pageNumber}: ${observed} mängdrader identifierades men ${quantified} poster med mängd skapades. Kontrollera de ${unresolved} återstående raderna i PDF-filen.`, severity: "warning"
      });
    }
    const kinds = extracted.map(line => distributorRequirementKind({ id: line.id, category: line.category, value_text: line.description, source_excerpt: line.sourceText, value_json: line }));
    return [{ sourcePage: page.pageNumber, observedQuantityRows: observed, extractedQuantityRows: quantified,
      productRows: kinds.filter(kind => kind === "product").length, workRows: kinds.filter(kind => kind === "work").length,
      removalRows: kinds.filter(kind => kind === "remove").length, unresolvedQuantityRows: unresolved }];
  });
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
  const category = productExtractionCategory({ value_text: block.title || sourceText,
    value_json: { nsCode: block.nsCode, unit: block.unit, attributes: block.attributes } });
  const description =
    block.title.trim() ||
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
    quantitySourcePage: block.quantity !== undefined ? page.pageNumber : undefined,
    unit: block.unit,
    attributes: block.attributes,
    system: block.attributes.system ?? block.attributes.systemtype ?? block.attributes.anleggstype ?? block.attributes.sprinkleranlegg,
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
    if (!hasSprinklerText(page.text)) continue;
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
  return productExtractionCategory({ value_text: text });
}

function inferStructuredCategory(description: string, sourceText: string) {
  if (isManifoldCabinetProduct(description)) return "other";
  const descriptionCategory = inferCategory(description.toLocaleLowerCase());
  if (descriptionCategory !== "unknown") return descriptionCategory;
  const sourceCategory = inferCategory(sourceText.toLocaleLowerCase());
  if (sourceCategory === "sprinkler_head" && !hasSprinklerHeadEvidence({ value_text: description, value_json: { sourceText } })) return "unknown";
  if (sourceCategory === "sprinkler_hose" && !hasSprinklerContext({ value_text: description, value_json: { sourceText } })) return "unknown";
  return sourceCategory;
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
    && inferCategory(description.toLocaleLowerCase()) !== "fitting"
    && !/ventil|sprinkler|slange|hose|h[åa]ndsl[ou]kker|bend|kobling|kupling/i.test(description)
  ) {
    return "pipe";
  }
  return ownCategory;
}

function inferOperation(text: string, hasQuantity: boolean) {
  const affirmative = text.replace(/\b(?:skal\s+ikke|ikke|skal\s+inte|inte|not)\s+(?:(?:bli|blive|vara|være|be)\s+)?(?:demonter\w*|fjern\w*|frakobl\w*|riv\w*)/g, "");
  if (/demontering|demontere|frakobling|fjerne|riving/.test(affirmative)) {
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
    sprinkler_hose: "Sprinklerslange",
    pipe: "Rør",
    fitting: "Fitting",
    valve: "Ventil",
    support: "Oppheng",
    control: "Kontrollutstyr",
    other: "Annet utstyr",
    unknown: "Teknisk materiallinje"
  }[category];
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
