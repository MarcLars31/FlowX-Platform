export type TechnicalDescriptionAnnotation = {
  id: string;
  text: string;
  subtype: string;
  rect?: number[];
  postNumber?: string;
  continuesPreviousPost?: boolean;
};

export type TechnicalDescriptionPage = {
  pageNumber: number;
  text: string;
  method: "text" | "ocr";
  confidence: number;
  status?: "success" | "partial" | "failed";
  errorCode?: "ocr_failed" | "text_extraction_failed";
  errorMessage?: string;
  annotations?: TechnicalDescriptionAnnotation[];
  annotationReadFailed?: boolean;
  /** The body needs OCR despite a readable digital header/footer. */
  ocrReason?: "image-body" | "vector-body" | "body-check-failed";
  /** Verified digital table columns; indices refer to normalized text lines. */
  /** Independent inventory of physical post-number cells, before classification. */
  /** Original readings remain available for auditing mixed digital/OCR pages. */
  /** Amounts read from verified original columns, independent of OCR text order. */
  sourceColumnQuantities?: Array<{ postNumber: string; quantity: number; unit: string; text: string }>;
  sourceReadings?: { digital: string; ocr: string };
  sourceTextMerge?: boolean;
  postInventory?: import("./post-inventory").PostInventory;
  postTable?: {
    text: string;
    siteTitle: string;
    quantityColumnsVerified?: boolean;
    /** Extra columns exist, but their quantity/unit boundaries are not verified. */
    quantityColumnsUnrecognized?: boolean;
    posts: Array<{
      lineIndex: number; postNumber: string; description: string; chapter: boolean;
      quantity?: { quantity: number; unit: string; text: string; lineIndex: number; descriptionPrefix: string; sourceUnitText?: string; sourceAmountText?: string };
    }>;
    quantities: Array<{ quantity: number; unit: string; text: string; lineIndex: number; descriptionPrefix: string; sourceUnitText?: string; sourceAmountText?: string }>;
  };
};

export type TechnicalDescriptionCategory =
  | "sprinkler_head"
  | "sprinkler_hose"
  | "pipe"
  | "fitting"
  | "valve"
  | "support"
  | "control"
  | "other"
  | "unknown";

export type TechnicalDescriptionChapter = {
  title: string;
  sourcePage: number;
};

export type TechnicalDescriptionMaterialLine = {
  id: string;
  postNumber?: string;
  parentPostNumber?: string;
  parentDescription?: string;
  /** Chapter/section identity; short post numbers may repeat within a PDF. */
  postScope?: string;
  nsCode?: string;
  category: TechnicalDescriptionCategory;
  description: string;
  operation: "install" | "remove" | "unknown";
  quantity?: number;
  quantityText?: string;
  /** Actual source of the amount, which may follow the post on another page. */
  quantitySourcePage?: number;
  unit?: string;
  attributes: Record<string, string>;
  /** Origin of each own or inherited requirement, before any user correction. */
  attributeSources?: Record<string, { postNumber: string; sourcePage: number }>;
  system?: string;
  standardRefs: string[];
  technicalSpecification?: string;
  sourcePage: number;
  sourceChapter?: TechnicalDescriptionChapter;
  sourceOrder?: number;
  chapterInformation?: boolean;
  sourcePages?: number[];
  sourceText: string;
  /** Verified description column, without synthesized unit/quantity rows. */
  pdfDescriptionText?: string;
  /** Original column values for display; empty cells remain empty. */
  pdfColumnValues?: { unit: string; quantity: string };
  confidence: number;
  reviewFlags: string[];
};

export type TechnicalDescriptionProject = {
  name?: string;
  projectNumber?: string;
  chapter?: string;
  sourcePage?: number;
  confidence: number;
};

export type TechnicalDescriptionRuleHint = {
  key: string;
  value: string;
  sourcePage: number;
  sourceText: string;
  confidence: number;
};

export type TechnicalDescriptionWarning = {
  id: string;
  code: string;
  message: string;
  sourcePage?: number;
  sourceText?: string;
  severity: "info" | "warning";
};

export type TechnicalDescriptionExtractionResult = {
  structure?: Omit<import("./document-structure").PdfDocumentStructure, "pages">;
  postChecks?: import("./post-coverage").PostCoverageCheck[];
  pageChecks?: Array<{
    sourcePage: number;
    observedQuantityRows: number;
    extractedQuantityRows: number;
    productRows: number;
    workRows: number;
    removalRows: number;
    unresolvedQuantityRows: number;
  }>;
  document: {
    fileName?: string;
    pageCount: number;
    extractionMethod: "text" | "ocr" | "mixed";
    extractedAt: string;
  };
  project: TechnicalDescriptionProject;
  materialLines: TechnicalDescriptionMaterialLine[];
  standards: string[];
  ruleHints: TechnicalDescriptionRuleHint[];
  pages: TechnicalDescriptionPage[];
  warnings: TechnicalDescriptionWarning[];
};
