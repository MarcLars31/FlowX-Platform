export const DEMO_MATCHING_DISCLAIMER =
  "Demo data – ej verifierad för projektering, installation eller inköp.";

export type ProjectRequirementForMatching = {
  id: string;
  category: string;
  requirement_key: string;
  value_text: string | null;
  value_json: Record<string, unknown>;
  status: string;
};

export type DemoCatalogCandidate = {
  productId: string;
  variantId: string;
  productNumber: string;
  productName: string;
  variantName: string | null;
  sku: string | null;
  manufacturer: string;
  kFactorMetric: number | null;
  temperatureRatingC: number | null;
  maximumWorkingPressureBar: number | null;
  responseType: string | null;
  orientation: string | null;
  connectionSize: string | null;
  finish: string | null;
  approvals: string[];
  distributor?: string | null;
  distributorSku?: string | null;
  price?: number | null;
  currency?: string | null;
  stockStatus?: string | null;
  stockQuantity?: number | null;
  leadTimeDays?: number | null;
};

export type DemoProductMatch = {
  requirementId: string;
  candidate: DemoCatalogCandidate;
  technicalScore: number;
  preferredManufacturer: boolean;
  checks: string[];
  reason: string;
};

type RequirementProfile = {
  operation: string | null;
  kFactorMetric: number | null;
  temperatureRatingC: number | null;
  minimumWorkingPressureBar: number | null;
  responseType: string | null;
  orientation: string | null;
  connectionSize: string | null;
};

export function matchDemoProducts(
  requirements: ProjectRequirementForMatching[],
  catalog: DemoCatalogCandidate[],
  options: {
    preferredManufacturer?: string | null;
    preferredManufacturerOnly?: boolean;
    maxPerRequirement?: number;
  } = {}
) {
  const matches: DemoProductMatch[] = [];
  const skippedRequirementIds: string[] = [];
  const maxPerRequirement = options.maxPerRequirement ?? 5;

  for (const requirement of requirements) {
    const profile = requirementProfile(requirement);
    if (profile.operation === "remove") {
      skippedRequirementIds.push(requirement.id);
      continue;
    }

    const checks = requirementChecks(profile);
    if (checks.length === 0 || !isSprinklerRequirement(requirement)) {
      skippedRequirementIds.push(requirement.id);
      continue;
    }

    const candidates = catalog
      .filter((candidate) => passesTechnicalGate(profile, candidate))
      .filter((candidate) =>
        !options.preferredManufacturerOnly
        || !options.preferredManufacturer
        || sameText(candidate.manufacturer, options.preferredManufacturer)
      )
      .map((candidate) => ({
        requirementId: requirement.id,
        candidate,
        technicalScore: 100,
        preferredManufacturer: Boolean(
          options.preferredManufacturer
          && sameText(candidate.manufacturer, options.preferredManufacturer)
        ),
        checks,
        reason: `Tekniskt godkänd mot ${checks.join(", ")}. Kommersiella val påverkar inte den tekniska kontrollen.`
      }))
      .sort(compareMatches)
      .slice(0, maxPerRequirement);

    matches.push(...candidates);
  }

  return { matches, skippedRequirementIds };
}

function requirementProfile(requirement: ProjectRequirementForMatching): RequirementProfile {
  const value = isRecord(requirement.value_json) ? requirement.value_json : {};
  const attributes = isRecord(value.attributes) ? value.attributes : {};

  return {
    operation: normalizeOperation(text(value.operation)),
    kFactorMetric: numberFrom(attribute(attributes, ["k-faktor", "k faktor", "k_factor", "kfactor"])),
    temperatureRatingC: numberFrom(attribute(attributes, [
      "utløsningstemperatur", "utlosningstemperatur", "utlösningstemperatur",
      "temperature", "temperatur"
    ])),
    minimumWorkingPressureBar: numberFrom(attribute(attributes, ["trykk", "pressure", "driftstryck"])),
    responseType: normalizeResponse(text(attribute(attributes, [
      "følsomhetsgrad", "folsomhetsgrad", "känslighetsgrad", "response type"
    ]))),
    orientation: normalizeOrientation(text(attribute(attributes, [
      "plassering", "placering", "orientation", "orientering"
    ]))),
    connectionSize: normalizeDn(text(attribute(attributes, [
      "gjengedimensjon (dn)", "gjengedimensjon", "anslutning", "connection size", "dn"
    ])))
  };
}

