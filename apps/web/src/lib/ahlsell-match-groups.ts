import { buildAhlsellRequirementGuide } from "@/lib/ahlsell-public-match";

export type AhlsellMatchGroup = "green" | "yellow" | "red";
export type AhlsellCatalogMatchStatus = "safe" | "found" | "none";

export function isAhlsellCatalogMatchStatus(value: unknown): value is AhlsellCatalogMatchStatus {
  return value === "safe" || value === "found" || value === "none";
}

export function classifyAhlsellCatalogCandidates(
  candidates: ReadonlyArray<{ recommendation?: "recommended" | "possible" | "unlikely" }>
): AhlsellCatalogMatchStatus {
  if (candidates.some((candidate) => candidate.recommendation === "recommended")) return "safe";
  return candidates.length > 0 ? "found" : "none";
}

type RequirementRow = Record<string, unknown> & { id: string };

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
    const precomputedSafe = staticallySafeRequirementIds?.has(requirement.id) ?? false;
    const hasApprovedProduct = !staticallySafeRequirementIds && approvedRequirementIds.has(requirement.id);
    const fingerprint = !staticallySafeRequirementIds && typeof requirement.mapping_fingerprint === "string"
      ? requirement.mapping_fingerprint
      : null;
    const hasLearnedProduct = !staticallySafeRequirementIds && Boolean(fingerprint && memoryFingerprints.has(fingerprint));
    const hasDirectAhlsellMatch = !staticallySafeRequirementIds
      && buildAhlsellRequirementGuide(requirement).directCandidates.length > 0;
    const catalogStatus = catalogStatuses[requirement.id];

    if (precomputedSafe || hasApprovedProduct || hasLearnedProduct || hasDirectAhlsellMatch || catalogStatus === "safe") {
      greenRequirements.push(requirement);
    } else if (catalogStatus === "none") {
      redRequirements.push(requirement);
    } else {
      yellowRequirements.push(requirement);
    }
  }

  return { greenRequirements, yellowRequirements, redRequirements };
}
