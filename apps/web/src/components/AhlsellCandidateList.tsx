"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, PackagePlus } from "lucide-react";
import { ahlsellCandidateMatchState } from "@/lib/ahlsell-candidate-ranking";
import { groupAhlsellCandidatesForDisplay, normalizeNrfNumber } from "@/lib/product-card-candidates";
import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";

export function AhlsellCandidateList({ candidates, requirementId, selectedArticleNumber, disabled, allowMatches, accessoryRequirements = [], onSelect }: {
  candidates: AhlsellPublicCandidate[];
  requirementId: string;
  selectedArticleNumber: string;
  disabled: boolean;
  allowMatches: boolean;
  accessoryRequirements?: string[];
  onSelect: (candidate: AhlsellPublicCandidate) => void;
}) {
  const { matching, other, visibleOther } = groupAhlsellCandidatesForDisplay(candidates, allowMatches);

  function productRow(candidate: AhlsellPublicCandidate) {
    const selected = normalizeNrfNumber(candidate.articleNumber) === normalizeNrfNumber(selectedArticleNumber);
    const state = allowMatches ? ahlsellCandidateMatchState(candidate) : "review";
    const matched = state === "exact" || state === "matched";
    const background = matched ? "bg-emerald-50" : state === "mismatch" ? "bg-rose-50/40" : selected ? "bg-cyan-50" : "bg-white";
    return (
      <article key={candidate.articleNumber} className={`${background} px-3 py-3 sm:px-4`}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-5 text-ink-950">{candidate.productName}</p>
            {candidate.description && candidate.description !== candidate.productName && (
              <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-ink-700" title={candidate.description}>{candidate.description}</p>
            )}
            <p className="mt-0.5 text-xs font-bold text-flow-800">NRF-nummer {candidate.articleNumber}</p>
            {matched ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Matchar kraven</p>
            ) : candidate.learningEvidence ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-amber-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Tidigare bekräftad för liknande krav · kontroll krävs</p>
            ) : state === "review" && candidate.recommendation === "recommended" ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-amber-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Stark träff · kontroll krävs</p>
            ) : null}
            <p className="mt-1 text-xs leading-5 text-ink-600">{candidateSourceLabel(candidate)}</p>
            {Boolean(candidate.matchWarnings?.length) && (
              <div className="mt-1.5 rounded-sm border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs leading-4 text-rose-900">
                <p className="font-bold">Matchar inte PDF-kravet:</p>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                  {candidate.matchWarnings?.map(warning => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-flow-800">
              <input type="radio" name={`ahlsell-product-${requirementId}`} value={candidate.articleNumber}
                checked={selected} disabled={disabled} onChange={() => onSelect(candidate)}
                aria-label={`Välj ${candidate.productName}, NRF-nummer ${candidate.articleNumber}`}
                className="h-5 w-5 shrink-0 cursor-pointer border-ink-300 text-flow-700 focus:ring-flow-600 disabled:cursor-not-allowed" />
              <span aria-hidden="true">{selected ? "Vald" : "Välj"}</span>
            </label>
            <a href={candidate.productUrl} target="_blank" rel="noreferrer" aria-label={`Öppna Ahlsell artikel ${candidate.articleNumber}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700 transition hover:border-cyan-500 hover:text-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div>
      {accessoryRequirements.length > 0 && (
        <div className="flex items-start gap-2 border-t border-cyan-200 bg-cyan-50 px-3 py-3 text-sm text-cyan-950 sm:px-4" role="note">
          <PackagePlus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p><span className="font-bold">Tillbehör: </span>{[...new Set(accessoryRequirements)].join("; ")}</p>
        </div>
      )}
      {matching.length > 0 && (
        <details className="group border-t border-emerald-300">
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 bg-emerald-50 px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-flow-600 sm:px-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-bold text-ink-950">Matchade produkter <span className="text-emerald-800">({matching.length})</span></p>
              <p className="mt-0.5 text-xs text-ink-600">Visa alla matchningar och välj artikel.</p>
              {matching.some(candidate => normalizeNrfNumber(candidate.articleNumber) === normalizeNrfNumber(selectedArticleNumber)) && (
                <p className="mt-1 text-xs font-bold text-flow-800">Vald: NRF {selectedArticleNumber}</p>
              )}
            </div>
            <ChevronDown className="h-5 w-5 text-emerald-800 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="divide-y divide-emerald-200 border-t border-emerald-200" role="radiogroup" aria-label="Matchade produkter">
            {matching.map(productRow)}
          </div>
        </details>
      )}
      {visibleOther.length > 0 && (
        <div className="border-t border-ink-200">
          {matching.length > 0 && <p className="px-3 py-2 text-xs font-bold text-ink-600 sm:px-4">Övriga produktförslag</p>}
          {other.length > visibleOther.length && <p className="px-3 py-2 text-xs text-ink-600 sm:px-4">Visar {visibleOther.length} bästa av {other.length} förslag som behöver kontrolleras.</p>}
          <div className="divide-y divide-ink-200" role="radiogroup" aria-label="Produktförslag att kontrollera">{visibleOther.map(productRow)}</div>
        </div>
      )}
    </div>
  );
}

function candidateSourceLabel(candidate: AhlsellPublicCandidate) {
  if (candidate.evidenceSources?.includes("mldl_database") && candidate.evidenceSources.includes("ahlsell_public")) return "MLDL · samma artikel hittad på Ahlsells webbplats";
  if (candidate.source === "catalog_search" || candidate.source === "public_verified") return "Träff på Ahlsells webbplats";
  return candidate.source === "verified_database" ? "Träff i MLDL · verifierade Victaulic-uppgifter" : "Träff i MLDL-databasen";
}