function requirementChecks(profile: RequirementProfile) {
  const checks: string[] = [];
  if (profile.kFactorMetric !== null) checks.push(`K${formatNumber(profile.kFactorMetric)}`);
  if (profile.temperatureRatingC !== null) checks.push(`${formatNumber(profile.temperatureRatingC)} °C`);
  if (profile.minimumWorkingPressureBar !== null) checks.push(`minst ${formatNumber(profile.minimumWorkingPressureBar)} bar`);
  if (profile.connectionSize) checks.push(profile.connectionSize);
  if (profile.orientation) checks.push(orientationLabel(profile.orientation));
  if (profile.responseType) checks.push(profile.responseType === "quick" ? "snabb respons" : "standardrespons");
  return checks;
}

function passesTechnicalGate(profile: RequirementProfile, candidate: DemoCatalogCandidate) {
  if (profile.kFactorMetric !== null && !nearlyEqual(candidate.kFactorMetric, profile.kFactorMetric)) return false;
  if (profile.temperatureRatingC !== null && !nearlyEqual(candidate.temperatureRatingC, profile.temperatureRatingC)) return false;
  if (
    profile.minimumWorkingPressureBar !== null
    && (candidate.maximumWorkingPressureBar === null
      || candidate.maximumWorkingPressureBar < profile.minimumWorkingPressureBar)
  ) return false;
  if (profile.connectionSize && normalizeDn(candidate.connectionSize) !== profile.connectionSize) return false;
  if (profile.orientation && normalizeOrientation(candidate.orientation) !== profile.orientation) return false;
  if (profile.responseType && normalizeResponse(candidate.responseType) !== profile.responseType) return false;
  return true;
}

function compareMatches(left: DemoProductMatch, right: DemoProductMatch) {
  if (left.preferredManufacturer !== right.preferredManufacturer) {
    return left.preferredManufacturer ? -1 : 1;
  }
  const leftStock = left.candidate.stockStatus === "in_stock" ? 1 : 0;
  const rightStock = right.candidate.stockStatus === "in_stock" ? 1 : 0;
  if (leftStock !== rightStock) return rightStock - leftStock;
  const leftPrice = left.candidate.price ?? Number.POSITIVE_INFINITY;
  const rightPrice = right.candidate.price ?? Number.POSITIVE_INFINITY;
  if (leftPrice !== rightPrice) return leftPrice - rightPrice;
  return left.candidate.productName.localeCompare(right.candidate.productName, "sv");
}

function isSprinklerRequirement(requirement: ProjectRequirementForMatching) {
  const value = `${requirement.category} ${requirement.requirement_key} ${requirement.value_text ?? ""}`.toLowerCase();
  return value.includes("sprinkler") || value.includes("ue2.");
}

function attribute(attributes: Record<string, unknown>, aliases: string[]) {
  for (const [key, value] of Object.entries(attributes)) {
    const normalizedKey = normalizeKey(key);
    if (aliases.some((alias) => normalizedKey === normalizeKey(alias))) return value;
  }
  return null;
}

function normalizeKey(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function numberFrom(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOperation(value: string | null) {
  if (!value) return null;
  const normalized = normalizeKey(value);
  if (["remove", "demontering", "demontera", "rivning"].some((item) => normalized.includes(item))) return "remove";
  if (["install", "montering", "montera"].some((item) => normalized.includes(item))) return "install";
  return normalized;
}

function normalizeResponse(value: string | null) {
  if (!value) return null;
  const normalized = normalizeKey(value).replaceAll("_", " ");
  if (normalized.includes("kvikk") || normalized.includes("quick") || normalized.includes("snabb")) return "quick";
  if (normalized.includes("standard")) return "standard";
  return normalized.replaceAll(" ", "_");
}

function normalizeOrientation(value: string | null) {
  if (!value) return null;
  const normalized = normalizeKey(value).replaceAll("_", " ");
  if (normalized.includes("hengende") || normalized.includes("pendent") || normalized.includes("pendant")) return "pendent";
  if (normalized.includes("staende") || normalized.includes("stående") || normalized.includes("upright")) return "upright";
  if (normalized.includes("sidewall") || normalized.includes("sidovagg") || normalized.includes("sidovägg")) return "horizontal_sidewall";
  if (normalized.includes("innfelt") || normalized.includes("recessed")) return "recessed_pendent";
  if (normalized.includes("concealed") || normalized.includes("dold")) return "concealed_pendent";
  return normalized.replaceAll(" ", "_");
}

function normalizeDn(value: string | null) {
  if (!value) return null;
  const match = value.toUpperCase().match(/DN\s*(\d+)/);
  return match ? `DN${match[1]}` : value.toUpperCase().replace(/\s+/g, "");
}

function nearlyEqual(left: number | null, right: number) {
  return left !== null && Math.abs(left - right) <= 0.01;
}

function sameText(left: string, right: string) {
  return normalizeKey(left) === normalizeKey(right);
}

function orientationLabel(value: string) {
  return value === "upright" ? "stående"
    : value === "pendent" ? "hängande"
      : value.replaceAll("_", " ");
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
