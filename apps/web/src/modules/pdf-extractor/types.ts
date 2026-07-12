export type ExtractedPageText = {
  pageNumber: number;
  text: string;
};

export type PdfExtractionResult = {
  document: ExtractedDocument;
  project: ExtractedProject;
  systems: ExtractedSystem[];
  standards: ExtractedStandard[];
  sections: ExtractedSection[];
  lineItems: ExtractedLineItem[];
  requirements: ExtractedRequirement[];
  warnings: ExtractionWarning[];
};

export type ExtractedDocument = {
  fileName?: string;
  pageCount: number;
  extractedAt: string;
};

export type ExtractedProject = {
  name?: string;
  projectNumber?: string;
  discipline?: string;
  revision?: string;
  sourcePage?: number;
  confidence: number;
};

export type ExtractedSystem = {
  id: string;
  name: string;
  normalizedName: string;
  sourcePage: number;
  sourceText: string;
  confidence: number;
};

export type ExtractedStandard = {
  id: string;
  code: string;
  sourcePage: number;
  sourceText: string;
  confidence: number;
};

export type ExtractedSection = {
  id: string;
  title: string;
  sourcePage: number;
  sourceText: string;
  confidence: number;
};

export type ExtractedLineItemCategory =
  | "pipe"
  | "fitting"
  | "valve"
  | "sprinkler"
  | "hose"
  | "sensor"
  | "control"
  | "test"
  | "marking"
  | "unknown";

export type ExtractedLineItem = {
  id: string;
  postNumber?: string;
  nsCode?: string;
  specificationCode?: string;
  sectionTitle?: string;
  category: ExtractedLineItemCategory;
  description: string;
  dimension?: string;
  dimensions?: string[];
  material?: string;
  system?: string;
  standardRefs: string[];
  quantity?: number;
  quantityText?: string;
  unit?: string;
  sourcePage: number;
  sourceText: string;
  sourceTextBlock?: string;
  extractionMethod?: "single-line" | "wrapped-line" | "table-row";
  reviewFlags?: string[];
  confidence: number;
};

export type ExtractedRequirement = {
  id: string;
  type: "pressure" | "property" | "standard" | "dimension";
  value: string;
  sourcePage: number;
  sourceText: string;
  confidence: number;
};

export type ExtractionWarning = {
  id: string;
  code: string;
  message: string;
  sourcePage?: number;
  sourceText?: string;
  severity: "info" | "warning";
};
