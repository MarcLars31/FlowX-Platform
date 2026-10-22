import type { EffectiveRequirementSet, TechnicalEvaluation } from "@/lib/technical-evaluation-model";
const comparison = { eq: "=", gte: "≥", lte: "≤", one_of: "én av", range: "intervall", contains: "inkluderer" };

export function EffectiveRequirementsPanel({ requirements }: { requirements: EffectiveRequirementSet }) {
  return <details className="mt-3 border-t border-neutral-200 pt-3">
    <summary className="cursor-pointer text-sm font-bold">Faktiske krav som kontrolleres ({requirements.requirements.length})</summary>
    <p className="mt-2 text-xs text-neutral-600">Samme kravgrunnlag brukes i søket og den tekniske kontrollen. Uavklarte krav krever verifisering.</p>
    <ul className="mt-2 space-y-2 text-xs">
      {requirements.requirements.map(item => <li key={item.id}>
        <strong>{item.label}</strong>: {item.source.raw.replace(`${item.label}: `, "")}
        <span className="block text-neutral-600">{item.source.kind === "project" ? "Prosjektkrav" : item.source.kind === "parent" ? "Hovedpost" : "Post"}
          {item.source.postNumber ? ` ${item.source.postNumber}` : ""}{item.source.page ? ` · side ${item.source.page}` : ""}
          {item.issue ? " · må tolkes" : ` · ${comparison[item.operator]} ${Array.isArray(item.value) ? item.value.join(" / ") : String(item.value)}${item.unit ? ` ${item.unit}` : ""}`}</span>
      </li>)}
    </ul>
  </details>;
}

export function TechnicalEvaluationDetails({ evaluation, searchScore }: { evaluation?: TechnicalEvaluation; searchScore?: number | null }) {
  if (!evaluation) return <p className="mt-1 text-xs">VERIFY · Teknisk kontroll er ikke utført.</p>;
  return <details className="mt-2 text-xs">
    <summary className="cursor-pointer font-bold">{evaluation.status} · Vis teknisk kontroll ({evaluation.checks.length})</summary>
    {searchScore != null && <p className="mt-2 text-neutral-600">Søkepoeng: {Math.round(searchScore)}. Relevans er ikke en teknisk godkjenning.</p>}
    <ul className="mt-2 space-y-3">
      {evaluation.checks.map((check, index) => <li key={`${check.requirementId}:${index}`}>
        <p><strong>{check.status} · {check.label}</strong>{!check.mandatory ? " · valgfritt" : ""}</p>
        <p>{check.reason}</p>
        {check.source && <p>Krav: {check.source.raw} · {check.source.kind === "project" ? "prosjekt" : check.source.postNumber ?? "PDF"}{check.source.page ? `, side ${check.source.page}` : ""}</p>}
        {check.actual && <p>Produkt: {check.actual}</p>}
      </li>)}
    </ul>
  </details>;
}
