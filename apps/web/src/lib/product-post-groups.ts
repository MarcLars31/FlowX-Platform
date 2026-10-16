import { sortProjectRequirementsBySource } from "./project-requirement-order";

type Requirement = Record<string, unknown> & { id: string };

export function productChapterHeading(title: string) {
  const parts = title.match(/^(\d{3,6}\s+[A-ZÆØÅ][\wÆØÅæøå-]*(?:\s+[A-ZÆØÅ][\wÆØÅæøå-]*)?\s+[-–—]\s+\d+(?:\.\d+)*\.?)(?:\s+(.+))?$/)
    ?? title.match(/^(\d+(?:\.\d+)*\.?)(?:\s+(.+))?$/);
  return parts ? { chapter: parts[1], description: parts[2] ?? "—" } : { chapter: "—", description: title };
}

export type ProductChapterGroup<T extends Requirement> = {
  key: string;
  title: string;
  requirements: T[];
};

export function groupProductRequirementsByPdfChapter<T extends Requirement>(
  requirements: readonly T[],
  { allRequirements = requirements, preserveRowOrder = false }: {
    allRequirements?: readonly T[];
    preserveRowOrder?: boolean;
  } = {}
): ProductChapterGroup<T>[] {
  // Sorting a column only changes rows inside their own chapter. The full
  // PDF order remains stable even when a view filters out some of its rows.
  const chapterOrder = new Map<string, number>();
  const chapterStartPage = new Map<string, number>();
  for (const requirement of sortProjectRequirementsBySource(allRequirements)) {
    const { key } = chapterIdentity(requirement);
    if (!chapterOrder.has(key)) chapterOrder.set(key, chapterOrder.size);
    const page = Number(record(record(requirement.value_json).sourceChapter).sourcePage ?? requirement.source_page);
    if (Number.isFinite(page) && page > 0) chapterStartPage.set(key, Math.min(chapterStartPage.get(key) ?? Infinity, page));
  }
  const groups = new Map<string, ProductChapterGroup<T>>();
  for (const requirement of preserveRowOrder ? requirements : sortProjectRequirementsBySource(requirements)) {
    const { key, title } = chapterIdentity(requirement);
    const group = groups.get(key) ?? { key, title, requirements: [] };
    group.requirements.push(requirement);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    // The chapter introduction stays first even when a user sorts product columns.
    group.requirements.sort((left, right) => Number(record(right.value_json).chapterInformation === true)
      - Number(record(left.value_json).chapterInformation === true));
  }
  return [...groups.values()].sort((left, right) =>
    (chapterStartPage.get(left.key) ?? Infinity) - (chapterStartPage.get(right.key) ?? Infinity)
    || (chapterOrder.get(left.key) ?? Infinity) - (chapterOrder.get(right.key) ?? Infinity));
}

function chapterIdentity(requirement: Requirement) {
  const value = record(requirement.value_json);
  const chapter = record(value.sourceChapter);
  const title = typeof chapter.title === "string" && chapter.title.trim()
    ? chapter.title.replace(/\s+/g, " ").trim() : "Kapitel saknas i PDF";
  const documentId = requirement.source_technical_description_document_id ?? requirement.source_document_id ?? "";
  return { key: JSON.stringify([documentId, title.toLocaleLowerCase("nb-NO")]), title };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
