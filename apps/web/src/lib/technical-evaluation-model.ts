/** Source-neutral contract. Search scores and historical choices are deliberately absent. */
export const TECHNICAL_EVALUATOR_VERSION = "technical-evaluator-1";
export type TechnicalStatus = "MATCH" | "FAIL" | "VERIFY";
export type TechnicalValue = string | number | boolean;
export type RequirementOperator = "eq" | "gte" | "lte" | "one_of" | "range" | "contains";
export type RequirementSource = {
  kind: "post" | "parent" | "project";
  postNumber?: string;
  page?: number;
  documentId?: string;
  raw: string;
};
export type EffectiveRequirement = {
  id: string;
  property: string;
  label: string;
  operator: RequirementOperator;
  value: TechnicalValue | TechnicalValue[] | null;
  unit?: string;
  mandatory: boolean;
  source: RequirementSource;
  issue?: string;
};
export type EffectiveRequirementSet = {
  version: 1;
  revision: string;
  requirements: EffectiveRequirement[];
};
export type ProductObservation = {
  property: string;
  value: TechnicalValue;
  unit?: string;
  productId: string;
  source: string;
  raw: string;
  documented: boolean;
  observedAt?: string;
  expiresAt?: string;
  /** Conditional capacities must be evaluated against a known configuration. */
  conditions?: string[];
};
export type TechnicalCheck = {
  requirementId: string;
  property: string;
  label: string;
  mandatory: boolean;
  status: TechnicalStatus;
  expected: string;
  actual: string | null;
  reason: string;
  source?: RequirementSource;
  evidence: ProductObservation[];
};
export type TechnicalEvaluation = {
  version: typeof TECHNICAL_EVALUATOR_VERSION;
  requirementRevision: string;
  productId: string;
  evidenceRevision: string;
  evaluatedAt: string;
  status: TechnicalStatus;
  checks: TechnicalCheck[];
};

/** Stable across object insertion order, shared by browser and server. Not an authorization token. */
export function technicalRevision(value: unknown): string {
  const stable = (item: unknown): unknown => Array.isArray(item) ? item.map(stable)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, stable(v)])) : item;
  const text = JSON.stringify(stable(value));
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}

