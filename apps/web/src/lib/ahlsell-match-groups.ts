import { buildAhlsellRequirementGuide } from "@/lib/ahlsell-public-match";

export type AhlsellMatchGroup = "green" | "yellow";

type RequirementRow = Record<string, unknown> & { id: string };

export function splitAhlsellMatchGroups<Row extends RequirementRow>(
  requirements: readonly Row[],
  {
    approvedRequirementIds,
    memoryFingerprints
  }: {
    approvedRequirementIds: ReadonlySet<string>;
    memoryFingerprints: ReadonlySet<string>;
  }
) {
  const greenRequirements: Row[] = [];
  const yellowRequirements: Row[] = [];

  for (const requirement of requirements) {
    const hasApprovedProduct = approvedRequirementIds.has(requirement.id);
    const fingerprint = typeof requirement.mapping_fingerprint === "string"
      ? requirement.mapping_fingerprint
      : null;
    const hasLearnedProduct = Boolean(
      fingerprint && memoryFingerprints.has(fingerprint)
    );
    const hasDirectAhlsellMatch = buildAhlsellRequirementGuide(requirement)
      .directCandidates.length > 0;

    if (hasApprovedProduct || hasLearnedProduct || hasDirectAhlsellMatch) {
      greenRequirements.push(requirement);
    } else {
      yellowRequirements.push(requirement);
    }
  }

  return { greenRequirements, yellowRequirements };
}
