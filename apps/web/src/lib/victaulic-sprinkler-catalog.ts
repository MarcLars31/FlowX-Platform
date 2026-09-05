import catalogJson from "@/data/victaulic-sprinkler-catalog.json";
import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";
import {
  sprinklerCoverageFromText,
  sprinklerCoverageMatches,
  sprinklerKFactorMatches,
  sprinklerSystemRestriction,
  type SprinklerCoverageClass
} from "@/lib/sprinkler-technical-rules";

export type VictaulicSprinklerCoverage = SprinklerCoverageClass | null;

export type VictaulicSprinklerCatalogQuery = {
  market: "no" | "se";
  model: string | null;
  kFactor: number | null;
  dn: number | null;
  temperatureC: number | null;
  response: "quick" | "standard" | null;
  orientation: "pendent" | "upright" | "sidewall" | null;
  mount: "recessed" | "concealed" | null;
  visibleMount: boolean;
  sprinklerSystem: "wet" | "dry" | null;
  sprinklerHeadType: "standard" | "dry" | "open" | null;
  coverage: VictaulicSprinklerCoverage;
  finish: "brass" | "white" | "black" | "chrome" | null;
  requiresAccessoryReview: boolean;
};

type CatalogProduct = (typeof catalogJson.products)[number];
type EvaluatedCandidate = {
  candidate: AhlsellPublicCandidate;
  eligibleForExact: boolean;
};

export const VICTAULIC_SPRINKLER_CATALOG_VERSION = catalogJson.catalogVersion;
export const VICTAULIC_SPRINKLER_CATALOG_COUNT = catalogJson.rowCount;
export const VICTAULIC_SPRINKLER_EXACT_SIN_COUNT = catalogJson.exactSinCount;
export const VICTAULIC_SPRINKLER_CATALOG_SOURCE_SHA256 = catalogJson.sourceSha256;

export function findVictaulicSprinklerCandidates(
  query: VictaulicSprinklerCatalogQuery
): AhlsellPublicCandidate[] {
  if (query.kFactor === null || query.dn === null) return [];

  const evaluated = catalogJson.products
    .map((product) => evaluateCatalogProduct(product, query))
    .filter((value): value is EvaluatedCandidate => value !== null)
    .sort((left, right) =>
      Number(right.eligibleForExact) - Number(left.eligibleForExact)
      || (right.candidate.matchScore ?? 0) - (left.candidate.matchScore ?? 0)
      || left.candidate.productName.localeCompare(right.candidate.productName, "sv")
    );

  const exactCandidates = evaluated.filter((value) => value.eligibleForExact);
  const ambiguous = exactCandidates.length > 1;
  const candidates = evaluated.map(({ candidate, eligibleForExact }) => {
    if (!eligibleForExact) return candidate;
    if (!ambiguous) return { ...candidate, exactMatch: true, recommendation: "recommended" as const };
    return {
      ...candidate,
      exactMatch: false,
      recommendation: "possible" as const,
      matchWarnings: [
        ...(candidate.matchWarnings ?? []),
        "Flera verifierade artiklar uppfyller de angivna värdena. Ange variantens återstående egenskaper innan automatiskt val."
      ]
    };
  });

  return candidates.slice(0, 12);
}

