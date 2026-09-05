import catalogData from "@/data/ahlsell-mldl-catalog.json";
import { orderAhlsellCandidatesForDisplay, rankAhlsellCandidates } from "@/lib/ahlsell-candidate-ranking";
import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";

export type AhlsellMldlProduct = (typeof catalogData.products)[number];

export const AHLSELL_MLDL_CATALOG_VERSION = catalogData.catalogVersion;
export const AHLSELL_MLDL_PRODUCT_COUNT = catalogData.productCount;

const productsByArticle = new Map(
  catalogData.products.map((product) => [normalizeArticle(product.articleNumber), product])
);

export function ahlsellMldlProduct(articleNumber: string) {
  return productsByArticle.get(normalizeArticle(articleNumber)) ?? null;
}

export function ahlsellMldlProducts() {
  return catalogData.products as readonly AhlsellMldlProduct[];
}

/**
 * Ranks the complete MLDL assortment with the same technical rules as live
 * Ahlsell results. A narrow catalogue-type filter prevents similarly sized,
 * but technically unrelated, products from becoming candidates.
 */
export function findAhlsellMldlCandidates(
  requirement: Record<string, unknown>,
  limit = 50
): AhlsellPublicCandidate[] {
  const requirementText = normalizedRequirementText(requirement);
  const expectedTypes = expectedCatalogTypes(requirementText);
  const explicitArticles = new Set(articleNumbers(requirementText));
  const explicitModels = new Set(modelNumbers(requirementText));
  const pool = catalogData.products.filter((product) => {
    if (explicitArticles.has(normalizeArticle(product.articleNumber))) return true;
    if (product.model && modelNumbers(product.model).some((model) => explicitModels.has(model))) return true;
    if (expectedTypes.size > 0) return expectedTypes.has(product.productType);
    return true;
  });

  const productsByCandidateArticle = new Map(pool.map((product) => [
    normalizeArticle(product.articleNumber),
    product
  ]));
  const ranked = rankAhlsellCandidates(requirement, pool.map(catalogCandidate))
    .map((candidate) => boostStructuredCatalogEvidence(
      candidate,
      productsByCandidateArticle.get(normalizeArticle(candidate.articleNumber)),
      requirementText,
      explicitArticles,
      explicitModels,
      expectedTypes
    ))
    .filter((candidate) => candidate.recommendation !== "unlikely");

  return orderAhlsellCandidatesForDisplay(ranked).slice(0, Math.max(1, limit));
}

function catalogCandidate(product: AhlsellMldlProduct): AhlsellPublicCandidate {
  const searchUrl = new URL("https://www.ahlsell.no/search");
  searchUrl.searchParams.set("parameters.SearchPhrase", product.articleNumber);
  const verifiedEvidence = verifiedVictaulicEvidence(product);
  return {
    articleNumber: product.articleNumber,
    productName: product.productName,
    manufacturer: product.manufacturer,
    productUrl: product.sourceUrl || searchUrl.toString(),
    description: verifiedEvidence?.description ?? product.productName,
    specifications: compact([
      ...(verifiedEvidence?.specifications ?? []),
      `Produkttyp ${product.productTypeLabel}`,
      product.model ? `Modell ${product.model}` : null,
      product.nominalSize ? `Nominell dimension ${product.nominalSize}` : null,
      ...product.dnValues.map((value) => `DN${value}`),
      ...product.outsideDiametersMm.map((value) => `${value} mm`),
      ...product.lengthsMm.map((value) => `Längd ${value} mm`),
      product.angleDeg === null ? null : `${product.angleDeg}°`,
      product.kFactor === null ? null : `K${product.kFactor}`,
      product.temperatureC === null ? null : `${product.temperatureC}°C`,
      product.response,
      product.orientation,
      product.mount,
      product.headConstruction,
      product.coverage,
      product.finish,
      product.bodyMaterial,
      product.gasketMaterial,
      product.coating,
      product.pressureClass,
      product.connection,
      product.systemCondition,
      ...product.locations.map((location) => `Lagerplats ${location}`)
    ]),
    source: "structured_database",
    exactMatch: false,
    evidenceSources: verifiedEvidence
      ? ["mldl_database", "victaulic_verified"]
      : ["mldl_database"],
    verifiedAt: verifiedEvidence?.verifiedAt
  };
}

