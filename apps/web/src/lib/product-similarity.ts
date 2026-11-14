import { classifyProductRequirement } from "./product-classification";
import { normalizeCatalogText } from "./catalog-search";
import { quotePostgrestValue } from "./sprsok-search";
import { normalizeRequirementValue, normalizeTechnicalTerm } from "./technical-evaluation-model";

export type SimilarityProduct = {
  id: string | number | null;
  source?: "sprsok" | "flowx" | null;
  sin: string | null;
  leverandor: string | null;
  type: string | null;
  utforelse: string | null;
  k_verdi: string | null;
  rti: string | null;
  product_name?: string | null;
  product_category?: string | null;
  material?: string | null;
  connection_type?: string | null;
  available_sizes?: string | null;
  technical_data?: Record<string, unknown> | null;
};

export type ProductSimilarity = { matched: string[]; missing: string[]; status: "needs_verification" };

const label = {
  application: "Typ / användningsområde", orientation: "Utförande", k: "K-värde", response: "Respons / RTI",
  size: "Dimension", material: "Material", connection: "Anslutning", temperature: "Temperatur", pressure: "Arbetstryck", pressureClass: "Tryckklass", finish: "Yta"
};
type Property = keyof typeof label;

function normalize(value: unknown) {
  const text = typeof value === "string" || typeof value === "number" ? normalizeCatalogText(String(value)).replace(/_/g, " ") : "";
  return /^(?:n\/?a|unknown|ukjent|okänd|not available|ikke angitt|null|—|-)$/.test(text) ? "" : text;
}

function response(value: unknown) {
  const text = normalize(value);
  if (/^(?:qr|quick|quick response|kvikk respons|rask respons|snabb respons)$/.test(text)) return "qr";
  if (/^(?:sr|standard|standard response|standard respons)$/.test(text)) return "sr";
  return text;
}

function orientation(value: unknown) {
  const text = normalize(value);
  return text.replace(/\b(?:pendant|pendent|hengende|hängande)\b/g, "pendent")
    .replace(/\b(?:upright|stående|staende)\b/g, "upright");
}

function number(value: unknown) {
  const text = normalize(value);
  // Never equate an unspecified imperial value with a metric value. A dual
  // notation such as 80 (5.6) uses the explicitly leading catalog value.
  const match = text.match(/^(?:k\s*)?(\d+(?:[.,]\d+)?)(?:\s*\([^)]*\))?$/);
  return match ? String(Number(match[1].replace(",", "."))) : "";
}

