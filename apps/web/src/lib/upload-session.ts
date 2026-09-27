"use client";

import { useEffect, useState } from "react";
import type {
  ExtractedLineItem,
  PdfExtractionResult
} from "@/modules/pdf-extractor";
import type {
  DemoMaterialLine,
  ItemCategory,
  ProductResolutionRow
} from "@/types";
import {
  buildCategoryBreakdown,
  getMissingProducts,
  isMatched,
  type CategoryBreakdownRow
} from "@/lib/pipeline-analysis";

const ACTIVE_DOCUMENT_KEY = "flowx.activeDocument";
const LATEST_UPLOAD_SESSION_ID_KEY = "flowx.latestUploadSessionId";

const RESET_STATE_KEYS = [
  ACTIVE_DOCUMENT_KEY,
  LATEST_UPLOAD_SESSION_ID_KEY,
  "flowx.analysisResult",
  "flowx.materialList",
  "flowx.matchedProducts",
  "flowx.productMatches",
  "flowx.missingProducts",
  "flowx.categoryBreakdown",
  "flowx.selectedProduct",
  "flowx.referenceDocument",
  "flowx.sampleDocument",
  "flowx.demoDocument",
  "flowx.fallbackDocument",
  "flowx.defaultDocument",
  "flowx.mockDocument",
  "flowx.testDocument"
];

export const ANALYSIS_SESSION_MISMATCH_MESSAGE =
  "Analysis data does not match the latest uploaded document. Please re-run extraction.";

export type ActiveUploadDocument = {
  uploadSessionId: string;
  fileName: string;
  uploadedAt: string;
  isDemoMode: boolean;
  extractionResult: PdfExtractionResult;
  materialList: DemoMaterialLine[];
  productMatches: ProductResolutionRow[];
  missingProducts: DemoMaterialLine[];
  categoryBreakdown: CategoryBreakdownRow[];
};

type ActiveUploadState =
  | { status: "loading" }
  | {
      status: "ready";
      activeDocument: ActiveUploadDocument | null;
      error: string | null;
    };

type StoreUploadInput = {
  uploadSessionId: string;
  fileName: string;
  extractionResult: PdfExtractionResult;
  isDemoMode?: boolean;
};

