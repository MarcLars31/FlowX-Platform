import {
  MAX_SUPPORTED_SPRINKLER_K_FACTOR,
  parseSprinklerKFactor,
  projectRequirementDataWarnings,
  projectRequirementKFactorDisplayValue
} from "@/lib/project-requirement-data-warnings";
import { productRequirementCategory } from "@/lib/product-requirement-category";

export type SprsokTechnicalRow = {
  id: number | string;
  sin: string | null;
  leverandor: string | null;
  type: string | null;
  utforelse: string | null;
  k_verdi: string | null;
  rti: string | null;
  datablad: string | null;
};

export type SprsokTechnicalReference = {
  sourceId: string;
  sin: string;
  supplier: string;
  productType: string;
  execution: string;
  kValue: string;
  rti: string;
  datasheetUrl: string;
  score: number;
  matchedFields: string[];
  ahlsellSearchQuery: string;
  queryEligible: boolean;
};

type Orientation = "upright" | "pendent" | "sidewall";
type ResponseClass = "quick" | "standard";

type RequirementProfile = {
  normalizedText: string;
  kFactor: number;
  orientation: Orientation | null;
  response: ResponseClass | null;
  modelTokens: string[];
  traits: ApplicationTraits;
};

type ApplicationTraits = {
  dry: boolean;
  residential: boolean;
  extendedCoverage: boolean;
  concealed: boolean;
  esfr: boolean;
  standardCoverage: boolean;
  visible: boolean;
};

const ACCESSORY_OR_NON_HEAD = /\b(?:sprinklergitter|beskyttelsesgitter|skyddskorg|dekkskive|rosett|tillbehor|tilbehor|accessor|hand(?:slokker|slackare)|brannslukker|brandslackare|skumslukker|foam extinguisher|rorledning|sprinklerror|kupling|ventil)\b/;
const ACCESSORY_OR_NON_HEAD_AT_START = /^(?:sprinklergitter|beskyttelsesgitter|skyddskorg|dekkskive|rosett|tillbehor|tilbehor|accessor|hand(?:slokker|slackare)|brannslukker|brandslackare|skumslukker|foam extinguisher|rorledning|sprinklerror|kupling|ventil)\b/;
const QUICK_RESPONSE = /\b(?:qr|quick[ -]?response|kvikk[ -]?respons|hurtig[ -]?respons|rask[ -]?respons|snabb[ -]?respons)\b/;
const STANDARD_RESPONSE = /\b(?:sr|standard[ -]?(?:response|respons)|normal[ -]?(?:response|respons))\b/;
const UPRIGHT = /\b(?:upright|staende|oppadrettet|oppvendt|ssu)\b/;
const PENDENT = /\b(?:pendent|hengende|hangande|nedadrettet|nedvendt|ssp)\b/;
const SIDEWALL = /\b(?:sidewall|vegg|vagg|hsw)\b/;
const UPRIGHT_VARIANT = /\b(?:upright|staende|oppadrettet|oppvendt|opp|ssu)\b/;
const PENDENT_VARIANT = /\b(?:pendent|hengende|hangande|nedadrettet|nedvendt|ned|ssp)\b/;