function evaluateCatalogProduct(
  product: CatalogProduct,
  query: VictaulicSprinklerCatalogQuery
): EvaluatedCandidate | null {
  if (query.kFactor === null || query.dn === null) return null;
  if (!kFactorMatches(product, query.kFactor) || product.dn !== query.dn) return null;
  if (query.model && normalize(product.model) !== normalize(query.model)) return null;

  const candidateHeadType = headType(product);
  if (query.sprinklerHeadType && candidateHeadType !== query.sprinklerHeadType) return null;
  if (query.visibleMount && productIsConcealed(product)) return null;
  if (!coverageMatches(product, query.coverage)) return null;
  if (!systemMatches(product, query.sprinklerSystem)) return null;

  let score = 65;
  const reasons = [
    `Verifierad Victaulic-modell ${product.model} med Ahlsell-artikel ${product.articleNumber}.`,
    `K-faktor och anslutning motsvarar K${formatNumber(query.kFactor)} / DN${query.dn}.`
  ];
  const warnings: string[] = [];

  score += compareNumber(
    query.temperatureC,
    product.temperatureC,
    10,
    "Utlösningstemperaturen stämmer.",
    "Utlösningstemperaturen stämmer inte med specifikationen.",
    reasons,
    warnings
  );
  score += compareText(
    query.response,
    normalizedResponse(product.officialResponse ?? product.response),
    8,
    "Responstiden stämmer.",
    "Responstiden stämmer inte med specifikationen.",
    reasons,
    warnings
  );
  score += compareText(
    query.orientation,
    normalizedOrientation(product.officialOrientation ?? product.orientation),
    8,
    "Monteringsriktningen stämmer.",
    "Monteringsriktningen stämmer inte med specifikationen.",
    reasons,
    warnings
  );
  score += compareMount(product, query.mount, reasons, warnings);
  score += compareText(
    query.finish,
    normalizedFinish(product.finish),
    4,
    "Färg eller ytfinish stämmer.",
    "Färg eller ytfinish stämmer inte med specifikationen.",
    reasons,
    warnings
  );

  const trustedRow = product.victaulicVerification === "Verified by exact SIN"
    && product.dataStatus === "Victaulic verified"
    && !product.reviewFlags;
  if (!trustedRow) {
    warnings.push(product.reviewFlags
      ? `Databasraden kräver kontroll: ${product.reviewFlags}`
      : "Databasraden är inte slutligt verifierad och får inte väljas automatiskt.");
  }
  if (query.requiresAccessoryReview) {
    warnings.push("Specifikationen kräver ett tillbehör eller skydd som måste kontrolleras mot sprinklerhuvudets exakta utförande.");
  }

  const hasRequiredVariantEvidence = query.sprinklerHeadType === "open"
    ? query.kFactor !== null && query.dn !== null
    : query.kFactor !== null
      && query.dn !== null
      && query.temperatureC !== null
      && query.response !== null
      && query.orientation !== null;
  const eligibleForExact = trustedRow
    && query.sprinklerHeadType !== null
    && query.sprinklerHeadType === "standard"
    && query.sprinklerSystem === "wet"
    && query.coverage === "standard"
    && query.mount === null
    && !query.requiresAccessoryReview
    && hasRequiredVariantEvidence
    && warnings.length === 0;
  const matchScore = Math.max(0, Math.min(100, score - warnings.length * 8));

  return {
    eligibleForExact,
    candidate: {
      articleNumber: product.articleNumber,
      productName: product.productDescription,
      manufacturer: "Victaulic",
      productUrl: ahlsellSearchUrl(query.market, product.articleNumber),
      description: `${product.officialFamily ?? product.model}. ${product.applicationHazard ?? ""}`.trim(),
      specifications: catalogSpecifications(product),
      source: "verified_database",
      verifiedAt: catalogJson.catalogVersion,
      exactMatch: false,
      matchScore,
      matchReasons: reasons,
      matchWarnings: warnings,
      recommendation: warnings.length === 0 ? "possible" : matchScore >= 50 ? "possible" : "unlikely",
      familyCode: product.model
    }
  };
}

function productIsConcealed(product: CatalogProduct) {
  return /\b(concealed|skjult|dold)\b/.test(normalize(
    `${product.mount ?? ""} ${product.headConstruction ?? ""} ${product.productDescription}`
  ));
}

function kFactorMatches(product: CatalogProduct, required: number) {
  const aliases = [
    product.kFactorCatalog,
    product.kFactorSi,
    product.kFactorSi === null ? null : product.kFactorSi * 10,
    product.kFactorImperial
  ].filter((value): value is number => value !== null);
  return aliases.some((alias) => sprinklerKFactorMatches(required, alias));
}

function headType(product: CatalogProduct): "standard" | "dry" | "open" {
  const value = normalize(`${product.headConstruction ?? ""} ${product.applicationHazard ?? ""}`);
  if (/\b(dry|torr)\b/.test(value)) return "dry";
  if (/\b(open|apen|directional)\b/.test(value)) return "open";
  return "standard";
}

function coverageMatches(product: CatalogProduct, required: VictaulicSprinklerCoverage) {
  if (!required) return true;
  return sprinklerCoverageMatches(
    required,
    sprinklerCoverageFromText(`${product.coverage ?? ""} ${product.applicationHazard ?? ""}`)
  );
}

