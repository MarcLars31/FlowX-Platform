import { isExactAhlsellCandidate } from "@/lib/ahlsell-candidate-ranking";
import { buildAhlsellRequirementGuide } from "@/lib/ahlsell-public-match";
import { hasProjectRequirementDataWarning } from "@/lib/project-requirement-data-warnings";

export type BulkProductApprovalSelection = {
  requirementId: string;
  productName: string;
  productNumber: string;
  manufacturerName: string;
  productUrl: string | null;
  source: "memory" | "direct";
};

export function bulkProductApprovalSelection({
  requirement,
  memories = [],
  handled
}: {
  requirement: Record<string, unknown> & { id: string };
  memories?: ReadonlyArray<Record<string, unknown>>;
  handled: boolean;
}): BulkProductApprovalSelection | null {
  if (handled || hasProjectRequirementDataWarning(requirement)) return null;

  const requirementFingerprint = text(requirement.mapping_fingerprint);
  const exactMemoryProducts = new Map<string, Record<string, unknown>>();
  for (const memory of memories) {
    const memoryProductName = text(memory.product_name);
    const memoryProductNumber = text(memory.product_number);
    if (
      requirementFingerprint
      && text(memory.requirement_fingerprint) === requirementFingerprint
      && memoryProductName
      && memoryProductNumber
    ) {
      exactMemoryProducts.set(normalizeProductNumber(memoryProductNumber), memory);
    }
  }
  if (exactMemoryProducts.size === 1) {
    const [memory] = exactMemoryProducts.values();
    if (!memory) return null;
    return {
      requirementId: requirement.id,
      productName: text(memory.product_name),
      productNumber: text(memory.product_number),
      manufacturerName: text(memory.manufacturer_name),
      productUrl: null,
      source: "memory"
    };
  }

  const exactCandidates = new Map(
    buildAhlsellRequirementGuide(requirement).directCandidates
      .filter(isExactAhlsellCandidate)
      .map((candidate) => [normalizeProductNumber(candidate.articleNumber), candidate])
  );
  if (exactCandidates.size !== 1) return null;

  const [candidate] = exactCandidates.values();
  if (!candidate) return null;
  return {
    requirementId: requirement.id,
    productName: candidate.productName,
    productNumber: candidate.articleNumber,
    manufacturerName: candidate.manufacturer,
    productUrl: candidate.productUrl,
    source: "direct"
  };
}

function normalizeProductNumber(value: string) {
  return value.trim().toLocaleLowerCase("sv-SE").replace(/[^a-z0-9]/g, "").replace(/^nrf/, "");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