function dimension(value: unknown) {
  const text = normalize(value);
  // A family-wide size list does not identify one concrete variant.
  return /^(?:dn\s*)?\d+(?:[.,]\d+)?$/.test(text) ? `dn:${Number(text.replace(/^dn\s*/, "").replace(",", "."))}`
    : /^\d+(?:\s+\d+\/\d+|\/\d+)?\s*(?:"|inch)$/.test(text) ? `inch:${text.replace(/\s*(?:"|inch)$/, "")}` : "";
}

function technicalNumber(property: string, value: unknown) {
  const parsed = normalizeRequirementValue(property, value);
  return parsed && typeof parsed.value === "number" ? `${parsed.value}:${parsed.unit ?? ""}` : "";
}

function profile(product: SimilarityProduct) {
  const classification = classifyProductRequirement({
    value_text: product.product_name || product.type,
    category: product.product_category,
    value_json: {}
  });
  let family: string | null = classification.intent !== "generic" ? classification.intent
    : !["other", "unknown"].includes(classification.category) ? classification.category : null;
  // Sprsok is an explicit sprinkler source; a K-value on any other product
  // must not silently classify it as a sprinkler.
  if (!family && product.source === "sprsok" && number(product.k_verdi) && response(product.rti)) family = "sprinkler_head";
  const data = product.technical_data ?? {};
  const type = normalize(product.type);
  const connection = normalizeTechnicalTerm(normalize(product.connection_type ?? data.connectionType));
  const execution = orientation(product.utforelse);
  const properties: Record<Property, string> = {
    application: family === "sprinkler_head" && !/^(?:sprinkler(?: head|hode|huvud)?|sprinkler head)$/.test(type) ? type : "",
    // The legacy projection uses connection_type when orientation is missing.
    // Count that fact once and leave the actual orientation unverified.
    orientation: connection && normalizeTechnicalTerm(execution) === connection ? "" : execution,
    k: number(product.k_verdi), response: response(product.rti),
    size: dimension(data.dn ?? data.connectionSize ?? product.available_sizes),
    material: normalizeTechnicalTerm(normalize(product.material ?? data.material)), connection,
    temperature: technicalNumber("temperatureC", data.temperatureC), pressure: technicalNumber("workingPressureBar", data.workingPressureBar),
    pressureClass: technicalNumber("pn", data.pressureClass), finish: normalizeTechnicalTerm(normalize(data.finish))
  };
  return { family, properties };
}

/** Supplier identity contributes neither eligibility nor score. Known technical
 * conflicts exclude a suggestion; missing evidence is always shown for review. */
export function rankSimilarProducts<T extends SimilarityProduct>(source: T, candidates: readonly T[]) {
  const expected = profile(source);
  if (!expected.family) return [];
  const seen = new Set<string>();
  return candidates.flatMap(product => {
    if (product.id === source.id) return [];
    const key = product.id == null ? JSON.stringify(product) : String(product.id);
    if (seen.has(key)) return [];
    seen.add(key);
    const actual = profile(product);
    if (actual.family !== expected.family) return [];
    const matched: string[] = [];
    const missing: string[] = [];
    for (const property of Object.keys(label) as Property[]) {
      const left = expected.properties[property];
      const right = actual.properties[property];
      if (left && right && left !== right) return [];
      if (left && right) matched.push(label[property]);
      else if (left || right || ["size", "pressure"].includes(property)
        || expected.family === "sprinkler_head" && ["k", "response", "orientation", "temperature"].includes(property)) missing.push(label[property]);
    }
    // A family or application label alone is not technical similarity.
    const technicalMatches = matched.filter(item => item !== label.application).length;
    if (technicalMatches < (expected.family === "sprinkler_head" ? 2 : 1)) return [];
    const similarity: ProductSimilarity = { matched, missing, status: "needs_verification" };
    return [{ product: { ...product, similarity }, score: technicalMatches }];
  }).sort((left, right) => right.score - left.score
    || left.product.similarity.missing.length - right.product.similarity.missing.length
    || (left.product.sin ?? "").localeCompare(right.product.sin ?? "", "nb", { numeric: true })
    || String(left.product.id).localeCompare(String(right.product.id)));
}

/** Retrieval is deliberately broader than the subsequent technical checks. */
export function similarProductFilter(source: SimilarityProduct) {
  if (!profile(source).family) return null;
  const expressions = (["type", "utforelse", "k_verdi", "rti"] as const).flatMap(column => {
    const value = source[column]?.trim();
    if (!value) return [];
    if (column === "rti") {
      const aliases = response(value) === "qr" ? ["QR", "Quick Response", "kvikk respons", "rask respons", "snabb respons"]
        : response(value) === "sr" ? ["SR", "Standard Response", "standard respons"] : [value];
      return aliases.map(alias => `${column}.ilike.${quotePostgrestValue(alias)}`);
    }
    return [`${column}.ilike.${quotePostgrestValue(value)}`];
  });
  return expressions.length ? `(${expressions.join(",")})` : null;
}

export async function findSimilarProducts<T extends SimilarityProduct>(source: T,
  select: (params: Record<string, string>) => Promise<T[]>, limit: number) {
  const filter = similarProductFilter(source);
  if (!filter) return { products: [], truncated: false };
  const candidates: T[] = [];
  const batchSize = 250;
  const maximum = 2000;
  let truncated = false;
  for (let offset = 0; offset < maximum; offset += batchSize) {
    const batch = await select({ id: `neq.${source.id}`, or: filter, order: "sin.asc.nullslast,id.asc", offset: String(offset), limit: String(batchSize) });
    candidates.push(...batch);
    if (batch.length < batchSize) break;
    if (offset + batchSize === maximum) truncated = true;
  }
  return { products: rankSimilarProducts(source, candidates).slice(0, limit).map(item => item.product), truncated };
}