function verifiedVictaulicEvidence(product: AhlsellMldlProduct) {
  if (product.productType !== "butterfly_valve" || !/\bspjeldventil 705 - fire\b/i.test(product.productName)) {
    return null;
  }
  return {
    description: "Victaulic FireLock Series 705 spjällventil, övervakad i öppet läge, med växlad handratt och OGS-rillanslutning.",
    specifications: [
      "Victaulic Series 705",
      "Supervised open / övervakad öppen",
      "Manuell växlad handratt",
      "Mjuk, kontrollerad stängning",
      "Hus och spjällskiva av duktilt gjutjärn",
      "Victaulic OGS rillanslutning",
      "Maximalt arbetstryck 21 bar",
      "Avsedd för brandskyddssystem"
    ],
    verifiedAt: "2026-09-05"
  };
}

function boostStructuredCatalogEvidence(
  candidate: AhlsellPublicCandidate,
  product: AhlsellMldlProduct | undefined,
  requirementText: string,
  explicitArticles: Set<string>,
  explicitModels: Set<string>,
  expectedTypes: Set<string>
): AhlsellPublicCandidate {
  if (!product) return candidate;
  const reasons = [...(candidate.matchReasons ?? [])];
  let score = candidate.matchScore ?? 0;
  const articleMatch = explicitArticles.has(normalizeArticle(product.articleNumber));
  const modelMatch = Boolean(product.model)
    && modelNumbers(product.model ?? "").some((model) => explicitModels.has(model));
  const typeMatch = expectedTypes.has(product.productType);
  const tokenMatches = discriminatingTokens(product.searchText)
    .filter((token) => requirementText.includes(token))
    .length;

  if (articleMatch) {
    score = 100;
    reasons.unshift("NRF-/artikelnumret finns i hela Ahlsell MLDL-databasen.");
  } else {
    if (modelMatch) {
      score += 25;
      reasons.push("Modellbeteckningen stämmer med Ahlsell MLDL-databasen.");
    }
    if (typeMatch) {
      score += 15;
      reasons.push("Produkttypen stämmer med den strukturerade MLDL-posten.");
    }
    if (tokenMatches >= 2) {
      score += Math.min(12, tokenMatches * 2);
      reasons.push("Flera tekniska sökord stämmer med MLDL-beskrivningen.");
    }
  }

  score = Math.max(0, Math.min(100, score));
  const warnings = candidate.matchWarnings ?? [];
  const recommendation = score >= 75 && warnings.length === 0
    ? "recommended"
    : score >= 35 ? "possible" : "unlikely";
  return {
    ...candidate,
    matchScore: score,
    matchReasons: unique(reasons),
    recommendation,
    exactMatch: candidate.exactMatch === true || (
      articleMatch && warnings.length === 0
    )
  };
}

