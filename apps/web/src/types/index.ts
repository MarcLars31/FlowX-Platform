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
