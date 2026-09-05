import {
  orderAhlsellCandidatesForDisplay,
  rankAhlsellCandidates
} from "@/lib/ahlsell-candidate-ranking";
import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";
import { ns3420ProductFamily } from "@/lib/ns3420-product-classification";

export const MIN_LEARNED_PRODUCT_MATCH_SCORE = 75;
export const MIN_LEARNED_PRODUCT_MATCH_REASONS = 2;

export type DistributorProductMemoryEvidence = Record<string, unknown> & {
  id: string;
  requirement_fingerprint: string;
  requirement_category: string;
  requirement_key: string;
  requirement_snapshot: Record<string, unknown>;
  product_name: string;
  product_number: string;
  manufacturer_name?: string | null;
  usage_count: number;
};

export type LearnedProductSearchHint = {
  memoryId: string;
  productNumber: string;
  productName: string;
  manufacturerName: string;
  matchScore: number;
  usageCount: number;
  supportCount: number;
  exactFingerprint: boolean;
  matchReasons: string[];
};

/**
 * Turns confirmed product choices into conservative search hints. Historical
 * requirement data is evaluated with the same technical checks as public
 * Ahlsell candidates. A learned choice with a conflicting DN, K-factor,
 * temperature, response, orientation, mounting or system is therefore not
 * allowed to steer a new search.
 */
export function rankDistributorProductMemoryHints(
  requirement: Record<string, unknown>,
  memories: readonly DistributorProductMemoryEvidence[]
): LearnedProductSearchHint[] {
  const targetCategory = ns3420ProductFamily(flattenText(requirement))
    ?? normalizedCategory(requirement.category);
  const targetFingerprint = cleanText(requirement.mapping_fingerprint);
  if (!targetCategory || targetCategory === "unknown") return [];

  const hints = memories.flatMap((memory): LearnedProductSearchHint[] => {
    if (normalizedCategory(memory.requirement_category) !== targetCategory) return [];

    const productNumber = cleanText(memory.product_number);
    const productName = cleanText(memory.product_name);
    const specificationLines = memorySpecificationLines(memory.requirement_snapshot);
    if (!productNumber || !productName || specificationLines.length === 0) return [];

    const [ranked] = rankAhlsellCandidates(requirement, [{
      articleNumber: productNumber,
      productName: historicalRequirementLabel(memory, specificationLines[0]),
      manufacturer: "",
      productUrl: "",
      description: specificationLines[0],
      specifications: specificationLines.slice(1),
      source: "catalog_search"
    }]);
    const matchScore = ranked?.matchScore ?? 0;
    const warnings = ranked?.matchWarnings ?? [];
    const matchReasons = ranked?.matchReasons ?? [];
    if (
      !ranked
      || ranked.recommendation !== "recommended"
      || matchScore < MIN_LEARNED_PRODUCT_MATCH_SCORE
      || matchReasons.length < MIN_LEARNED_PRODUCT_MATCH_REASONS
      || warnings.length > 0
    ) return [];

    return [{
      memoryId: memory.id,
      productNumber,
      productName,
      manufacturerName: cleanText(memory.manufacturer_name),
      matchScore,
      usageCount: positiveInteger(memory.usage_count),
      supportCount: 1,
      exactFingerprint: Boolean(
        targetFingerprint
        && targetFingerprint === cleanText(memory.requirement_fingerprint)
      ),
      matchReasons
    }];
  });

  const preferredByProductNumber = new Map<string, LearnedProductSearchHint>();
  for (const hint of hints) {
    const key = normalizeProductNumber(hint.productNumber);
    const current = preferredByProductNumber.get(key);
    if (!current) {
      preferredByProductNumber.set(key, hint);
      continue;
    }
    const preferred = compareHints(hint, current) < 0 ? hint : current;
    preferredByProductNumber.set(key, {
      ...preferred,
      supportCount: current.supportCount + hint.supportCount,
      usageCount: current.usageCount + hint.usageCount
    });
  }

  return [...preferredByProductNumber.values()].sort(compareHints);
}

