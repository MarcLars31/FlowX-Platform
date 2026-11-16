import { projectRequirementDetails, specificationLabel } from "./project-requirement-details";
import { formatProjectQuantity, projectRequirementQuantity } from "./project-requirement-quantity";
import { projectRequirementDataWarnings } from "./project-requirement-data-warnings";
import { productAssemblyPlan } from "./product-assembly-plan";

export type RequirementCheck = { id: string; label: string; text: string; optional: boolean };
export type RequirementDecision = {
  status: "pending" | "product" | "handled" | "not_applicable";
  productKeys: string[];
  note: string;
};
export type RequirementReviewDraft = {
  version: 1;
  revision: string;
  decisions: Record<string, RequirementDecision>;
  confirmation: string;
};
export type ReviewProduct = { key: string; label: string };
export type ReviewSelection = {
  productNumber: string;
  manufacturerArticleNumber?: string;
  accessories: readonly { name: string; productNumber: string; quantity: string | number; unit: string; notes?: string }[];
};

export const pendingRequirementDecision = (): RequirementDecision => ({ status: "pending", productKeys: [], note: "" });

/** Original text remains part of the review: structured fields never stand in
 * for free-text additions or the source PDF's complete scope. */
export function productRequirementChecks(requirement: Record<string, unknown>): RequirementCheck[] {
  const details = projectRequirementDetails(requirement);
  if (!requiresProductRequirementReview(requirement)) return [];
  const checks: RequirementCheck[] = [];
  const add = (id: string, label: string, text: string) => {
    if (text.trim()) checks.push({ id, label, text: text.trim(), optional: /^(?:valgfritt|valfritt|optional)\.?$/i.test(text.trim()) });
  };
  add("scope", "Produkt och leveransomfattning", String(requirement.value_text ?? "Kontrollera postens leveransomfattning i PDF-filen."));
  add("quantity", "Postens mängd", formatProjectQuantity(projectRequirementQuantity(requirement.value_json)));
  if (details.nsCode) add("ns-code", "NS-kod och tillhörande krav", details.nsCode);
  for (const [key, value] of details.attributes) add(`attribute:${key}`, specificationLabel(key), value);
  if (details.standardRefs.length) add("standards", "Standarder", details.standardRefs.join(", "));

  const source = details.sourceExcerpt ?? "";
  const additional = source.match(/(?:andre|andra)\s+krav\s*:?\s*([\s\S]*)/i)?.[1]?.trim();
  if (additional) {
    // Keep wrapped sentences together; split at paragraph headings and sentence
    // boundaries, never at decimals or dimensional abbreviations.
    const parts = additional.replace(/\r/g, "").split(/\n\s*(?=[a-z]\)\s)|(?<=[.!?])\s+(?=[A-ZÆØÅÄÖ])/u);
    parts.forEach((part, index) => add(`additional:${index}`, `Tilläggskrav ${index + 1}`, part));
  }
  const assembly = productAssemblyPlan(requirement);
  for (const component of assembly?.components ?? []) {
    checks.push({ id: `${assembly?.kind === "pipe" ? "component" : "assembly"}:${component.id}`, label: component.label,
      text: component.requirement, optional: component.optional });
  }
  for (const warning of projectRequirementDataWarnings(requirement)) add(`warning:${warning.code}`, warning.label, warning.message);
  if (source) add("source", "Fullständig PDF-post och ritningshänvisningar", source);
  return checks;
}

export function requiresProductRequirementReview(requirement: Record<string, unknown>) {
  const details = projectRequirementDetails(requirement);
  return Boolean(details.sourceExcerpt || details.attributes.length || details.standardRefs.length || details.nsCode);
}

export function requirementReviewRevision(requirement: Record<string, unknown>) {
  const details = projectRequirementDetails(requirement);
  return fingerprint(JSON.stringify([details.postNumber, details.sourcePage, productRequirementChecks(requirement)]));
}

export function reviewProducts(selection: ReviewSelection): ReviewProduct[] {
  const products: ReviewProduct[] = [];
  if (selection.productNumber.trim()) products.push({
    key: `main:${normalizeNumber(selection.productNumber.trim().slice(0, 120))}:${selection.manufacturerArticleNumber?.trim().slice(0, 120) ?? ""}`,
    label: `Huvudprodukt · NRF ${selection.productNumber.trim()}`
  });
  selection.accessories.forEach((item) => {
    if (!item.name.trim()) return;
    products.push({
      // Quantity and unit belong to the attested product configuration. Editing
      // or removing a component invalidates its earlier requirement links.
      key: `component:${fingerprint(JSON.stringify([item.name.trim().slice(0, 240), normalizeNumber(item.productNumber.trim().slice(0, 120)), Number(item.quantity), item.unit.trim().slice(0, 30) || "st", item.notes?.trim().slice(0, 500) ?? ""]))}`,
      label: `${item.name.trim()}${item.productNumber.trim() ? ` · NRF ${item.productNumber.trim()}` : ""} · ${item.quantity} ${item.unit}`
    });
  });
  return products;
}

