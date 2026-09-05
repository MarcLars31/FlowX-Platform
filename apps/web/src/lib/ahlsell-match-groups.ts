import { buildAhlsellRequirementGuide } from "@/lib/ahlsell-public-match";
import { isExactAhlsellCandidate } from "@/lib/ahlsell-candidate-ranking";
import { hasProjectRequirementDataWarning } from "@/lib/project-requirement-data-warnings";

export type AhlsellMatchGroup = "green" | "yellow" | "red";
export type AhlsellCatalogMatchStatus = "safe" | "found" | "none";

export function isAhlsellCatalogMatchStatus(value: unknown): value is AhlsellCatalogMatchStatus {
  return value === "safe" || value === "found" || value === "none";
}

export function classifyAhlsellCatalogCandidates(
  candidates: ReadonlyArray<{
    source?: "public_verified" | "verified_database" | "pdf_reference" | "catalog_search" | "confirmed_history";
    recommendation?: "recommended" | "possible" | "unlikely";
    matchScore?: number;
    matchWarnings?: string[];
    exactMatch?: boolean;
  }>
): AhlsellCatalogMatchStatus {
  if (candidates.some((candidate) => isExactAhlsellCandidate({
    ...candidate,
    articleNumber: "",
    productName: "",
    manufacturer: "",
    productUrl: "",
    specifications: [],
    source: candidate.source ?? "catalog_search"
  }))) return "safe";
  return candidates.some((candidate) =>
    candidate.recommendation === "recommended" || candidate.recommendation === "possible"
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
    staticallySafeRequirementIds
  }: {
    approvedRequirementIds: ReadonlySet<string>;
    memoryFingerprints: ReadonlySet<string>;
    catalogStatuses?: Readonly<Record<string, AhlsellCatalogMatchStatus>>;
    staticallySafeRequirementIds?: ReadonlySet<string>;
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
      && buildAhlsellRequirementGuide(requirement).directCandidates.some(isExactAhlsellCandidate);
    const catalogStatus = catalogStatuses[requirement.id];

    if (requiresDataReview) {
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
