"use client";



import { ProductSelectionCheckbox } from "@/components/ProductSelectionCheckbox";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleX, PackagePlus } from "lucide-react";
import { ahlsellCandidateMatchState } from "@/lib/ahlsell-candidate-ranking";
import { technicalConflictWarnings } from "@/lib/ahlsell-technical-conflicts";
import { groupAhlsellCandidatesForDisplay, normalizeNrfNumber } from "@/lib/product-card-candidates";
import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";
import { TechnicalEvaluationDetails } from "./TechnicalEvaluationDetails";

export function AhlsellCandidateList({ candidates, requirementId, selectedArticleNumber, selectedArticleNumbers, accessory = false, selectionLimitReached = false, disabled, allowMatches, accessoryRequirements = [], showNoMatch = true, expandedMatches = false, compact = false, onSelect }: {
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
  expandedMatches?: boolean;
  compact?: boolean;
  onSelect: (candidate: AhlsellPublicCandidate) => void;
}) {
  const { matching, rejected, review } = groupAhlsellCandidatesForDisplay(candidates, allowMatches);
  const conflicts = rejected.flatMap(technicalConflictWarnings);
  const mainReason = [...new Set(conflicts)].sort((a, b) => conflicts.filter(value => value === b).length - conflicts.filter(value => value === a).length)[0];

  function productRow(candidate: AhlsellPublicCandidate) {
    const selected = (selectedArticleNumbers ?? [selectedArticleNumber]).some(number => normalizeNrfNumber(number) === normalizeNrfNumber(candidate.articleNumber));
    const assessedState = ahlsellCandidateMatchState(candidate);
    const state = !allowMatches && assessedState !== "mismatch" ? "review" : assessedState;
    const matched = state === "exact" || state === "matched";
    if (compact) return (
      <article key={candidate.articleNumber} className="product-candidate-card" data-selected={selected}>
        <div className="product-candidate-card-heading">
          <a href={candidate.productUrl} target="_blank" rel="noreferrer" aria-label={`Åpne artikkel ${candidate.articleNumber}`}>Art. {candidate.articleNumber}</a>
          <label className="product-candidate-choice"><input type="checkbox" checked={selected} disabled={disabled || (!selected && selectionLimitReached)}
            aria-label={`${selected ? "Fjern valget av" : "Velg"} ${candidate.productName}, NRF-nummer ${candidate.articleNumber}`}
            onChange={() => onSelect(candidate)} /><span>{selected ? "Valgt" : "Velg"}</span></label>
        </div>
        <h4 className="product-candidate-name">{candidate.productName}</h4>
        {candidate.description && candidate.description !== candidate.productName && <p className="product-candidate-description">{candidate.description}</p>}
        <p className="product-candidate-assessment" data-state={matched ? "matched" : state}>
          {matched ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
          {matched ? "Samsvarer med kravene" : state === "mismatch" ? "Avvik mot kravene" : "Må kontrolleres"}
        </p>
        <AhlsellCandidateWarnings candidate={candidate} />
        <TechnicalEvaluationDetails evaluation={candidate.technicalEvaluation} searchScore={candidate.searchScore} />
      </article>
    );
    const background = selected ? "bg-neutral-100" : "bg-white";
    return (
      <article key={candidate.articleNumber} className={`${background} rounded-sm border ${selected ? "border-neutral-700 ring-1 ring-inset ring-neutral-700" : "border-neutral-300"} px-3 py-3 sm:px-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            {selected && <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-neutral-900"><CheckCircle2 className="h-5 w-5" aria-hidden="true" />{accessory ? "Valt tillbehör" : "Vald huvudprodukt"}</p>}
            <p className="text-sm font-bold leading-5 text-neutral-950">{candidate.productName}</p>
            {candidate.description && candidate.description !== candidate.productName && (
              <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-neutral-700" title={candidate.description}>{candidate.description}</p>
            )}
            <a href={candidate.productUrl} target="_blank" rel="noreferrer" aria-label={`Öppna artikel ${candidate.articleNumber}`}
              className="mt-1 inline-flex min-h-6 items-center text-sm font-bold text-neutral-800 underline underline-offset-2 hover:text-neutral-950">
              {candidate.articleNumber}
            </a>
            {matched ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Matchar kraven</p>
            ) : state === "mismatch" ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-900"><CircleX className="h-3.5 w-3.5" aria-hidden="true" />{selected ? "Manuellt vald – avvikelse" : "Uppfyller inte kraven"}</p>
            ) : state === "review" ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-900">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Underlaget behöver kontrolleras
              </p>
            ) : null}
            {state !== "review" && <AhlsellCandidateWarnings candidate={candidate} />}
            <TechnicalEvaluationDetails evaluation={candidate.technicalEvaluation} searchScore={candidate.searchScore} />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ProductSelectionCheckbox name={`ahlsell-${accessory ? "accessory" : "product"}-${requirementId}`} checked={selected} disabled={disabled || (!selected && selectionLimitReached)}
              label={`${candidate.productName}, NRF-nummer ${candidate.articleNumber}`} onChange={() => onSelect(candidate)} />
          </div>
        </div>
      </article>
    );
  }

  function productRows(rows: AhlsellPublicCandidate[]) {
    return rows.map(productRow);
  }

  return (
    <div className={compact ? "product-candidate-list" : undefined}>
      {showNoMatch && matching.length === 0 && (
        <div role="status" className={`border-t px-3 py-4 sm:px-4 ${review.length ? "border-neutral-300 bg-neutral-50 text-neutral-950" : "border-neutral-200 bg-neutral-50 text-neutral-950"}`}>
          <p className="flex items-center gap-2 text-sm font-bold">{review.length ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : <CircleX className="h-5 w-5" aria-hidden="true" />}{review.length ? "Ingen verifierad match ännu" : "Ingen match bland kontrollerade produkter"}</p>
          {!review.length && <p className="mt-1 text-xs leading-5">{rejected.length ? "De hittade produkterna uppfyller inte PDF-kraven." : "Sökningen gav inga produkter att matcha mot PDF-kravet."}</p>}
          {!review.length && mainReason && <p className="mt-1 text-xs leading-5"><span className="font-bold">Orsak: </span>{mainReason}</p>}

        </div>
      )}
      {accessoryRequirements.length > 0 && (
        <div className="flex items-start gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-950 sm:px-4" role="note">
          <PackagePlus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p><span className="font-bold">Tillbehör: </span>{[...new Set(accessoryRequirements)].join("; ")}</p>
        </div>
      )}
      {matching.length > 0 && (
        <details open={expandedMatches} className="group border-t border-neutral-300">
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
          <div className="space-y-3 border-t border-neutral-200 p-3 sm:p-4" role="group" aria-label="Matchade produkter">
            {productRows(matching)}
          </div>
        </details>
      )}
      {review.length > 0 && (
        <details open={matching.length === 0} className="border-t border-neutral-200">
          <summary className="cursor-pointer bg-neutral-50 px-3 py-3 text-sm font-bold text-neutral-950 sm:px-4">Produktförslag</summary>
          <div className="space-y-3 p-3 sm:p-4" role="group" aria-label="Produktförslag">{productRows(review)}</div>
        </details>
      )}
      {rejected.length > 0 && <details className="border-t border-neutral-200">
        <summary className="cursor-pointer px-3 py-3 text-sm font-bold sm:px-4">FAIL · Oppfyller ikke kravene ({rejected.length})</summary>
        <div className="space-y-3 p-3 sm:p-4" role="group" aria-label="Produkter med tekniske avvik">{productRows(rejected)}</div>
      </details>}
    </div>
  );
}

export function AhlsellCandidateWarnings({ candidate }: { candidate: AhlsellPublicCandidate }) {
  // Generated review commentary and retrieval provenance stay in the assessment
  // data. Only concrete incompatibilities are listed on product cards.
  const conflicts = technicalConflictWarnings(candidate);
  if (!conflicts.length) return null;
  return <div className="product-candidate-warnings mt-1.5 rounded-sm border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs leading-4 text-neutral-900">
    <p className="font-bold">Avvikelser mot PDF-kravet:</p>
    <ul className="mt-0.5 list-disc space-y-0.5 pl-4">{[...new Set(conflicts)].map(warning => <li key={warning}>{warning}</li>)}</ul>
  </div>;
}
