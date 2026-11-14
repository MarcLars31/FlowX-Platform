import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { effectiveRequirements } from "./effective-requirements";
import { ahlsellMldlProduct, AHLSELL_MLDL_CATALOG_VERSION } from "./ahlsell-mldl-catalog";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { technicalConflictWarnings } from "./ahlsell-technical-conflicts";
import { AHLSELL_EVIDENCE_TTL_MS } from "./ahlsell-technical-evidence";
import { verifiedVictaulicWorkingPressure } from "./victaulic-working-pressure";
import { normalizeRequirementValue, technicalRevision, type ProductObservation, type TechnicalCheck } from "./technical-evaluation-model";
import { evaluateTechnicalRequirements, technicalStatus } from "./technical-evaluator";
import { isRigidPipeProduct } from "./pipe-product-family";

/** Source adapter; generic evaluator knows nothing about Ahlsell, MLDL or sprinklers. */
export function ahlsellProductObservations(candidate: AhlsellPublicCandidate): ProductObservation[] {
  const observations: ProductObservation[] = [];
  const evidence = candidate.technicalEvidence;
  if (evidence?.articleNumber === candidate.articleNumber) for (const [property, field] of Object.entries(evidence.fields)) {
    for (const item of field?.observations ?? []) {
      const normalized = normalizeRequirementValue(property, item.value);
      if (normalized) observations.push({ property, ...normalized, productId: candidate.articleNumber,
        source: item.sourceUrl, raw: item.raw, documented: field?.status === "documented", observedAt: item.retrievedAt,
        expiresAt: Number.isFinite(Date.parse(item.retrievedAt)) ? new Date(Date.parse(item.retrievedAt) + AHLSELL_EVIDENCE_TTL_MS).toISOString() : "invalid" });
    }
  }
  if (evidence?.articleNumber === candidate.articleNumber) for (const item of evidence.normalizedProperties ?? []) observations.push({
    property: item.property, value: item.value, unit: item.unit, productId: candidate.articleNumber,
    source: item.sourceUrl, raw: item.raw, documented: true, observedAt: item.retrievedAt,
    expiresAt: Number.isFinite(Date.parse(item.retrievedAt)) ? new Date(Date.parse(item.retrievedAt) + AHLSELL_EVIDENCE_TTL_MS).toISOString() : "invalid"
  });
  const local = ahlsellMldlProduct(candidate.articleNumber);
  if (local) {
    const add = (property: string, raw: unknown) => {
      if (raw === null || raw === undefined || raw === "") return;
      const value = normalizeRequirementValue(property, raw);
      if (value) observations.push({ property, ...value, productId: candidate.articleNumber,
        source: `MLDL ${AHLSELL_MLDL_CATALOG_VERSION}`, raw: String(raw), documented: local.reviewFlags.length === 0 });
    };
    for (const dn of local.dnValues) add("dn", dn);
    for (const diameter of local.outsideDiametersMm) add("outsideDiameterMm", diameter);
    for (const [property, raw] of Object.entries({ kFactor: local.kFactor, temperatureC: local.temperatureC,
      response: local.response, orientation: local.orientation, finish: local.finish, material: local.bodyMaterial,
      connection: local.connection, pn: local.pressureClass })) add(property, raw);
  }
  const pressure = verifiedVictaulicWorkingPressure(candidate);
  if (pressure) observations.push({ property: "workingPressureBar", value: pressure.bar, unit: "bar", productId: candidate.articleNumber,
    source: pressure.sourceUrl, raw: `Victaulic ${pressure.publication}, SIN ${pressure.model}`, documented: true, observedAt: pressure.verifiedAt });
  return observations;
}

export function evaluateAhlsellCandidates(requirement: Record<string, unknown>, candidates: AhlsellPublicCandidate[], now = new Date()) {
  const set = effectiveRequirements(requirement);
  const expectedType = ahlsellRequirementIntent(requirement);
  return candidates.map(candidate => {
    const observations = ahlsellProductObservations(candidate);
    const evaluation = evaluateTechnicalRequirements(set, candidate.articleNumber, observations, now);
    const extra: TechnicalCheck[] = [];
    const add = (id: string, label: string, status: TechnicalCheck["status"], reason: string) => extra.push({
      requirementId: id, property: id, label, mandatory: true, status, expected: label, actual: null, reason, evidence: []
    });
    // Keep existing deterministic technical rules as additional gates, never as a source of score-based approval.
    const conflicts = technicalConflictWarnings(candidate);
    for (const reason of conflicts) add(`rule:${technicalRevision(reason)}`, "Teknisk avvik", "FAIL", reason);
    for (const reason of (candidate.matchWarnings ?? []).filter(warning => !conflicts.includes(warning))) add(`review:${technicalRevision(reason)}`, "Kontrollpunkt", "VERIFY", reason);
    const productType = isRigidPipeProduct(candidate.productName) ? "pipe" : ahlsellRequirementIntent({ value_text: candidate.productName, value_json: {} });
    const knownType = expectedType !== "generic" && productType === expectedType;
    add("product-type", "Produkttype", knownType ? "MATCH" : "VERIFY", knownType ? "Produktbeskrivelsens type samsvarer med posten." : "Produktets type og leveranseomfang må kontrolleres mot posten.");
    if (!set.requirements.some(item => item.mandatory)) add("missing-requirements", "Kravgrunnlag", "VERIFY", "Ingen sammenlignbare tekniske krav er dokumentert for posten.");
    if (candidate.requiresProductSelection || candidate.variantCount && candidate.variantCount > 1) add("variant", "Produktvariant", "VERIFY", "Velg og dokumenter den konkrete produktvarianten.");
    if (candidate.requiresAccessoryReview) add("accessories", "Tilbehør", "VERIFY", "Påkrevd tilbehør eller konfigurasjon må kontrolleres.");
    if (candidate.source === "pdf_reference" || candidate.source === "confirmed_history" || candidate.source === "offer_catalog") add("source", "Produktunderlag", "VERIFY", "En PDF-henvisning, tilbudsrad eller et tidligere valg er ikke dokumentasjon på teknisk samsvar.");
    if (candidate.technicalEvidence && candidate.technicalEvidence.articleNumber !== candidate.articleNumber) add("identity", "Artikkelidentitet", "VERIFY", "Produktunderlaget gjelder en annen artikkel.");
    const checks = [...evaluation.checks, ...extra];
    const technicalEvaluation = { ...evaluation, checks, status: technicalStatus(checks) };
    return { ...candidate, searchScore: candidate.searchScore ?? candidate.matchScore ?? null, technicalEvaluation };
  }).sort((left, right) => {
    const priority = { MATCH: 0, VERIFY: 1, FAIL: 2 };
    return priority[left.technicalEvaluation.status] - priority[right.technicalEvaluation.status];
    // Stable sort preserves the existing search order within each technical tier.
  });
}
