import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";
import { TECHNICAL_FIELD_LABELS, type TechnicalField } from "@/lib/ahlsell-technical-evidence";

export function AhlsellTechnicalEvidence({ candidate }: { candidate: AhlsellPublicCandidate }) {
  const evidence = candidate.technicalEvidence;
  if (!evidence || evidence.articleNumber !== candidate.articleNumber) return null;
  const keys = Object.keys(evidence.fields) as TechnicalField[];
  if (!keys.length) return null;
  return <details className="mt-2 rounded border border-ink-200 bg-white text-xs text-ink-800">
    <summary className="cursor-pointer px-2 py-2 font-semibold">Tekniskt produktunderlag · {keys.length} fält</summary>
    <p className="px-2 pb-2 text-ink-600">Uppgifter för NRF {evidence.articleNumber}. Saknade uppgifter behöver kompletteras.</p>
    <dl className="divide-y divide-ink-100">
      {keys.map(key => {
        const field = evidence.fields[key]!;
        return <div key={key} className={`px-2 py-2 ${field.status === "conflict" ? "bg-amber-50" : ""}`}>
          <dt className="font-semibold">{TECHNICAL_FIELD_LABELS[key]}{field.status === "conflict" ? " – motstridiga uppgifter" : ""}</dt>
          <dd className="mt-1 space-y-1 break-words">
            {field.observations.map((observation, index) => <p key={index}>
              {observation.raw}{" "}
              <a className="font-semibold text-flow-800 underline" href={observation.sourceUrl} target="_blank" rel="noreferrer">Källa hos Ahlsell</a>
              <span className="text-ink-600"> · Hämtat {observation.retrievedAt.slice(0, 16).replace("T", " ")} UTC</span>
            </p>)}
          </dd>
        </div>;
      })}
    </dl>
  </details>;
}