export function technicalText(value: string) {
  return value.trim().toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

const units: Record<string, [string, number]> = {
  mm: ["mm", 1], cm: ["mm", 10], m: ["mm", 1000],
  bar: ["bar", 1], kpa: ["bar", .01], mpa: ["bar", 10], pa: ["bar", .00001], psi: ["bar", .0689475729],
  w: ["W", 1], kw: ["W", 1000], kg: ["kg", 1], g: ["kg", .001],
  c: ["°C", 1], "°c": ["°C", 1], min: ["min", 1], h: ["min", 60],
  v: ["V", 1], a: ["A", 1], db: ["dB", 1]
};
export function normalizeTechnicalNumber(value: number, unit?: string) {
  if (!Number.isFinite(value)) return null;
  if (!unit) return { value };
  const conversion = units[unit.toLowerCase().trim()];
  return conversion ? { value: Number((value * conversion[1]).toPrecision(12)), unit: conversion[0] } : null;
}

/** Explicit property aliases only; unrelated dimensions must never be interchanged. */
const aliases: Record<string, string[]> = {
  dn: ["dn", "dimensjon dn", "dimensjon (dn)", "nominell diameter", "nominell dimension", "gjengedimensjon (dn)", "gjengedimensjon dn"],
  outsideDiameterMm: ["ytterdiameter", "ytterdiameter (mm)", "ytre diameter", "utvendig diameter", "outside diameter"],
  workingPressureBar: ["trykk", "arbeidstrykk", "arbetstryck", "working pressure", "design pressure"],
  pn: ["pn", "trykkklasse", "tryckklass", "pressure class"],
  temperatureC: ["utlosningstemperatur", "responstemperatur", "temperature rating"],
  kFactor: ["k faktor", "k factor"], response: ["folsomhetsgrad", "respons", "response"],
  orientation: ["monteringsretning", "monteringsriktning", "orientation", "plassering", "placering"],
  material: ["materiale", "material", "husmateriale"], materialGrade: ["materialkvalitet", "grade"],
  connection: ["skjot", "type tilkobling", "anslutning", "connection"],
  finish: ["overflatebehandling", "finish", "farge", "farg"],
  width: ["bredde", "bredd", "width"], height: ["hoyde", "hojd", "height"], length: ["lengde", "langd", "length"],
  power: ["effekt", "power"], voltage: ["spenning", "spanning", "voltage"],
  fireRating: ["brannklasse", "brandklass", "fire rating"], ipRating: ["kapslingsgrad", "kapslingsklass", "ip rating"],
  productType: ["produkttype", "produkttyp", "product type"], standard: ["standard", "standarder", "standards"],
  approval: ["godkjenning", "godkannande", "approval"]
};
export function canonicalProperty(label: string) {
  const normalized = technicalText(label);
  return Object.entries(aliases).find(([key, values]) => technicalText(key) === normalized || values.includes(normalized))?.[0] ?? null;
}
const terms: Record<string, string> = {
  stal: "steel", stalror: "steel", steel: "steel", rustfritt: "stainless_steel", rostfritt: "stainless_steel", "stainless steel": "stainless_steel",
  "rustfritt stal": "stainless_steel", "rostfritt stal": "stainless_steel",
  messing: "brass", massing: "brass", brass: "brass", kobber: "copper", koppar: "copper", copper: "copper",
  hurtig: "quick", kvikk: "quick", qr: "quick", "quick response": "quick", quick: "quick", standard: "standard", sr: "standard",
  "kvikk respons": "quick", "hurtig respons": "quick", "standard respons": "standard",
  staende: "upright", upright: "upright", hengende: "pendent", hangande: "pendent", pendent: "pendent", sidewall: "sidewall",
  rille: "grooved", rillet: "grooved", grooved: "grooved", flens: "flanged", flenset: "flanged", flanged: "flanged",
  gjenger: "threaded", gjenget: "threaded", threaded: "threaded", sveis: "welded", welded: "welded",
  "gjenget skjot": "threaded", "sveiseskjot": "welded", "rillet skjot": "grooved",
  hvit: "white", vit: "white", white: "white", sort: "black", svart: "black", black: "black", krom: "chrome", chrome: "chrome"
};
export function normalizeTechnicalTerm(value: string) {
  const text = technicalText(value);
  return terms[text] ?? text;
}

const enumValues: Record<string, string[]> = {
  material: ["steel", "stainless_steel", "stainless steel", "brass", "copper", "pe", "ppr", "pvc", "multilayer", "ductile_iron", "cast_iron"],
  response: ["quick", "standard"], orientation: ["upright", "pendent", "sidewall"],
  connection: ["grooved", "flanged", "threaded", "welded", "press", "compression", "socket", "soldered"],
  finish: ["white", "black", "chrome", "brass"]
};

/** No number is inferred from prose, intervals, product names or unrelated units. */
export function normalizeRequirementValue(property: string, raw: unknown): { value: TechnicalValue; unit?: string } | null {
  if (typeof raw === "boolean") return { value: raw };
  if (typeof raw === "number") return normalizeTechnicalNumber(raw, defaultUnit(property));
  if (typeof raw !== "string" || !raw.trim()) return null;
  const match = /^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z°]+)?$/.exec(raw.trim().replace(/^(?:DN|PN|K)\s*(?=\d)/i, ""));
  if (match) return normalizeTechnicalNumber(Number(match[1].replace(",", ".")), match[2] ?? defaultUnit(property));
  if (["dn", "outsideDiameterMm", "workingPressureBar", "pn", "temperatureC", "kFactor", "width", "height", "length", "power", "voltage"].includes(property)) return null;
  const term = normalizeTechnicalTerm(raw);
  if (enumValues[property] && !enumValues[property].includes(term)) return null;
  return { value: term };
}
function defaultUnit(property: string) {
  return ({ outsideDiameterMm: "mm", workingPressureBar: "bar", temperatureC: "°C" } as Record<string, string>)[property];
}
