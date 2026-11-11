import type { EffectiveRequirementSet, TechnicalEvaluation } from "@/lib/technical-evaluation-model";
import { productEvidenceHref } from "@/lib/product-search-trace";
import { requirementSourceLabel } from "./ProductSearchDetails";
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
  const labels = { MATCH: "Oppfyller kontrollerte krav", FAIL: "Avvik", VERIFY: "Må kontrolleres" };
  if (!evaluation) return <p className="mt-1 text-xs">Teknisk kontroll er ikke utført.</p>;
  return <details className="mt-2 min-w-0 text-xs leading-5 [overflow-wrap:anywhere]">
    <summary className="cursor-pointer font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Sammenlign med produktopplysningene · {labels[evaluation.status]}</summary>
    <p className="mt-2 text-neutral-600">Kontrollen dekker kravene nedenfor og er ikke en godkjenning av hele installasjonen.</p>
    {searchScore != null && <p className="mt-2 text-neutral-600">Søkepoeng: {Math.round(searchScore)}. Relevans er ikke en teknisk godkjenning.</p>}
    <ul className="mt-2 space-y-3">
      {evaluation.checks.map((check, index) => <li key={`${check.requirementId}:${index}`} className="rounded border border-neutral-200 p-2">
        <p><strong>{labels[check.status]} · {check.label}</strong>{!check.mandatory ? " · valgfritt" : ""}</p>
        <dl className="my-2 grid gap-2 sm:grid-cols-2">
          <div><dt className="font-semibold">Prosjektets krav</dt><dd className="whitespace-pre-wrap">{check.source?.raw ?? check.expected}</dd>
            {check.source && <dd className="text-neutral-600">{requirementSourceLabel(check.source)}</dd>}</div>
          <div><dt className="font-semibold">Produktens opplysning</dt><dd>{check.actual ?? "Sammenlignbar produktopplysning mangler"}</dd></div>
        </dl>
        <p>{check.reason}</p>
        {check.evidence.length > 0 && <ul className="mt-2 space-y-2 border-t border-neutral-200 pt-2" aria-label={`Produktkilder for ${check.label}`}>
          {check.evidence.map((evidence, evidenceIndex) => <li key={evidenceIndex}>
            <p className="whitespace-pre-wrap">{evidence.raw}</p>
            <p>Kilde: {productEvidenceHref(evidence.source) ? <a className="underline" href={productEvidenceHref(evidence.source)} target="_blank" rel="noopener noreferrer">{evidence.source}</a> : evidence.source || "Ikke registrert"}</p>
            {evidence.observedAt && <p>Hentet/verifisert: {evidence.observedAt}</p>}
            {!evidence.documented && <p>Opplysningen er ikke verifisert som dokumentert.</p>}
            {evidence.conditions?.length ? <p>Forutsetninger: {evidence.conditions.join(" · ")}</p> : null}
          </li>)}
        </ul>}
      </li>)}
    </ul>
  </details>;
}
