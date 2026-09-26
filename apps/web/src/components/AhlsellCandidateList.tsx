"use client";



import { useState } from "react";
import { AhlsellTechnicalEvidence } from "@/components/AhlsellTechnicalEvidence";
import { ProductSelectionCheckbox } from "@/components/ProductSelectionCheckbox";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleX, ExternalLink, PackagePlus } from "lucide-react";
import { ahlsellCandidateMatchState } from "@/lib/ahlsell-candidate-ranking";
import { technicalConflictWarnings } from "@/lib/ahlsell-technical-conflicts";
import { groupAhlsellCandidatesForDisplay, normalizeNrfNumber } from "@/lib/product-card-candidates";
import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";

export function AhlsellCandidateList({ candidates, requirementId, selectedArticleNumber, selectedArticleNumbers, accessory = false, selectionLimitReached = false, disabled, allowMatches, accessoryRequirements = [], showNoMatch = true, onSearch, onCheckRequirement, onSelect }: {
  candidates: AhlsellPublicCandidate[];
  requirementId: string;
  selectedArticleNumber: string;
  selectedArticleNumbers?: string[];
  accessory?: boolean;
  selectionLimitReached?: boolean;
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
    const selected = (selectedArticleNumbers ?? [selectedArticleNumber]).some(number => normalizeNrfNumber(number) === normalizeNrfNumber(candidate.articleNumber));
    const assessedState = ahlsellCandidateMatchState(candidate);
    const state = !allowMatches && assessedState !== "mismatch" ? "review" : assessedState;
    const matched = state === "exact" || state === "matched";
    const background = selected ? "bg-neutral-100" : "bg-white";
    return (
      <article key={candidate.articleNumber} className={`${background} border-l-4 ${selected ? "border-l-neutral-700 ring-2 ring-inset ring-neutral-700" : "border-l-transparent"} px-3 py-3 sm:px-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            {selected && <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-neutral-900"><CheckCircle2 className="h-5 w-5" aria-hidden="true" />{accessory ? "Valt tillbehör" : "Vald huvudprodukt"}</p>}
            <p className="text-sm font-bold leading-5 text-neutral-950">{candidate.productName}</p>
            {candidate.description && candidate.description !== candidate.productName && (
              <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-neutral-700" title={candidate.description}>{candidate.description}</p>
            )}
            <p className="mt-0.5 text-xs font-bold text-neutral-800">NRF-nummer {candidate.articleNumber}</p>
            {matched ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Matchar kraven</p>
            ) : state === "mismatch" ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-900"><CircleX className="h-3.5 w-3.5" aria-hidden="true" />{selected ? "Manuellt vald – avvikelse" : "Uppfyller inte kraven"}</p>
            ) : candidate.learningEvidence ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Tidigare bekräftad för liknande krav · kontroll krävs</p>
            ) : state === "review" ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Underlaget behöver kontrolleras</p>
            ) : null}
            <AhlsellCandidateWarnings candidate={candidate} />
            <AhlsellTechnicalEvidence candidate={candidate} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ProductSelectionCheckbox name={`ahlsell-${accessory ? "accessory" : "product"}-${requirementId}`} checked={selected} disabled={disabled || (!selected && selectionLimitReached)}
              label={`${candidate.productName}, NRF-nummer ${candidate.articleNumber}`} onChange={() => onSelect(candidate)} />
            <a href={candidate.productUrl} target="_blank" rel="noreferrer" aria-label={`Öppna Ahlsell artikel ${candidate.articleNumber}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-500 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
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
        <div role="status" className={`border-t px-3 py-4 sm:px-4 ${review.length ? "border-neutral-300 bg-neutral-50 text-neutral-950" : "border-neutral-200 bg-neutral-50 text-neutral-950"}`}>
          <p className="flex items-center gap-2 text-sm font-bold">{review.length ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : <CircleX className="h-5 w-5" aria-hidden="true" />}{review.length ? "Ingen verifierad match ännu" : "Ingen match bland kontrollerade produkter"}</p>
          <p className="mt-1 text-xs leading-5">{review.length ? "Produktuppgifter eller PDF-krav behöver kontrolleras innan en match kan verifieras." : rejected.length ? "De hittade produkterna uppfyller inte PDF-kraven." : "Sökningen gav inga produkter att matcha mot PDF-kravet."}</p>
          {!review.length && mainReason && <p className="mt-1 text-xs leading-5"><span className="font-bold">Orsak: </span>{mainReason}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {onSearch && <button type="button" disabled={disabled} onClick={onSearch} className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-800 disabled:opacity-50">Sök eller lägg till produkt</button>}
            {onCheckRequirement && <button type="button" disabled={disabled} onClick={onCheckRequirement} className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-800 disabled:opacity-50">Kontrollera PDF-kravet</button>}
          </div>
        </div>
      )}
      {accessoryRequirements.length > 0 && (
        <div className="flex items-start gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-950 sm:px-4" role="note">
          <PackagePlus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p><span className="font-bold">Tillbehör: </span>{[...new Set(accessoryRequirements)].join("; ")}</p>
        </div>
      )}
      {matching.length > 0 && (
        <details className="group border-t border-neutral-300">
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 bg-neutral-50 px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-600 sm:px-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-neutral-700" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-bold text-neutral-950">Matchade produkter <span className="text-neutral-800">({matching.length})</span></p>
              <p className="mt-0.5 text-xs text-neutral-600">Visa alla matchningar och välj artikel.</p>
              {matching.some(candidate => normalizeNrfNumber(candidate.articleNumber) === normalizeNrfNumber(selectedArticleNumber)) && (
                <p className="mt-1 text-xs font-bold text-neutral-800">Vald: NRF {selectedArticleNumber}</p>
              )}
            </div>
            <ChevronDown className="h-5 w-5 text-neutral-800 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="divide-y divide-neutral-200 border-t border-neutral-200" role="group" aria-label="Matchade produkter">
            {matching.map(productRow)}
          </div>
        </details>
      )}
      {review.length > 0 && (
        <details open={matching.length === 0} className="border-t border-neutral-200">
          <summary className="cursor-pointer bg-neutral-50 px-3 py-3 text-sm font-bold text-neutral-950 sm:px-4">Produkter att kontrollera ({review.length})</summary>
          <div className="divide-y divide-neutral-200" role="group" aria-label="Produkter att kontrollera">{review.map(productRow)}</div>
        </details>
      )}
      {selectedRejected && !rejectedOpen && productRow(selectedRejected)}
      {rejected.length > 0 && (
        <details className="border-t border-neutral-200" onToggle={event => setRejectedOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer px-3 py-3 text-sm font-bold text-neutral-700 sm:px-4">Visa bortvalda produkter och orsaker ({rejected.length})</summary>
          <div className="divide-y divide-neutral-200" role="group" aria-label="Bortvalda produkter">{rejectedOpen && rejected.map(productRow)}</div>
        </details>
      )}
    </div>
  );
}

export function AhlsellCandidateWarnings({ candidate }: { candidate: AhlsellPublicCandidate }) {
  const conflicts = technicalConflictWarnings(candidate);
  const review = (candidate.matchWarnings ?? []).filter(warning => !conflicts.includes(warning));
  return <>{[{ warnings: conflicts, title: "Avvikelser mot PDF-kravet:", style: "border-neutral-200 bg-neutral-50 text-neutral-900" },
    { warnings: review, title: "Behöver kontrolleras:", style: "border-neutral-200 bg-neutral-50 text-neutral-950" }].map(group => group.warnings.length > 0 && (
    <div key={group.title} className={`mt-1.5 rounded-sm border px-2 py-1.5 text-xs leading-4 ${group.style}`}>
      <p className="font-bold">{group.title}</p><ul className="mt-0.5 list-disc space-y-0.5 pl-4">{[...new Set(group.warnings)].map(warning => <li key={warning}>{warning}</li>)}</ul>
    </div>
  ))}</>;
}
