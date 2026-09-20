import { extractTechnicalDescriptionFromPages } from "@/modules/technical-description-extractor/extractor";
import type {
  TechnicalDescriptionMaterialLine,
  TechnicalDescriptionPage
} from "@/modules/technical-description-extractor/types";
import { projectRequirementDetails } from "@/lib/project-requirement-details";

type Row = Record<string, unknown> & { id: string };

export function enrichProjectRequirements(
  requirements: Row[],
  technicalDescriptions: Row[]
) {
  const requiredDocumentIds = new Set(
    requirements.flatMap((requirement) => {
      const documentId = stringValue(
        requirement.source_technical_description_document_id
      );
      return documentId ? [documentId] : [];
    })
  );
  const linesByDocument = new Map<string, TechnicalDescriptionMaterialLine[]>();

  for (const document of technicalDescriptions) {
    if (!requiredDocumentIds.has(document.id)) continue;
    const pages = technicalDescriptionPages(document.source_pages);
    if (!pages.length) continue;
    linesByDocument.set(
      document.id,
      extractTechnicalDescriptionFromPages(pages, {
        fileName: stringValue(document.file_name) ?? undefined
      }).materialLines
    );
  }

  return requirements.map((requirement) => {
    const documentId = stringValue(
      requirement.source_technical_description_document_id
    );
    const lines = documentId ? linesByDocument.get(documentId) : undefined;
    if (!lines?.length) return requirement;

    const details = projectRequirementDetails(requirement);
    const description = normalized(stringValue(requirement.value_text));
    const sourcePage = numberValue(requirement.source_page);
    const currentValue = record(requirement.value_json);
    const matchingPosts = details.postNumber ? lines.filter(candidate => candidate.postNumber === details.postNumber
      && (!currentValue.postScope || candidate.postScope === currentValue.postScope)) : [];
    const matchingDescriptions = lines.filter(candidate => candidate.sourcePage === sourcePage
      && normalized(candidate.description) === description
      && (currentValue.quantity == null || candidate.quantity === numberValue(currentValue.quantity)));
    const line =
      matchingPosts.find(candidate => candidate.sourcePage === sourcePage) ??
      (matchingDescriptions.length === 1 ? matchingDescriptions[0] : undefined)
      ?? (matchingPosts.length === 1 ? matchingPosts[0] : undefined);
    if (!line) return requirement;

    const attributes = mergedAttributes(line.attributes, record(currentValue.attributes));
    const changedRequirements = Object.keys(line.attributes).filter(key =>
      normalized(String(attributes[key])) !== normalized(line.attributes[key]));

    return {
      ...requirement,
      requirement_key:
        stringValue(requirement.requirement_key) ?? line.nsCode ?? line.category,
      value_json: {
        ...currentValue,
        postNumber: line.postNumber ?? currentValue.postNumber ?? null,
        postScope: line.postScope ?? currentValue.postScope ?? null,
        parentPostNumber:
          line.parentPostNumber ?? currentValue.parentPostNumber ?? null,
        parentDescription: line.parentDescription ?? null,
        attributeSources: Object.fromEntries(Object.entries(line.attributeSources ?? {})
          .filter(([key]) => !changedRequirements.includes(key))),
        nsCode: line.nsCode ?? currentValue.nsCode ?? null,
        operation: line.operation,
        quantity: line.quantity ?? currentValue.quantity ?? null,
        quantityText: line.quantityText ?? currentValue.quantityText ?? null,
        unit: line.unit ?? currentValue.unit ?? null,
        attributes,
        system: line.system ?? currentValue.system ?? null,
        standardRefs: line.standardRefs.length
          ? line.standardRefs
          : currentValue.standardRefs ?? [],
        reviewFlags: mergedReviewFlags(
          [...line.reviewFlags, ...(changedRequirements.length ? ["reextracted-requirement-conflict"] : [])],
          currentValue.reviewFlags
        ),
        technicalSpecification:
          line.technicalSpecification ??
          currentValue.technicalSpecification ??
          line.sourceText,
        sourceText: line.sourceText
      },
      source_excerpt:
        stringValue(requirement.source_excerpt) ?? line.sourceText
    };
  });
}

function mergedReviewFlags(extracted: string[], current: unknown) {
  const extractionFlags = new Set(["unknown-category", "inferred-post-number", "inferred-parent-context", "missing-parent-context",
    "missing-post-number", "missing-quantity", "ocr-source", "pipe-unit-not-length", "unresolved-source-quantity", "reextracted-requirement-conflict"]);
  const stored = Array.isArray(current)
    ? current.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
  return [...new Set([...stored.filter(flag => !extractionFlags.has(flag)), ...extracted])];
}

function technicalDescriptionPages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TechnicalDescriptionPage[] => {
    const page = record(item);
    const pageNumber = numberValue(page.pageNumber);
    const text = stringValue(page.text);
    const method = page.method === "ocr" ? "ocr" : "text";
    const confidence = numberValue(page.confidence);
    if (!pageNumber || text === null) return [];
    return [{
      pageNumber,
      text,
      method,
      confidence: confidence ?? (method === "ocr" ? 0.75 : 0.98)
    }];
  });
}

function normalized(value: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function mergedAttributes(
  extracted: Record<string, unknown>,
  current: Record<string, unknown>
) {
  const output: Record<string, unknown> = {};
  for (const attributes of [extracted, current]) {
    for (const [key, value] of Object.entries(attributes)) {
      const normalizedKey = key.toLocaleLowerCase() === "dimension"
        ? "dimensjon"
        : key;
      output[normalizedKey] = value;
    }
  }
  return output;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
