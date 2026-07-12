import type { LucideIcon } from "lucide-react";

export type Stat = {
  label: string;
  value: string;
  delta: string;
  tone: "blue" | "teal" | "amber" | "rose";
  icon: LucideIcon;
};

export type ProjectStatus = "Design" | "Validation" | "Procurement" | "Issue";

export type Project = {
  id: string;
  name: string;
  customer: string;
  address: string;
  country: string;
  standard: string;
  systemType: string;
  supplier: string;
  status: ProjectStatus;
  updatedAt: string;
  progress: number;
};

export type PipelineStatus = "completed" | "ready";

export type PipelineStep = {
  name: string;
  status: PipelineStatus;
  detail: string;
};

export type MaterialLine = {
  line: number;
  articleNumber: string;
  product: string;
  supplier: string;
  quantity: number;
  unit: string;
  notes: string;
};

export type ProductStatus = "Verified" | "Preferred" | "Review";

export type Product = {
  id: string;
  articleNumber: string;
  name: string;
  supplier: string;
  category: string;
  dimension: string;
  status: ProductStatus;
  compatibility: string;
  leadTime: string;
};

export type ItemCategory =
  | "Pipe"
  | "Fitting"
  | "Valve"
  | "Sprinkler"
  | "Equipment"
  | "Support"
  | "Fastener"
  | "Accessory"
  | "Other"
  | "Unknown";

export type DemoSummaryItem = {
  label: string;
  value: string;
};

export type AnalysisStep = {
  name: string;
  detail: string;
  sourceReference: string;
  result: string;
};

export type ProductResolutionRow = {
  id: string;
  category: ItemCategory;
  requirement: string;
  extracted: string;
  postNumber?: string;
  sourcePage?: number;
  documentHref?: string;
  sourceReference: string;
  matchedProduct?: string;
  product_id?: string;
  compatibleProducts: string[];
  compliance: string;
  confidence: number;
  selectedProduct: string;
  status: "Verified" | "Needs review";
};

export type DemoMaterialLine = {
  line: number;
  category: ItemCategory;
  productCategory: string;
  requirement: string;
  selectedProduct: string;
  supplier: string;
  quantity: number;
  unit: string;
  confidence: number;
  notes: string;
  postNumber?: string;
  sourcePage?: number;
  documentHref?: string;
  sourceReference?: string;
  sourceText?: string;
  dimension?: string;
  matchedProduct?: string;
  product_id?: string;
  missing_from_database?: boolean;
};
