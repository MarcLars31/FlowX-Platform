import type { ProductPdfExtractionPayload } from "@/lib/product-pdf-processing";

export type StagedProductCandidate = {
  source_key: string;
  manufacturer: string;
  product_no?: string;
  manufacturer_product_number?: string;
  gtin?: string;
  sku?: string;
  product_name?: string;
  variant_name?: string;
  confidence: number;
  page_numbers: number[];
  source_excerpt: string;
  source_table_row: Record<string, unknown>;
  identifier_kind?: "article_number" | "sku" | "gtin" | "manufacturer_model";
  identifier_observed_in_source?: boolean;
  fields: Record<string, StagedField>;
};

type StagedField = {
  original_value: string;
  normalized_value: unknown;
  page_number?: number;
  extraction_method: "text" | "table" | "mixed";
  confidence: number;
  source_excerpt: string;
  source_table_row?: Record<string, unknown>;
};

export function prepareProductPdfForStaging(payload: ProductPdfExtractionPayload) {
  const manufacturer = stringValue(payload.documentInfo.manufacturer) ?? "Unknown";
  const productCandidates = payload.products.flatMap((product, index) =>
    productCandidatesFromExtractor(product, manufacturer, index)
  );
  const accessoryCandidates = payload.accessories.map((accessory, index) =>
    accessoryCandidate(accessory, manufacturer, index)
  );

  return {
    products: [...productCandidates, ...accessoryCandidates],
    documentInfo: {
      ...payload.documentInfo,
      title:
        stringValue(payload.documentInfo.title) ??
        documentTitle(payload.documentInfo, manufacturer),
      document_type:
        stringValue(payload.documentInfo.documentType) ??
        stringValue(payload.documentInfo.document_type) ??
        "datasheet",
      language_code:
        stringValue(payload.documentInfo.language) ??
        stringValue(payload.documentInfo.languageCode) ??
        stringValue(payload.documentInfo.language_code),
      page_count: positiveInteger(
        payload.documentInfo.pageCount ?? payload.documentInfo.page_count
      )
    }
  };
}

function productCandidatesFromExtractor(
  product: Record<string, unknown>,
  documentManufacturer: string,
  index: number
) {
  const manufacturer = stringValue(product.manufacturer) ?? documentManufacturer;
  const modelNumber = firstString(product, [
    "sin",
    "modelNumber",
    "model_number",
    "manufacturerProductNumber",
    "manufacturer_product_number"
  ]);
  const explicitProductNumber = firstString(product, [
    "productNo",
    "product_no",
    "articleNumber",
    "article_number"
  ]);
  const partNumbers = uniqueStrings(product.partNumbers);
  const explicitSku = firstString(product, [
    "sku",
    "manufacturerSku",
    "manufacturer_sku"
  ]);
  const variants: Array<string | undefined> =
    partNumbers.length > 0 ? partNumbers : [undefined];

  return variants.map((partNumber, variantIndex) => {
    const productName = firstString(product, ["productName", "product_name", "name"]);
    const baseVariant = firstString(product, ["variantName", "variant_name"]);
    const pageNumbers = readPageNumbers(product);
    const sourceExcerpt =
      firstString(product, ["sourceExcerpt", "source_excerpt"]) ??
      [productName, modelNumber, partNumber].filter(Boolean).join(" · ").slice(0, 2_000);
    const gtin = firstString(product, ["gtin", "ean", "EAN"]);
    const identifier =
      partNumber ?? explicitSku ?? explicitProductNumber ?? gtin ?? modelNumber;
    const identifierKind = partNumber || explicitSku
      ? "sku"
      : explicitProductNumber
        ? "article_number"
        : gtin
          ? "gtin"
          : "manufacturer_model";
    const identifierObservedInSource = Boolean(
      partNumber || explicitSku || explicitProductNumber || gtin || isVerifiedSin(modelNumber)
    );
    const confidence = identifierConfidence(identifier, identifierObservedInSource);
    const fields = extractedFields(product, sourceExcerpt, pageNumbers[0], confidence);
    const parentProductNumber =
      explicitProductNumber ?? modelNumber ?? gtin ?? partNumber ?? explicitSku;
    const extractedSku = partNumber ?? explicitSku;

    return removeUndefined({
      source_key: [modelNumber ?? `row-${index + 1}`, partNumber ?? variantIndex + 1].join(":"),
      manufacturer,
      product_no: parentProductNumber,
      manufacturer_product_number:
        modelNumber && modelNumber !== parentProductNumber
          ? modelNumber
          : undefined,
      gtin,
      sku: extractedSku,
      product_name: productName,
      variant_name:
        partNumber && partNumber !== parentProductNumber
          ? [baseVariant, partNumber].filter(Boolean).join(" · ")
          : baseVariant,
      confidence,
      page_numbers: pageNumbers,
      source_excerpt: sourceExcerpt,
      source_table_row: explicitSourceTableRow(product),
      identifier_kind: identifierKind,
      identifier_observed_in_source: identifierObservedInSource,
      fields
    }) as StagedProductCandidate;
  });
}

function accessoryCandidate(
  accessory: Record<string, unknown>,
  manufacturer: string,
  index: number
): StagedProductCandidate {
  const partNumber = firstString(accessory, ["partNumber", "part_number", "sku"]);
  const name = firstString(accessory, ["name", "productName", "product_name"]);
  const confidence = partNumber ? 0.95 : 0.7;
  const sourceExcerpt = [name, partNumber].filter(Boolean).join(" · ").slice(0, 2_000);
  const pageNumbers = readPageNumbers(accessory);
  return removeUndefined({
    source_key: `accessory:${partNumber ?? name ?? index + 1}`,
    manufacturer,
    product_no: partNumber,
    product_name: name,
    variant_name: "Accessory",
    confidence,
    page_numbers: pageNumbers,
    source_excerpt: sourceExcerpt,
    source_table_row: explicitSourceTableRow(accessory),
    fields: extractedFields(accessory, sourceExcerpt, pageNumbers[0], confidence)
  }) as StagedProductCandidate;
}

