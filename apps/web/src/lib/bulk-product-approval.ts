import { isExactAhlsellCandidate } from "@/lib/ahlsell-candidate-ranking";
import { buildAhlsellRequirementGuide } from "@/lib/ahlsell-public-match";
import { hasProjectRequirementDataWarning } from "@/lib/project-requirement-data-warnings";
import { ahlsellMldlProduct } from "./ahlsell-mldl-catalog";
import { readProductSelectionReview } from "./product-selection-review";
import { requiresProductRequirementReview } from "./product-requirement-review";

export type BulkProductApprovalSelection = {
  requirementId: string;
  productName: string;
  productNumber: string;
  manufacturerName: string;
  productUrl: string | null;
  source: "memory" | "direct";
};

export type PreviousBulkProductApproval<TRequirement extends Record<string, unknown> & { id: string }> = {
  requirement: TRequirement;
  selection: BulkProductApprovalSelection;
};

export const BULK_PRODUCT_APPROVAL_CONCURRENCY = 5;

export async function mapBulkProductApprovals<TItem, TResult>(
  items: ReadonlyArray<TItem>,
  worker: (item: TItem, index: number) => Promise<TResult>,
  concurrency = BULK_PRODUCT_APPROVAL_CONCURRENCY
): Promise<TResult[]> {
  if (items.length === 0) return [];
  const results = new Array<TResult>(items.length);
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await worker(item, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export function previousBulkProductApprovals<TRequirement extends Record<string, unknown> & { id: string }>(
  requirements: ReadonlyArray<TRequirement>,
  selectionsByRequirementId: ReadonlyMap<string, BulkProductApprovalSelection>
): Array<PreviousBulkProductApproval<TRequirement>> {
  return requirements.flatMap((requirement) => {
    const selection = selectionsByRequirementId.get(requirement.id);
    return selection?.source === "memory" ? [{ requirement, selection }] : [];
  });
}

export function bulkProductApprovalSelection({
  requirement,
  memories = [],
  handled
}: {
  requirement: Record<string, unknown> & { id: string };
  memories?: ReadonlyArray<Record<string, unknown>>;
  handled: boolean;
}): BulkProductApprovalSelection | null {
  if (handled || hasProjectRequirementDataWarning(requirement) || requiresProductRequirementReview(requirement)) return null;

  const requirementFingerprint = text(requirement.mapping_fingerprint);
  const exactMemoryProducts = new Map<string, Record<string, unknown>>();
  for (const memory of memories) {
    if (readProductSelectionReview(memory.notes)) continue;
    const memoryProductName = text(memory.product_name);
    const memoryProductNumber = text(memory.product_number);
    if (
      requirementFingerprint
      && text(memory.requirement_fingerprint) === requirementFingerprint
      && memoryProductName
      && memoryProductNumber
      && ahlsellMldlProduct(memoryProductNumber)
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
