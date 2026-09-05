export type TechnicalDescriptionPage = {
  pageNumber: number;
  text: string;
  method: "text" | "ocr";
  confidence: number;
  status?: "success" | "partial" | "failed";
  errorCode?: "ocr_failed" | "text_extraction_failed";
  errorMessage?: string;
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

export type TechnicalDescriptionMaterialLine = {
  id: string;
  postNumber?: string;
  parentPostNumber?: string;
  nsCode?: string;
  category: TechnicalDescriptionCategory;
  description: string;
  operation: "install" | "remove" | "unknown";
  quantity?: number;
  quantityText?: string;
  unit?: string;
  attributes: Record<string, string>;
  system?: string;
  standardRefs: string[];
  technicalSpecification?: string;
  sourcePage: number;
  sourceText: string;
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