function systemMatches(product: CatalogProduct, required: VictaulicSprinklerCatalogQuery["sprinklerSystem"]) {
  if (!required) return true;
  const restriction = sprinklerSystemRestriction(product.systemCondition ?? "");
  return !(required === "dry" && restriction === "wet_only")
    && !(required === "wet" && restriction === "dry_only");
}

function compareNumber(
  required: number | null,
  actual: number | null,
  points: number,
  reason: string,
  warning: string,
  reasons: string[],
  warnings: string[]
) {
  if (required === null) return 0;
  if (actual !== null && Math.abs(required - actual) < 0.11) {
    reasons.push(reason);
    return points;
  }
  warnings.push(actual === null ? `${warning} Databasvärdet saknas.` : warning);
  return -points;
}

function compareText<T extends string>(
  required: T | null,
  actual: T | null,
  points: number,
  reason: string,
  warning: string,
  reasons: string[],
  warnings: string[]
) {
  if (required === null) return 0;
  if (actual === required) {
    reasons.push(reason);
    return points;
  }
  warnings.push(actual === null ? `${warning} Databasvärdet saknas.` : warning);
  return -points;
}

function compareMount(
  product: CatalogProduct,
  required: VictaulicSprinklerCatalogQuery["mount"],
  reasons: string[],
  warnings: string[]
) {
  if (required === null) return 0;
  const options = normalize(`${product.mount ?? ""} ${product.officialMountOptions ?? ""}`);
  const matches = required === "concealed"
    ? /\bconcealed\b/.test(options)
    : /\brecessed\b/.test(options);
  if (matches) {
    reasons.push(required === "concealed"
      ? "Victaulic dokumenterar concealed-montage för modellen."
      : "Victaulic dokumenterar recessed-montage för modellen.");
    return 8;
  }
  warnings.push(required === "concealed"
    ? "Victaulic-data bekräftar inte concealed-montage för modellen."
    : "Victaulic-data bekräftar inte recessed-montage för modellen.");
  return -8;
}

function normalizedResponse(value: string | null): VictaulicSprinklerCatalogQuery["response"] {
  const normalized = normalize(value ?? "");
  if (/\b(qr|quick)\b/.test(normalized)) return "quick";
  if (/\b(sr|standard)\b/.test(normalized)) return "standard";
  return null;
}

function normalizedOrientation(value: string | null): VictaulicSprinklerCatalogQuery["orientation"] {
  const normalized = normalize(value ?? "");
  if (/\b(sidewall|hsw|horizontal)\b/.test(normalized)) return "sidewall";
  if (/\b(pendent|pendant|ssp)\b/.test(normalized)) return "pendent";
  if (/\b(upright|ssu)\b/.test(normalized)) return "upright";
  return null;
}

function normalizedFinish(value: string | null): VictaulicSprinklerCatalogQuery["finish"] {
  const normalized = normalize(value ?? "");
  if (/\b(white|hvit|vit)\b/.test(normalized)) return "white";
  if (/\b(black|sort|svart)\b/.test(normalized)) return "black";
  if (/\b(chrome|krom)\b/.test(normalized)) return "chrome";
  if (/\b(brass|messing|mess)\b/.test(normalized)) return "brass";
  return null;
}

function catalogSpecifications(product: CatalogProduct) {
  return [
    `SIN ${product.model}`,
    product.kFactorCatalog === null ? null : `K${formatNumber(product.kFactorCatalog)}`,
    product.dn === null ? null : `DN${product.dn}`,
    product.temperatureC === null ? null : `${formatNumber(product.temperatureC)}°C`,
    product.officialResponse,
    product.officialOrientation,
    product.officialMountOptions,
    product.headConstruction,
    product.coverage,
    product.finish,
    product.officialConnection,
    product.applicationHazard,
    product.systemCondition,
    product.victaulicPublication ? `Victaulic publication ${product.victaulicPublication}` : null,
    product.victaulicSourceUrl,
    ...product.matchingAliases
  ].filter((value): value is string => Boolean(value));
}

function ahlsellSearchUrl(market: "no" | "se", articleNumber: string) {
  const url = new URL(market === "no" ? "https://www.ahlsell.no/search" : "https://www.ahlsell.se/search");
  url.searchParams.set("parameters.SearchPhrase", articleNumber);
  return url.toString();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}
