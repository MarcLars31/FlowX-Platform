"use client";

import { useState } from "react";
import { AhlsellTechnicalEvidence } from "@/components/AhlsellTechnicalEvidence";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleX, ExternalLink, PackagePlus } from "lucide-react";
import { ahlsellCandidateMatchState } from "@/lib/ahlsell-candidate-ranking";
import { technicalConflictWarnings } from "@/lib/ahlsell-technical-conflicts";
import { groupAhlsellCandidatesForDisplay, normalizeNrfNumber } from "@/lib/product-card-candidates";
import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";

export function AhlsellCandidateList({ candidates, requirementId, selectedArticleNumber, disabled, allowMatches, accessoryRequirements = [], showNoMatch = true, onSearch, onCheckRequirement, onSelect }: {
  candidates: AhlsellPublicCandidate[];
  requirementId: string;
  selectedArticleNumber: string;
  disabled: boolean;
  allowMatches: boolean;
  accessoryRequirements?: string[];
  showNoMatch?: boolean;
  onSearch?: () => void;
  onCheckRequirement?: () => void;
  onSelect: (candidate: AhlsellPublicCandidate) => void;
}) {
  const { matching, rejected, review } = groupAhlsellCandidatesForDisplay(candidates, allowMatches);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const selectedRejected = rejected.find(candidate => normalizeNrfNumber(candidate.articleNumber) === normalizeNrfNumber(selectedArticleNumber));
  const conflicts = rejected.flatMap(technicalConflictWarnings);
  const mainReason = [...new Set(conflicts)].sort((a, b) => conflicts.filter(value => value === b).length - conflicts.filter(value => value === a).length)[0];

  function productRow(candidate: AhlsellPublicCandidate) {
    const selected = normalizeNrfNumber(candidate.articleNumber) === normalizeNrfNumber(selectedArticleNumber);
    const assessedState = ahlsellCandidateMatchState(candidate);
    const state = !allowMatches && assessedState !== "mismatch" ? "review" : assessedState;
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
            ) : state === "mismatch" ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-rose-900"><CircleX className="h-3.5 w-3.5" aria-hidden="true" />{selected ? "Manuellt vald – avvikelse" : "Uppfyller inte kraven"}</p>
            ) : candidate.learningEvidence ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-amber-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Tidigare bekräftad för liknande krav · kontroll krävs</p>
            ) : state === "review" ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-amber-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Underlaget behöver kontrolleras</p>
            ) : null}
            <p className="mt-1 text-xs leading-5 text-ink-600">{candidateSourceLabel(candidate)}</p>
            <AhlsellCandidateWarnings candidate={candidate} />
            <AhlsellTechnicalEvidence candidate={candidate} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-flow-800">
              <input type="checkbox" name={`ahlsell-product-${requirementId}`} value={candidate.articleNumber}
                checked={selected} disabled={disabled} onChange={() => onSelect(candidate)}
                aria-label={`${selected ? "Ta bort valet av" : "Välj"} ${candidate.productName}, NRF-nummer ${candidate.articleNumber}`}
                className="h-5 w-5 shrink-0 cursor-pointer rounded border-ink-300 text-flow-700 focus:ring-flow-600 disabled:cursor-not-allowed" />
              <span aria-hidden="true">{selected ? "Ta bort val" : "Välj"}</span>
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
      {showNoMatch && matching.length === 0 && (
        <div role="status" className={`border-t px-3 py-4 sm:px-4 ${review.length ? "border-amber-300 bg-amber-50 text-amber-950" : "border-rose-200 bg-rose-50 text-rose-950"}`}>
          <p className="flex items-center gap-2 text-sm font-bold">{review.length ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : <CircleX className="h-5 w-5" aria-hidden="true" />}{review.length ? "Ingen verifierad match ännu" : "Ingen match bland kontrollerade produkter"}</p>
          <p className="mt-1 text-xs leading-5">{review.length ? "Produktuppgifter eller PDF-krav behöver kontrolleras innan en match kan verifieras." : rejected.length ? "De hittade produkterna uppfyller inte PDF-kraven." : "Sökningen gav inga produkter att matcha mot PDF-kravet."}</p>
          {!review.length && mainReason && <p className="mt-1 text-xs leading-5"><span className="font-bold">Orsak: </span>{mainReason}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {onSearch && <button type="button" disabled={disabled} onClick={onSearch} className="rounded-md border border-ink-200 bg-white px-3 py-2 text-xs font-bold text-flow-800 disabled:opacity-50">Sök eller lägg till produkt</button>}
            {onCheckRequirement && <button type="button" disabled={disabled} onClick={onCheckRequirement} className="rounded-md border border-ink-200 bg-white px-3 py-2 text-xs font-bold text-flow-800 disabled:opacity-50">Kontrollera PDF-kravet</button>}
          </div>
        </div>
      )}
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
          <div className="divide-y divide-emerald-200 border-t border-emerald-200" role="group" aria-label="Matchade produkter">
            {matching.map(productRow)}
          </div>
        </details>
      )}
      {review.length > 0 && (
        <details open={matching.length === 0} className="border-t border-amber-200">
          <summary className="cursor-pointer bg-amber-50 px-3 py-3 text-sm font-bold text-amber-950 sm:px-4">Produkter att kontrollera ({review.length})</summary>
          <div className="divide-y divide-amber-200" role="group" aria-label="Produkter att kontrollera">{review.map(productRow)}</div>
        </details>
      )}
      {selectedRejected && !rejectedOpen && productRow(selectedRejected)}
      {rejected.length > 0 && (
        <details className="border-t border-ink-200" onToggle={event => setRejectedOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer px-3 py-3 text-sm font-bold text-ink-700 sm:px-4">Visa bortvalda produkter och orsaker ({rejected.length})</summary>
          <div className="divide-y divide-ink-200" role="group" aria-label="Bortvalda produkter">{rejectedOpen && rejected.map(productRow)}</div>
        </details>
      )}
    </div>
  );
}

export function AhlsellCandidateWarnings({ candidate }: { candidate: AhlsellPublicCandidate }) {
  const conflicts = technicalConflictWarnings(candidate);
  const review = (candidate.matchWarnings ?? []).filter(warning => !conflicts.includes(warning));
  return <>{[{ warnings: conflicts, title: "Avvikelser mot PDF-kravet:", style: "border-rose-200 bg-rose-50 text-rose-900" },
    { warnings: review, title: "Behöver kontrolleras:", style: "border-amber-200 bg-amber-50 text-amber-950" }].map(group => group.warnings.length > 0 && (
    <div key={group.title} className={`mt-1.5 rounded-sm border px-2 py-1.5 text-xs leading-4 ${group.style}`}>
      <p className="font-bold">{group.title}</p><ul className="mt-0.5 list-disc space-y-0.5 pl-4">{[...new Set(group.warnings)].map(warning => <li key={warning}>{warning}</li>)}</ul>
    </div>
  ))}</>;
}

function candidateSourceLabel(candidate: AhlsellPublicCandidate) {
  if (candidate.evidenceSources?.includes("mldl_database") && candidate.evidenceSources.includes("ahlsell_public")) return "MLDL · samma artikel hittad på Ahlsells webbplats";
  if (candidate.source === "catalog_search" || candidate.source === "public_verified") return "Träff på Ahlsells webbplats";
  return candidate.source === "verified_database" ? "Träff i MLDL · verifierade Victaulic-uppgifter" : "Träff i MLDL-databasen";
}