export function rankSprsokTechnicalReferences(
  requirement: Record<string, unknown>,
  rows: readonly SprsokTechnicalRow[],
  limit = 3
): SprsokTechnicalReference[] {
  const profile = requirementProfile(requirement);
  if (!profile) return [];

  const matches = rows.flatMap((row) => {
    const reference = scoreRow(profile, row);
    return reference ? [reference] : [];
  });

  matches.sort((left, right) =>
    right.score - left.score
    || left.supplier.localeCompare(right.supplier, "sv")
    || left.productType.localeCompare(right.productType, "sv")
    || left.execution.localeCompare(right.execution, "sv")
    || left.sourceId.localeCompare(right.sourceId, "sv")
  );

  const deduplicated: SprsokTechnicalReference[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const productIdentity = normalize(`${match.supplier}|${match.sin}|${match.productType}|${match.execution}`);
    const identity = productIdentity || `id ${normalize(match.sourceId)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    deduplicated.push(match);
  }

  const visible = deduplicated.slice(0, Math.max(0, Math.min(Math.floor(limit), 10)));
  const topScore = visible[0]?.score;
  const eligibleQueries = new Set<string>();

  return visible.map((reference) => {
    const queryIdentity = normalize(reference.ahlsellSearchQuery);
    const hasModelMatch = reference.matchedFields.some((field) => field.startsWith("Modell "));
    const hasSupplierMatch = Boolean(reference.supplier)
      && reference.matchedFields.includes(reference.supplier);
    const hasEnoughEvidence = (hasModelMatch || hasSupplierMatch)
      && reference.matchedFields.length >= 2;
    const queryEligible = reference.score === topScore
      && hasEnoughEvidence
      && Boolean(queryIdentity)
      && !eligibleQueries.has(queryIdentity)
      && eligibleQueries.size < 2;
    if (queryEligible) eligibleQueries.add(queryIdentity);

    return { ...reference, queryEligible };
  });
}

export function mergeSprsokAssistedAhlsellQueries(
  baseQueries: readonly string[],
  references: readonly SprsokTechnicalReference[],
  maxQueries = 3
) {
  const safeMax = Math.max(1, Math.min(Math.floor(maxQueries), 3));
  const base = uniqueQueries(baseQueries);
  const assisted = uniqueQueries(
    references
      .filter((reference) => reference.queryEligible)
      .map((reference) => reference.ahlsellSearchQuery)
  );
  const queries = uniqueQueries([
    ...base.slice(0, 2),
    ...assisted,
    ...base.slice(2)
  ]).slice(0, safeMax);
  const normalizedQueries = new Set(queries.map(normalize));

  return {
    queries,
    used: assisted.some((query) => normalizedQueries.has(normalize(query)))
  };
}

function requirementProfile(
  requirement: Record<string, unknown>
): RequirementProfile | null {
  if (productRequirementCategory(requirement) !== "sprinkler_head") return null;
  if (projectRequirementDataWarnings(requirement).length > 0) return null;

  const value = record(requirement.value_json);
  if (normalize(displayText(value.operation)) === "remove") return null;

  const normalizedText = normalize(requirementSourceText(requirement));
  const productIdentityText = normalize([
    displayText(requirement.category),
    displayText(requirement.requirement_key),
    displayText(requirement.display_name),
    displayText(value.productType),
    displayText(value.productKind)
  ].filter(Boolean).join(" "));
  const conciseProductText = normalize(displayText(requirement.value_text));
  // Technical head specifications often include negative accessory fields,
  // for example "Dekkskive ...: Nei". Only classify the row from its product
  // identity or the start of its concise name; scanning every attribute would
  // reject the sprinkler itself.
  if (
    !normalizedText
    || ACCESSORY_OR_NON_HEAD.test(productIdentityText)
    || ACCESSORY_OR_NON_HEAD_AT_START.test(conciseProductText)
  ) return null;

  const kFactor = parseSprinklerKFactor(
    projectRequirementKFactorDisplayValue(requirement)
  );
  if (
    kFactor === null
    || kFactor <= 0
    || kFactor > MAX_SUPPORTED_SPRINKLER_K_FACTOR
  ) {
    return null;
  }

  const orientationSignals = signalSet(normalizedText, [
    ["upright", UPRIGHT],
    ["pendent", PENDENT],
    ["sidewall", SIDEWALL]
  ] as const);
  const placementText = normalize(placementSourceText(value));
  for (const signal of signalSet(placementText, [
    ["upright", UPRIGHT_VARIANT],
    ["pendent", PENDENT_VARIANT],
    ["sidewall", SIDEWALL]
  ] as const)) {
    orientationSignals.add(signal);
  }
  const responseSignals = signalSet(normalizedText, [
    ["quick", QUICK_RESPONSE],
    ["standard", STANDARD_RESPONSE]
  ] as const);
  if (orientationSignals.size > 1 || responseSignals.size > 1) return null;

  const orientation = firstSetValue(orientationSignals);
  const response = firstSetValue(responseSignals);
  const modelTokens = productModelTokens(normalizedText);
  if (!orientation && !response && modelTokens.length === 0) return null;

  return {
    normalizedText,
    kFactor,
    orientation,
    response,
    modelTokens,
    traits: applicationTraits(normalizedText)
  };
}

function scoreRow(
  profile: RequirementProfile,
  row: SprsokTechnicalRow
): SprsokTechnicalReference | null {
  const kValues = numericValues(row.k_verdi);
  if (!kValues.some((value) => approximatelyEqualK(value, profile.kFactor))) return null;

  const rowTypeText = normalize([
    row.leverandor,
    row.type,
    row.rti
  ].filter((value): value is string => Boolean(value)).join(" "));
  const rowVariantText = normalize(row.utforelse ?? "");
  const rowText = `${rowTypeText} ${rowVariantText}`.trim();
  const rowTraits = applicationTraits(rowText);
  if (hasApplicationConflict(profile.traits, rowTraits)) return null;
  const rowOrientationSignals = signalSet(rowTypeText, [
    ["upright", UPRIGHT],
    ["pendent", PENDENT],
    ["sidewall", SIDEWALL]
  ] as const);
  for (const signal of signalSet(rowVariantText, [
    ["upright", UPRIGHT_VARIANT],
    ["pendent", PENDENT_VARIANT],
    ["sidewall", SIDEWALL]
  ] as const)) {
    rowOrientationSignals.add(signal);
  }
  const rowResponseSignals = signalSet(rowText, [
    ["quick", QUICK_RESPONSE],
    ["standard", STANDARD_RESPONSE]
  ] as const);
  if (rowOrientationSignals.size > 1 || rowResponseSignals.size > 1) return null;

  const rowOrientation = firstSetValue(rowOrientationSignals);
  const rowResponse = firstSetValue(rowResponseSignals);
  if (profile.orientation && rowOrientation && profile.orientation !== rowOrientation) return null;
  if (profile.response && rowResponse && profile.response !== rowResponse) return null;

  let score = 6;
  const matchedFields = [`K${formatNumber(profile.kFactor)}`];
  if (profile.orientation && rowOrientation === profile.orientation) {
    score += 4;
    matchedFields.push(orientationLabel(profile.orientation));
  }
  if (profile.response && rowResponse === profile.response) {
    score += 4;
    matchedFields.push(responseLabel(profile.response));
  }
  for (const trait of matchedApplicationTraits(profile.traits, rowTraits)) {
    score += 2;
    matchedFields.push(trait);
  }

  const rowModelTokens = [
    ...productModelTokens(rowText),
    ...productModelTokens(normalize(row.sin ?? ""))
  ];
  const rowModels = new Set(rowModelTokens);
  const matchingModels = profile.modelTokens.filter((token) => rowModels.has(token));
  const exactSinModel = specificSinModel(row.sin)
    && containsTerm(profile.normalizedText, normalize(row.sin ?? ""))
      ? clean(row.sin)
      : "";
  const matchedModel = matchingModels[0] ?? exactSinModel;
  if (matchedModel) {
    score += 7;
    matchedFields.push(`Modell ${matchedModel.toUpperCase()}`);
  }

  const supplier = clean(row.leverandor);
  const supplierMatched = supplier && containsTerm(profile.normalizedText, normalize(supplier));
  if (supplierMatched) {
    score += 3;
    matchedFields.push(supplier);
  }

  if (matchedFields.length < 2) return null;

  const productType = clean(row.type);
  const execution = clean(row.utforelse);
  const sin = clean(row.sin);
  const sourceId = String(row.id ?? "").trim();
  const queryModel = matchedModel;
  const ahlsellSearchQuery = buildAhlsellSearchQuery({
    supplier: supplierMatched ? supplier : "",
    model: queryModel,
    kFactor: profile.kFactor,
    orientation: profile.orientation && rowOrientation === profile.orientation
      ? profile.orientation
      : null,
    response: profile.response && rowResponse === profile.response
      ? profile.response
      : null,
    traits: profile.traits
  });
  if (!sourceId || !ahlsellSearchQuery) return null;

  return {
    sourceId,
    sin,
    supplier,
    productType,
    execution,
    kValue: clean(row.k_verdi),
    rti: clean(row.rti),
    datasheetUrl: safeHttpUrl(row.datablad),
    score,
    matchedFields,
    ahlsellSearchQuery,
    queryEligible: false
  };
}

function buildAhlsellSearchQuery({
  supplier,
  model,
  kFactor,
  orientation,
  response,
  traits
}: {
  supplier: string;
  model: string;
  kFactor: number;
  orientation: Orientation | null;
  response: ResponseClass | null;
  traits: ApplicationTraits;
}) {
  return [
    supplier,
    model ? model.toUpperCase() : "Sprinklerhode",
    `K${formatNumber(kFactor)}`,
    response === "quick" ? "QR" : response === "standard" ? "SR" : "",
    orientation === "upright" ? "Opp" : orientation === "pendent" ? "Ned" : orientation === "sidewall" ? "HSW" : "",
    traits.dry ? "Tørr" : "",
    traits.residential ? "Bolig" : "",
    traits.extendedCoverage ? "Utvidet dekning" : "",
    traits.concealed ? "Concealed" : "",
    traits.esfr ? "ESFR" : ""
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function applicationTraits(value: string): ApplicationTraits {
  return {
    dry: /\b(?:torrsprinkler|torr sprinkler|dry sprinkler|torr type)\b/.test(value)
      || /\bstandard dekning torr\b/.test(value),
    residential: /\b(?:bolig|boligsprinkler|bostadssprinkler|residential|boendesprinkler)\b/.test(value),
    extendedCoverage: /\b(?:utvidet dekning|extended coverage|qrec|ec hsw)\b/.test(value),
    concealed: /\b(?:concealed|dold|skjult)\b/.test(value),
    esfr: /\besfr\b/.test(value),
    standardCoverage: /\b(?:standard dekning|standard coverage|standard spray|spraysprinkler)\b/.test(value),
    visible: /\b(?:synlig|visible|eksponert)\b/.test(value)
  };
}

function hasApplicationConflict(
  requirement: ApplicationTraits,
  product: ApplicationTraits
) {
  if (requirement.visible && product.concealed) return true;
  if (requirement.standardCoverage && (product.extendedCoverage || product.residential || product.esfr)) return true;

  for (const trait of ["dry", "residential", "extendedCoverage", "concealed", "esfr"] as const) {
    if (requirement[trait] !== product[trait]) return true;
  }
  return false;
}

function matchedApplicationTraits(
  requirement: ApplicationTraits,
  product: ApplicationTraits
) {
  const labels: string[] = [];
  if (requirement.dry && product.dry) labels.push("torrsprinkler");
  if (requirement.residential && product.residential) labels.push("bolig");
  if (requirement.extendedCoverage && product.extendedCoverage) labels.push("utvidgad täckning");
  if (requirement.concealed && product.concealed) labels.push("concealed");
  if (requirement.esfr && product.esfr) labels.push("ESFR");
  if (requirement.standardCoverage && product.standardCoverage) labels.push("standard täckning");
  return labels;
}

function requirementSourceText(requirement: Record<string, unknown>) {
  const value = record(requirement.value_json);
  const attributes = record(value.attributes);
  const attributeText = Object.entries(attributes)
    .slice(0, 100)
    .map(([key, attributeValue]) => `${key} ${displayText(attributeValue)}`)
    .join(" ");
  const rowEvidence = [
    displayText(value.sourceText),
    displayText(requirement.source_excerpt)
  ].filter(Boolean).join(" ");
  const technicalSpecification = displayText(value.technicalSpecification);
  const fallbackSpecification = rowEvidence
    ? ""
    : technicalSpecification.split(/\n\s*UNDERPOST\s*\n/i).at(-1) ?? technicalSpecification;

  return [
    displayText(requirement.category),
    displayText(requirement.requirement_key),
    displayText(requirement.display_name),
    displayText(requirement.value_text),
    displayText(value.system),
    attributeText,
    rowEvidence,
    fallbackSpecification
  ].filter(Boolean).join(" ").slice(0, 24_000);
}

function placementSourceText(value: Record<string, unknown>) {
  const attributes = record(value.attributes);
  return Object.entries(attributes)
    .filter(([key]) => /^(?:plassering|placering|orientation|sprinklertype|type)$/.test(normalize(key)))
    .map(([, attributeValue]) => displayText(attributeValue))
    .filter(Boolean)
    .join(" ");
}

function productModelTokens(value: string) {
  const ignored = /^(?:dn\d+|k\d+|ue\d+|ns\d+|pn\d+|rti\d+|qr\d*|sr\d*)$/;
  return [...new Set(
    (value.match(/\b(?=[a-z0-9-]{3,}\b)(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z0-9-]+\b/g) ?? [])
      .filter((token) => !ignored.test(token))
      .filter((token) => !/^\d+(?:c|mm|bar|stk)$/.test(token))
  )];
}

function specificSinModel(value: unknown) {
  if (typeof value !== "string") return false;
  const compact = value.trim();
  const normalized = normalize(compact);
  return normalized.length >= 3
    && /[a-z]/.test(normalized)
    && (/\d/.test(normalized) || /[-/]/.test(compact));
}

function numericValues(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return [Math.abs(value)];
  if (typeof value !== "string") return [];
  return [...value.normalize("NFKC").matchAll(/-?\d+(?:[.,]\d+)?/g)]
    .map((match) => Math.abs(Number(match[0].replace(",", "."))))
    .filter(Number.isFinite);
}

function approximatelyEqualK(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(0.2, right * 0.0025);
}

function signalSet<T extends string>(
  value: string,
  signals: readonly (readonly [T, RegExp])[]
) {
  const found = new Set<T>();
  for (const [label, pattern] of signals) {
    if (pattern.test(value)) found.add(label);
  }
  return found;
}

function firstSetValue<T>(values: Set<T>): T | null {
  return values.values().next().value ?? null;
}

function orientationLabel(value: Orientation) {
  if (value === "upright") return "stående/opp";
  if (value === "pendent") return "hängande/ned";
  return "sidewall";
}

function responseLabel(value: ResponseClass) {
  return value === "quick" ? "quick respons" : "standard respons";
}

function containsTerm(haystack: string, needle: string) {
  return Boolean(needle) && (` ${haystack} `).includes(` ${needle} `);
}

function uniqueQueries(values: readonly (string | undefined)[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleanValue = typeof value === "string"
      ? value.replace(/\s+/g, " ").trim().slice(0, 180)
      : "";
    const identity = normalize(cleanValue);
    if (!cleanValue || !identity || seen.has(identity)) continue;
    seen.add(identity);
    result.push(cleanValue);
  }
  return result;
}

function safeHttpUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function displayText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function normalize(value: string) {
  return value.toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
