import { TECHNICAL_EVALUATOR_VERSION, normalizeTechnicalNumber, normalizeTechnicalTerm, technicalRevision, type EffectiveRequirement, type EffectiveRequirementSet, type ProductObservation, type TechnicalCheck, type TechnicalEvaluation, type TechnicalStatus, type TechnicalValue } from "./technical-evaluation-model";

export function technicalStatus(checks: readonly TechnicalCheck[]): TechnicalStatus {
  const required = checks.filter(check => check.mandatory);
  if (required.some(check => check.status === "FAIL")) return "FAIL";
  if (!required.length || required.some(check => check.status === "VERIFY")) return "VERIFY";
  return "MATCH";
}

/** Deterministic assessment of identified product evidence only; no score/AI/history override. */
export function evaluateTechnicalRequirements(set: EffectiveRequirementSet, productId: string, observations: ProductObservation[], now = new Date()): TechnicalEvaluation {
  const checks = set.requirements.map((requirement): TechnicalCheck => {
    const evidence = observations.filter(item => item.property === requirement.property && item.productId === productId);
    const expected = `${requirement.operator} ${Array.isArray(requirement.value) ? requirement.value.join(" / ") : requirement.value ?? requirement.source.raw}${requirement.unit ? ` ${requirement.unit}` : ""}`;
    const check: TechnicalCheck = { requirementId: requirement.id, property: requirement.property, label: requirement.label, mandatory: requirement.mandatory,
      status: "VERIFY", expected, actual: null, reason: "Dokumentert produktopplysning mangler.", source: requirement.source, evidence };
    if (requirement.issue || !validRequirement(requirement)) return { ...check, reason: requirement.issue ?? "Kravets verdi, enhet eller sammenligningsregel må kontrolleres." };
    if (conflictingRequirements(requirement, set.requirements)) return { ...check, reason: "Kravkildene er motstridende. Avklar kravet før teknisk godkjenning." };
    const usable = evidence.filter(item => item.documented && item.source.trim() && !item.conditions?.length
      && (!item.expiresAt || Number.isFinite(Date.parse(item.expiresAt)) && Date.parse(item.expiresAt) >= now.getTime())
      && (!item.observedAt || Number.isFinite(Date.parse(item.observedAt)) && Date.parse(item.observedAt) <= now.getTime()));
    if (!usable.length) return { ...check, reason: evidence.length ? "Produktunderlaget er uverifisert, utløpt eller avhengig av en ukjent konfigurasjon." : check.reason };
    const normalized = usable.map(item => typeof item.value === "number" ? normalizeTechnicalNumber(item.value, item.unit)
      : typeof item.value === "string" ? { value: normalizeTechnicalTerm(item.value), unit: item.unit } : { value: item.value, unit: item.unit });
    if (normalized.some(item => !item || item.unit !== requirement.unit || typeof item.value !== typeof (Array.isArray(requirement.value) ? requirement.value[0] : requirement.value))) {
      return { ...check, reason: "Produktopplysningens enhet eller datatype kan ikke sammenlignes sikkert med kravet." };
    }
    const values = normalized.map(item => item!.value);
    check.actual = `${[...new Set(values)].join(" / ")}${requirement.unit ? ` ${requirement.unit}` : ""}`;
    if (requirement.operator !== "contains" && new Set(values).size !== 1) return { ...check, reason: "Motstridende opplysninger for samme produktvariant. Kontroller kildene." };
    const matches = requirement.operator === "contains" ? values.some(value => satisfies(requirement, value)) : satisfies(requirement, values[0]);
    if (requirement.operator === "contains" && !matches) return { ...check, reason: "Den påkrevde standarden/godkjenningen er ikke dokumentert. Listen kan være ufullstendig." };
    return { ...check, status: matches ? "MATCH" : "FAIL", reason: matches ? "Dokumentert produktopplysning oppfyller kravet." : "Dokumentert produktopplysning oppfyller ikke kravet." };
  });
  return { version: TECHNICAL_EVALUATOR_VERSION, requirementRevision: set.revision, productId,
    evidenceRevision: technicalRevision(observations), evaluatedAt: now.toISOString(), status: technicalStatus(checks), checks };
}

function validRequirement(requirement: EffectiveRequirement) {
  const values = Array.isArray(requirement.value) ? requirement.value : [requirement.value];
  if (!values.length || values.some(value => value === null || typeof value === "number" && !Number.isFinite(value))) return false;
  if (["gte", "lte"].includes(requirement.operator)) return values.length === 1 && typeof values[0] === "number";
  if (requirement.operator === "range") return values.length === 2 && values.every(value => typeof value === "number") && values[0]! <= values[1]!;
  return requirement.operator === "one_of" || ["eq", "contains"].includes(requirement.operator) && values.length === 1;
}
function satisfies(requirement: EffectiveRequirement, value: TechnicalValue) {
  const expected = requirement.value;
  switch (requirement.operator) {
    case "eq": return value === expected;
    case "contains": return value === expected;
    case "one_of": return Array.isArray(expected) && expected.includes(value);
    case "gte": return typeof value === "number" && typeof expected === "number" && value >= expected;
    case "lte": return typeof value === "number" && typeof expected === "number" && value <= expected;
    case "range": return typeof value === "number" && Array.isArray(expected) && typeof expected[0] === "number" && typeof expected[1] === "number" && value >= expected[0] && value <= expected[1];
  }
}
function conflictingRequirements(requirement: EffectiveRequirement, all: EffectiveRequirement[]) {
  if (!requirement.mandatory) return false;
  const group = all.filter(item => item.mandatory && !item.issue && item.operator !== "contains" && item.property === requirement.property && item.unit === requirement.unit && validRequirement(item));
  const discrete = group.filter(item => item.operator === "eq" || item.operator === "one_of");
  if (discrete.length) {
    const options = Array.isArray(discrete[0].value) ? discrete[0].value : [discrete[0].value!];
    return !options.some(value => group.every(item => satisfies(item, value)));
  }
  const lower = Math.max(-Infinity, ...group.flatMap(item => item.operator === "gte" ? [Number(item.value)] : item.operator === "range" ? [Number((item.value as TechnicalValue[])[0])] : []));
  const upper = Math.min(Infinity, ...group.flatMap(item => item.operator === "lte" ? [Number(item.value)] : item.operator === "range" ? [Number((item.value as TechnicalValue[])[1])] : []));
  return lower > upper;
}