export function newRequirementReview(requirement: Record<string, unknown>, saved?: unknown): RequirementReviewDraft {
  const revision = requirementReviewRevision(requirement);
  const parsed = parseRequirementReview(saved);
  return parsed?.revision === revision ? parsed : { version: 1, revision, decisions: {}, confirmation: "" };
}

export function requirementDecisionComplete(check: RequirementCheck, decision: RequirementDecision | undefined, products: readonly ReviewProduct[]) {
  if (!decision) return false;
  if (decision.status === "product") {
    return decision.productKeys.length > 0 && decision.productKeys.every(key => products.some(product => product.key === key));
  }
  if (decision.status === "handled") return Boolean(decision.note.trim());
  return decision.status === "not_applicable" && check.optional && Boolean(decision.note.trim());
}

export function requirementReviewConfirmation(review: RequirementReviewDraft, products: readonly ReviewProduct[]) {
  const decisions = Object.entries(review.decisions).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([id, decision]) => [id, { ...decision, note: decision.note.trim(), productKeys: [...new Set(decision.productKeys)].sort() }]);
  return fingerprint(JSON.stringify([review.revision, decisions, products.map(item => item.key).sort()]));
}

export function validateRequirementReview(requirement: Record<string, unknown>, selection: ReviewSelection, raw: unknown):
  { data: RequirementReviewDraft | null } | { error: string } {
  const checks = productRequirementChecks(requirement);
  if (!checks.length) return { data: null };
  const review = parseRequirementReview(raw);
  if (!review) return { error: "Gå igenom postens krav innan du godkänner." };
  if (review.revision !== requirementReviewRevision(requirement)) return { error: "PDF-kraven har ändrats. Gå igenom kraven igen." };
  const products = reviewProducts(selection);
  const missing = checks.filter(check => !requirementDecisionComplete(check, review.decisions[check.id], products));
  if (missing.length) return { error: `${missing.length} krav återstår att hantera. Första kravet: ${missing[0].label}.` };
  if (review.confirmation !== requirementReviewConfirmation(review, products)) return { error: "Bekräfta genomgången för de aktuella produkterna och mängderna." };
  // Store only decisions backed by the authoritative, current requirement.
  const decisions = Object.fromEntries(checks.map(check => [check.id, review.decisions[check.id]]));
  return { data: { ...review, decisions, confirmation: requirementReviewConfirmation({ ...review, decisions }, products) } };
}

export function parseRequirementReview(raw: unknown): RequirementReviewDraft | null {
  const value = record(raw);
  if (value.version !== 1 || typeof value.revision !== "string" || typeof value.confirmation !== "string") return null;
  if (value.revision.length > 80 || value.confirmation.length > 80 || !value.decisions || Array.isArray(value.decisions) || typeof value.decisions !== "object") return null;
  const entries = Object.entries(value.decisions);
  if (entries.length > 250) return null;
  const decisions: Record<string, RequirementDecision> = {};
  for (const [key, item] of entries) {
    const decision = record(item);
    if (key.length > 300 || !["pending", "product", "handled", "not_applicable"].includes(String(decision.status))
      || typeof decision.note !== "string" || decision.note.length > 1000
      || !Array.isArray(decision.productKeys) || decision.productKeys.length > 21
      || decision.productKeys.some(item => typeof item !== "string" || item.length > 300)) return null;
    decisions[key] = { status: decision.status as RequirementDecision["status"], productKeys: [...new Set(decision.productKeys as string[])], note: decision.note.trim() };
  }
  return { version: 1, revision: value.revision, decisions, confirmation: value.confirmation };
}

function normalizeNumber(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^nrf/, ""); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
// Change detection only; never used as authentication or proof of compliance.
function fingerprint(value: string) {
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < value.length; index++) {
    first = Math.imul(first ^ value.charCodeAt(index), 16777619);
    second = Math.imul(second, 33) ^ value.charCodeAt(index);
  }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}
