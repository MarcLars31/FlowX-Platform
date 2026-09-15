import { buildAhlsellRequirementGuide } from "@/lib/ahlsell-public-match";
import { isMatchingAhlsellCandidate } from "@/lib/ahlsell-candidate-ranking";
import { technicalConflictWarnings } from "./ahlsell-technical-conflicts";
import { hasProjectRequirementDataWarning } from "@/lib/project-requirement-data-warnings";

export type AhlsellMatchGroup = "green" | "yellow" | "red";
export type AhlsellCatalogMatchStatus = "safe" | "found" | "none";
export type AhlsellCatalogAssessment = { revision: string; status: AhlsellCatalogMatchStatus; fullSearch: boolean };

export function mergeAhlsellCatalogAssessments(
  current: Readonly<Record<string, AhlsellCatalogAssessment>>,
  incoming: Readonly<Record<string, AhlsellCatalogAssessment>>
) {
  const next = { ...current };
  for (const [id, result] of Object.entries(incoming)) {
    const previous = next[id];
    if (previous?.revision === result.revision && previous.fullSearch && !result.fullSearch) continue;
    next[id] = result;
  }
  return next;
}

export function isAhlsellCatalogMatchStatus(value: unknown): value is AhlsellCatalogMatchStatus {
  return value === "safe" || value === "found" || value === "none";
}

export function classifyAhlsellCatalogCandidates(
  candidates: ReadonlyArray<{
    source?: "public_verified" | "verified_database" | "structured_database" | "pdf_reference" | "catalog_search" | "confirmed_history";
    recommendation?: "recommended" | "possible" | "unlikely";
    matchScore?: number;
    matchWarnings?: string[];
    exactMatch?: boolean;
    requiresAccessoryReview?: boolean;
  }>
): AhlsellCatalogMatchStatus {
  if (candidates.some((candidate) => isMatchingAhlsellCandidate({
    ...candidate,
    source: candidate.source ?? "catalog_search"
  }))) return "safe";
  return candidates.some((candidate) =>
    !technicalConflictWarnings(candidate).length
  ) ? "found" : "none";
}

export function ahlsellCatalogStatusFromPayload(value: unknown): AhlsellCatalogMatchStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (isAhlsellCatalogMatchStatus(payload.classification)) return payload.classification;
  if (!Array.isArray(payload.candidates)) return null;
  return classifyAhlsellCatalogCandidates(
    payload.candidates.filter((candidate): candidate is {
      recommendation?: "recommended" | "possible" | "unlikely";
      matchScore?: number;
      matchWarnings?: string[];
      exactMatch?: boolean;
      requiresAccessoryReview?: boolean;
    } =>
      Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate)
    )
  );
}

type RequirementRow = Record<string, unknown> & { id: string };

export function hasReusableProductMemory(
  requirement: Record<string, unknown>,
  memoryFingerprints: ReadonlySet<string>
) {
  const fingerprint = requirement.mapping_fingerprint;
  return typeof fingerprint === "string"
    && fingerprint.length > 0
    && memoryFingerprints.has(fingerprint);
}

export function splitAhlsellMatchGroups<Row extends RequirementRow>(
  requirements: readonly Row[],
  {
    approvedRequirementIds,
    memoryFingerprints,
    catalogStatuses = {},
    staticallySafeRequirementIds,
    manualReviewGroups = {}
  }: {
    approvedRequirementIds: ReadonlySet<string>;
    memoryFingerprints: ReadonlySet<string>;
    catalogStatuses?: Readonly<Record<string, AhlsellCatalogMatchStatus>>;
    staticallySafeRequirementIds?: ReadonlySet<string>;
    manualReviewGroups?: Readonly<Record<string, "red" | "yellow">>;
  }
) {
  const greenRequirements: Row[] = [];
  const yellowRequirements: Row[] = [];
  const redRequirements: Row[] = [];

  for (const requirement of requirements) {
    const handledByUser = approvedRequirementIds.has(requirement.id);
    const requiresDataReview = !handledByUser && hasProjectRequirementDataWarning(requirement);
    const precomputedSafe = staticallySafeRequirementIds?.has(requirement.id) ?? false;
    const hasApprovedProduct = !staticallySafeRequirementIds && approvedRequirementIds.has(requirement.id);
    const hasLearnedProduct = !staticallySafeRequirementIds
      && hasReusableProductMemory(requirement, memoryFingerprints);
    const hasDirectAhlsellMatch = !staticallySafeRequirementIds
      && buildAhlsellRequirementGuide(requirement).directCandidates.some(isMatchingAhlsellCandidate);
    const catalogStatus = catalogStatuses[requirement.id];

    if (manualReviewGroups[requirement.id] === "red") {
      redRequirements.push(requirement);
    } else if (manualReviewGroups[requirement.id] === "yellow" || requiresDataReview) {
      yellowRequirements.push(requirement);
    } else if (precomputedSafe || hasApprovedProduct || hasLearnedProduct || hasDirectAhlsellMatch || catalogStatus === "safe") {
      greenRequirements.push(requirement);
    } else if (catalogStatus === "none") {
      redRequirements.push(requirement);
    } else {
      yellowRequirements.push(requirement);
    }
  }

  return { greenRequirements, yellowRequirements, redRequirements };
}