export function learnedProductSearchQueries(
  hints: readonly LearnedProductSearchHint[],
  maxQueries = 2
) {
  const safeLimit = Math.max(0, Math.min(5, Math.floor(maxQueries)));
  return hints.slice(0, safeLimit).map((hint) => hint.productNumber);
}

/**
 * Confirmed history is a tie-breaker between already ranked public-catalog
 * results. It never changes the technical score, recommendation, warnings,
 * source or exact/green status.
 */
export function applyLearnedProductEvidence(
  candidates: readonly AhlsellPublicCandidate[],
  hints: readonly LearnedProductSearchHint[]
) {
  const hintsByProductNumber = new Map(
    hints.map((hint) => [normalizeProductNumber(hint.productNumber), hint])
  );

  return orderAhlsellCandidatesForDisplay(candidates.map((candidate) => {
    const hint = hintsByProductNumber.get(normalizeProductNumber(candidate.articleNumber));
    if (!hint) return candidate;

    const hasTechnicalConflict = (candidate.matchWarnings?.length ?? 0) > 0;
    const historyReason = hasTechnicalConflict
      ? "Produkten har valts tidigare för ett liknande krav, men den aktuella tekniska kontrollen visar en avvikelse."
      : hint.exactFingerprint
        ? "Produkten har tidigare bekräftats för samma tekniska krav i organisationen."
        : "Produkten har tidigare bekräftats för ett tekniskt liknande krav i organisationen.";
    const matchReasons = uniqueText([...(candidate.matchReasons ?? []), historyReason]);
    return {
      ...candidate,
      matchReasons,
      learningEvidence: {
        kind: "similar_confirmed" as const,
        supportCount: hint.supportCount,
        similarityScore: hint.matchScore
      }
    };
  }));
}

function memorySpecificationLines(snapshotValue: unknown) {
  const snapshot = record(snapshotValue);
  const value = record(snapshot.value);
  const attributes = record(value.attributes);
  return uniqueText([
    cleanText(snapshot.valueText),
    labelledValue("System", value.system),
    labelledValue("Operation", value.operation),
    labelledValue("Unit", value.unit),
    ...Object.entries(attributes).flatMap(([key, attributeValue]) => {
      const valueText = scalarText(attributeValue);
      return valueText ? [`${key}: ${valueText}`] : [];
    })
  ]);
}

function historicalRequirementLabel(
  memory: DistributorProductMemoryEvidence,
  valueText: string
) {
  const family = ({
    sprinkler_head: "Sprinklerhode",
    sprinkler_hose: "Sprinklerslange",
    pipe: "Sprinklerrør",
    fitting: "Rørdel",
    valve: "Ventil",
    support: "Røroppheng",
    control: "Sprinklerkomponent"
  } as Record<string, string>)[normalizedCategory(memory.requirement_category)] ?? "Teknisk produkt";
  return `${family} ${valueText}`.trim();
}

function labelledValue(label: string, value: unknown) {
  const valueText = scalarText(value);
  return valueText ? `${label}: ${valueText}` : "";
}

function scalarText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(scalarText).filter(Boolean).join(" ");
  return "";
}

function flattenText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(flattenText).join(" ");
  }
  return "";
}

function compareHints(left: LearnedProductSearchHint, right: LearnedProductSearchHint) {
  return Number(right.exactFingerprint) - Number(left.exactFingerprint)
    || right.matchScore - left.matchScore
    || right.usageCount - left.usageCount
    || left.productName.localeCompare(right.productName, "sv");
}

function normalizedCategory(value: unknown) {
  return cleanText(value).toLocaleLowerCase("sv-SE").replace(/[^a-z0-9_-]/g, "");
}

function normalizeProductNumber(value: string) {
  return value.toLocaleLowerCase("sv-SE").replace(/[^a-z0-9]/g, "");
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : 1;
}

function uniqueText(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