function extractedFields(
  product: Record<string, unknown>,
  sourceExcerpt: string,
  pageNumber: number | undefined,
  candidateConfidence: number
) {
  const fields: Record<string, StagedField> = {};
  const fieldSources = isRecord(product.fieldSources)
    ? product.fieldSources
    : isRecord(product.field_sources)
      ? product.field_sources
      : {};
  const excluded = new Set([
    "manufacturer", "sin", "modelNumber", "model_number", "productNo",
    "product_no", "articleNumber", "article_number", "partNumbers", "gtin",
    "ean", "sku", "manufacturerSku", "manufacturer_sku", "sourceExcerpt",
    "source_excerpt", "pageNumber", "page_number", "pageNumbers", "page_numbers",
    "specifications", "fieldSources", "field_sources", "sourceTableRow",
    "source_table_row"
  ]);

  Object.entries(product).forEach(([key, value]) => {
    if (excluded.has(key) || value === null || value === undefined) return;
    addField(
      fields,
      normalizeFieldKey(key),
      value,
      sourceExcerpt,
      pageNumber,
      candidateConfidence,
      fieldSource(fieldSources, key)
    );
  });

  if (isRecord(product.specifications)) {
    Object.entries(product.specifications).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      addField(
        fields,
        normalizeFieldKey(key),
        value,
        sourceExcerpt,
        pageNumber,
        candidateConfidence,
        fieldSource(fieldSources, key)
      );
    });
  }

  if (isRecord(product.physicalCharacteristics)) {
    Object.entries(product.physicalCharacteristics).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      addField(
        fields,
        `physical_${normalizeFieldKey(key)}`,
        value,
        sourceExcerpt,
        pageNumber,
        candidateConfidence,
        fieldSource(fieldSources, key)
      );
    });
  }
  return fields;
}

function addField(
  fields: Record<string, StagedField>,
  key: string,
  value: unknown,
  sourceExcerpt: string,
  pageNumber: number | undefined,
  candidateConfidence: number,
  source?: Record<string, unknown>
) {
  const rawValue = source?.originalValue ?? source?.original_value ?? value;
  const originalValue =
    typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue).slice(0, 20_000);
  const sourcePage = positiveInteger(source?.pageNumber ?? source?.page_number) ?? pageNumber;
  const sourceConfidence = confidenceValue(source?.confidence) ?? Math.max(0.8, candidateConfidence - 0.05);
  const extractionMethod = supportedFieldMethod(
    source?.extractionMethod ?? source?.extraction_method
  );
  const sourceTableRow = isRecord(source?.sourceTableRow)
    ? source.sourceTableRow
    : isRecord(source?.source_table_row)
      ? source.source_table_row
      : undefined;
  fields[key] = removeUndefined({
    original_value: originalValue,
    normalized_value: value,
    page_number: sourcePage,
    extraction_method: extractionMethod ?? (isStructured(value) ? "table" : "text"),
    confidence: sourceConfidence,
    source_excerpt:
      stringValue(source?.sourceExcerpt ?? source?.source_excerpt) ?? sourceExcerpt,
    source_table_row: sourceTableRow
  }) as StagedField;
}

function fieldSource(sources: Record<string, unknown>, key: string) {
  const normalized = normalizeFieldKey(key);
  const match = Object.entries(sources).find(
    ([sourceKey]) => normalizeFieldKey(sourceKey) === normalized
  )?.[1];
  return isRecord(match) ? match : undefined;
}

function confidenceValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function supportedFieldMethod(value: unknown): StagedField["extraction_method"] | undefined {
  return value === "text" || value === "table" || value === "mixed" ? value : undefined;
}

function documentTitle(info: Record<string, unknown>, manufacturer: string) {
  const documentNumber = firstString(info, ["documentNumber", "document_number"]);
  return [manufacturer, documentNumber ? `datablad ${documentNumber}` : "produktdatablad"]
    .filter(Boolean)
    .join(" ");
}

function readPageNumbers(record: Record<string, unknown>) {
  const values = Array.isArray(record.pageNumbers)
    ? record.pageNumbers
    : Array.isArray(record.page_numbers)
      ? record.page_numbers
      : [record.pageNumber ?? record.page_number];
  return [
    ...new Set(
      values.map(Number).filter((value) => Number.isInteger(value) && value > 0)
    )
  ];
}

function identifierConfidence(value: string | undefined, observedInSource: boolean) {
  if (!value) return 0.7;
  return observedInSource ? 0.95 : 0.88;
}

function isVerifiedSin(value: string | undefined) {
  return Boolean(value && /^V\d{4}$/i.test(value));
}

function normalizeFieldKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 120);
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return undefined;
}

function stringValue(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map(stringValue).filter((item): item is string => Boolean(item))
    )
  ];
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isStructured(value: unknown) {
  return Array.isArray(value) || isRecord(value);
}

function explicitSourceTableRow(record: Record<string, unknown>) {
  if (isRecord(record.sourceTableRow)) return record.sourceTableRow;
  if (isRecord(record.source_table_row)) return record.source_table_row;
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}