function expectedCatalogTypes(value: string) {
  const types = new Set<string>();
  const add = (...values: string[]) => values.forEach((item) => types.add(item));
  if (/\bub1[.]3311[a-z0-9]*\b/.test(value)) {
    add("sprinkler_hose");
    return types;
  }
  if (/\b(dekkskiv|dekkplate|pyntering|rosett|escutcheon|cover plate|sprinklergitter|sprinklerskap|nokkel)\b/.test(value)) add("sprinkler_accessory");
  else if (/\b(sprinklerslange|sprinkler slange|fleksibelslange|flexislange|flexible sprinkler hose|braided hose|vicflex|dryflex)\b/.test(value)) add("sprinkler_hose");
  else if (/\b(sprinklerhode|sprinkler head|sprinklerhuvud|sprinkelhode|k faktor)\b/.test(value)) add("sprinkler_head");
  if (/\b(anboringsklammer|anboring|avstikk|branch outlet)\b/.test(value)) add("branch_outlet");
  if (/\b(reduksjonskupling|reducing coupling)\b/.test(value)) add("reducer_coupling");
  else if (/\b(kupling|kobling|coupling|rillekobling)\b/.test(value)) add("coupling");
  if (/\b(bend|albue|elbow|rorboy)\b/.test(value)) add("bend");
  if (/\b(sprinkler t|sprinkler tee)\b/.test(value)) add("sprinkler_tee");
  else if (/\b(t ror|tee|grenror|avgrening)\b/.test(value)) add("tee");
  if (/\b(reduksjon|reducer|overgang|dimensjonsovergang)\b/.test(value)) add("reducer", "reducer_coupling");
  if (/\b(endelokk|end cap|blindlokk|plugg)\b/.test(value)) add("end_cap");
  if (/\b(droppnippel|drop nipple)\b/.test(value)) add("drop_nipple");
  else if (/\b(rorstuss|pipe nipple|nippel)\b/.test(value)) add("pipe_nipple");
  if (/\b(pakning|gasket|tetningsring)\b/.test(value)) add("gasket");
  if (/\b(flensadapter|flange adapter|flenseadapter)\b/.test(value)) add("flange_adapter");
  else if (/\b(flens|flange)\b/.test(value)) add("flange");
  if (/\b(spjeldventil|butterfly valve)\b/.test(value)) add("butterfly_valve");
  if (/\b(kuleventil|ball valve)\b/.test(value)) add("ball_valve");
  if (/\b(tilbakeslagsventil|check valve|backventil)\b/.test(value)) add("check_valve");
  if (/\b(sprinklersentral|alarmventil|alarm valve)\b/.test(value)) add("alarm_valve_station");
  if (/\b(flow switch|flowvakt|stromningsvakt)\b/.test(value)) add("flow_switch");
  if (/\b(pressostat|trykkvakt|pressure switch)\b/.test(value)) add("pressure_switch");
  if (/\b(trim sett|trim kit|alarmkit|dren sett|drain kit)\b/.test(value)) add("trim_kit");
  if (/\b(akselerator|accelerator)\b/.test(value)) add("accelerator");
  if (/\b(sprinkelklokke|alarmklokke|alarm bell)\b/.test(value)) add("alarm_bell");
  if (/\b(y filter|silventil|strainer)\b/.test(value)) add("strainer");
  if (/\b(feste|brakett|bracket|oppheng|support)\b/.test(value)) add("support_bracket");
  if (/\b(smoremiddel|lubricant)\b/.test(value)) add("lubricant");
  if (/\b(rillemaskin|verktoy|tool)\b/.test(value)) add("tool");
  if (/\b(rillede ror|stalror|sprinklerror|pipe length)\b/.test(value)) add("pipe");
  return types;
}

function normalizedRequirementText(requirement: Record<string, unknown>) {
  return normalize(flatten(requirement));
}

function flatten(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(" ");
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(flatten).join(" ");
  return "";
}

function normalize(value: string) {
  return value.toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9.,/]+/g, " ")
    .replace(/(\d),(\d)/g, "$1.$2")
    .trim();
}

function articleNumbers(value: string) {
  return [...value.matchAll(/\b(?:nrf|art(?:ikel)?(?:nummer)?|article)?\s*[:#-]?\s*([0-9]{6,9}[a-z0-9]*)\b/g)]
    .map((match) => normalizeArticle(match[1]));
}

function modelNumbers(value: string) {
  return [...value.matchAll(/\b(?:v|d|f|e|s|ab|vb|ah|aqf|st|ps|vsr)\s*-?\s*\d{1,5}[a-z]*\b/gi)]
    .map((match) => match[0].replace(/[^a-z0-9]/gi, "").toUpperCase());
}

function discriminatingTokens(value: string) {
  const ignored = new Set(["victaulic", "fire", "vks", "nrf", "nummer", "produkt", "dn"]);
  return unique(normalize(value).split(" "))
    .filter((token) => token.length >= 4 && !ignored.has(token) && !/^\d+$/.test(token));
}

function normalizeArticle(value: string) {
  return value.toLocaleLowerCase("sv-SE").replace(/[^a-z0-9]/g, "");
}

function compact(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function unique(values: string[]) {
  return [...new Set(values)];
}