export function resetAnalysisState() {
  if (!canUseStorage()) {
    return;
  }

  RESET_STATE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

export function beginUploadSession() {
  const uploadSessionId = createUploadSessionId();

  resetAnalysisState();

  if (canUseStorage()) {
    window.localStorage.setItem(
      LATEST_UPLOAD_SESSION_ID_KEY,
      uploadSessionId
    );
  }

  return uploadSessionId;
}

export function storeLatestUploadDocument({
  extractionResult,
  fileName,
  isDemoMode = false,
  uploadSessionId
}: StoreUploadInput) {
  const materialList = buildMaterialList(extractionResult);
  const productMatches = buildProductMatches(materialList);
  const missingProducts = getMissingProducts(materialList);
  const activeDocument: ActiveUploadDocument = {
    uploadSessionId,
    fileName,
    uploadedAt: new Date().toISOString(),
    isDemoMode,
    extractionResult: {
      ...extractionResult,
      document: {
        ...extractionResult.document,
        fileName
      }
    },
    materialList,
    productMatches,
    missingProducts,
    categoryBreakdown: buildCategoryBreakdown({
      materialItems: materialList,
      matchedProducts: productMatches
    })
  };

  if (canUseStorage()) {
    window.localStorage.setItem(
      ACTIVE_DOCUMENT_KEY,
      JSON.stringify(activeDocument)
    );
    window.localStorage.setItem(
      LATEST_UPLOAD_SESSION_ID_KEY,
      activeDocument.uploadSessionId
    );
  }

  return activeDocument;
}

export function readActiveUploadDocument(): ActiveUploadState {
  if (!canUseStorage()) {
    return { status: "ready", activeDocument: null, error: null };
  }

  const latestUploadSessionId = window.localStorage.getItem(
    LATEST_UPLOAD_SESSION_ID_KEY
  );
  const rawActiveDocument = window.localStorage.getItem(ACTIVE_DOCUMENT_KEY);

  if (!rawActiveDocument) {
    return {
      status: "ready",
      activeDocument: null,
      error: latestUploadSessionId ? ANALYSIS_SESSION_MISMATCH_MESSAGE : null
    };
  }

  try {
    const activeDocument = JSON.parse(
      rawActiveDocument
    ) as ActiveUploadDocument;

    if (
      !isActiveUploadDocument(activeDocument) ||
      activeDocument.uploadSessionId !== latestUploadSessionId
    ) {
      return {
        status: "ready",
        activeDocument: null,
        error: ANALYSIS_SESSION_MISMATCH_MESSAGE
      };
    }

    return { status: "ready", activeDocument, error: null };
  } catch {
    return {
      status: "ready",
      activeDocument: null,
      error: ANALYSIS_SESSION_MISMATCH_MESSAGE
    };
  }
}

export function useActiveUploadDocument() {
  const [state, setState] = useState<ActiveUploadState>({
    status: "loading"
  });

  useEffect(() => {
    // sessionStorage is browser-only and must be read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(readActiveUploadDocument());
  }, []);

  return state;
}

export function useMaterialListConsistencyWarning({
  materialListLength,
  matchedProductsLength,
  missingProductsLength
}: {
  materialListLength: number;
  matchedProductsLength: number;
  missingProductsLength: number;
}) {
  useEffect(() => {
    const isBalanced =
      matchedProductsLength + missingProductsLength === materialListLength;

    if (process.env.NODE_ENV === "development" && !isBalanced) {
      console.warn(
        "Product/material consistency warning: matchedProducts.length + missingProducts.length must equal materialList.length.",
        {
          materialListLength,
          matchedProductsLength,
          missingProductsLength
        }
      );
    }
  }, [materialListLength, matchedProductsLength, missingProductsLength]);
}

function buildMaterialList(
  extractionResult: PdfExtractionResult
): DemoMaterialLine[] {
  return extractionResult.lineItems.map((item, index) => {
    const category = mapExtractedCategory(item.category);
    const databaseMatch = resolveDatabaseMatch(item, category);
    const quantity = item.quantity ?? 0;
    const sourceReference = buildSourceReference(item);

    return {
      line: index + 1,
      category,
      productCategory: category,
      requirement: item.description,
      selectedProduct: databaseMatch?.name ?? "Missing database product",
      supplier: databaseMatch?.supplier ?? "Unassigned",
      quantity,
      unit: item.unit ?? "item",
      confidence: Math.round(item.confidence),
      notes: buildMaterialNotes(item, databaseMatch),
      postNumber: item.postNumber,
      sourcePage: item.sourcePage,
      documentHref: buildDocumentHref(item),
      sourceReference,
      sourceText: item.sourceTextBlock ?? item.sourceText,
      dimension: item.dimension ?? item.dimensions?.[0],
      matchedProduct: databaseMatch?.name,
      product_id: databaseMatch?.id,
      missing_from_database: !databaseMatch
    };
  });
}

function buildProductMatches(
  materialList: DemoMaterialLine[]
): ProductResolutionRow[] {
  return materialList.filter(isMatched).map((item) => ({
    id: `match-${item.line}`,
    category: item.category,
    requirement: item.requirement,
    extracted: item.sourceText ?? item.requirement,
    postNumber: item.postNumber,
    sourcePage: item.sourcePage,
    documentHref: item.documentHref,
    sourceReference:
      item.sourceReference ?? `Page ${item.sourcePage ?? "-"} source`,
    matchedProduct: item.matchedProduct,
    product_id: item.product_id,
    compatibleProducts: buildCompatibleProducts(item),
    compliance:
      "Matched against the active uploaded document using category, dimension and confidence.",
    confidence: item.confidence,
    selectedProduct: item.matchedProduct ?? item.selectedProduct,
    status: item.confidence >= 92 ? "Verified" : "Needs review"
  }));
}

function resolveDatabaseMatch(item: ExtractedLineItem, category: ItemCategory) {
  if (category === "Unknown" || category === "Other") {
    return null;
  }

  const dimension = item.dimension ?? item.dimensions?.[0];
  const requiresDimension = ["Pipe", "Fitting", "Valve", "Sprinkler"].includes(
    category
  );

  if (item.confidence < 88 || (requiresDimension && !dimension)) {
    return null;
  }

  const name = `${category} database match${dimension ? ` ${dimension}` : ""}`;

  return {
    id: `db-${slugify(category)}-${slugify(dimension ?? item.description)}`,
    name,
    supplier: "Ahlsell"
  };
}

function mapExtractedCategory(category: ExtractedLineItem["category"]) {
  switch (category) {
    case "pipe":
      return "Pipe";
    case "fitting":
      return "Fitting";
    case "valve":
      return "Valve";
    case "sprinkler":
      return "Sprinkler";
    case "sensor":
    case "control":
    case "test":
      return "Equipment";
    case "hose":
      return "Accessory";
    case "marking":
      return "Other";
    default:
      return "Unknown";
  }
}

function buildMaterialNotes(
  item: ExtractedLineItem,
  databaseMatch: { name: string; supplier: string } | null
) {
  const notes = [
    item.sectionTitle,
    item.standardRefs.length ? `Standards: ${item.standardRefs.join(", ")}` : "",
    item.quantity ? "" : "Quantity needs review",
    databaseMatch ? "Database match found" : "Missing from database"
  ].filter(Boolean);

  return notes.join(". ");
}

function buildCompatibleProducts(item: DemoMaterialLine) {
  const dimension = item.dimension ? ` ${item.dimension}` : "";

  return [
    `Ahlsell equivalent${dimension}`,
    `Victaulic compatible${dimension}`
  ];
}

function buildSourceReference(item: ExtractedLineItem) {
  const postNumber = item.postNumber ? `, post ${item.postNumber}` : "";

  return `Page ${item.sourcePage}${postNumber}`;
}

function buildDocumentHref(item: ExtractedLineItem) {
  const params = new URLSearchParams();

  if (item.postNumber) {
    params.set("postnr", item.postNumber);
  }

  params.set("page", `${item.sourcePage}`);

  return `/projects/demo/upload?${params.toString()}`;
}

function isActiveUploadDocument(value: ActiveUploadDocument) {
  return Boolean(
    value &&
      value.uploadSessionId &&
      value.fileName &&
      value.extractionResult &&
      Array.isArray(value.materialList) &&
      Array.isArray(value.productMatches) &&
      Array.isArray(value.missingProducts)
  );
}

function createUploadSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
