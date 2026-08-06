export const PROJECT_STAGES = [
  ["setup", "Projektinformation"],
  ["documents", "Dokument"],
  ["technical_description", "Teknisk beskrivning"],
  ["requirements_review", "Krav"],
  ["analysis", "Analys"],
  ["product_matching", "Produktmatchning"],
  ["material_list", "Materiallista"],
  ["approval", "Godkännande"],
  ["completed", "Export / klart"]
] as const;

export const PROJECT_STATUSES = ["draft", "active", "on_hold", "completed", "archived"] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number][0];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isValidProjectStage(value: unknown): value is ProjectStage {
  return typeof value === "string" && PROJECT_STAGES.some(([stage]) => stage === value);
}

export function isValidProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && PROJECT_STATUSES.includes(value as ProjectStatus);
}

export function nextProjectStage(stage: ProjectStage): ProjectStage | null {
  const index = PROJECT_STAGES.findIndex(([value]) => value === stage);
  return PROJECT_STAGES[index + 1]?.[0] ?? null;
}
