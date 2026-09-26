"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { AhlsellCandidateList } from "@/components/AhlsellCandidateList";
import { Button } from "@/components/Button";
import { isAutomaticAhlsellLookup } from "@/lib/ahlsell-lookup-input";
import { normalizeNrfNumber } from "@/lib/product-card-candidates";
import { mergeAhlsellCandidates } from "@/lib/ahlsell-candidate-merge";
import type { AhlsellLookupProduct, AhlsellLookupResult } from "@/lib/ahlsell-product-lookup";
import type { AhlsellAccessorySuggestion } from "@/lib/ahlsell-public-match";
import { isAssemblyComponentCandidate, type AssemblyComponent } from "@/lib/product-assembly-plan";

/** One list and the same product rows as the main-product picker, irrespective of source. */
export function AccessoryProductPicker({ projectId, requirementId, mainArticleNumber, component, automaticQuery, suggestions, selections, disabled, selectionLimitReached, onSelect, onDeselect, children }: {
  children?: ReactNode;
  projectId: string;
  requirementId: string;
  mainArticleNumber: string;
  component?: AssemblyComponent;
  automaticQuery: string;
  suggestions: AhlsellAccessorySuggestion[];
  selections: string[];
  disabled: boolean;
  selectionLimitReached: boolean;
  onSelect: (product: AhlsellLookupProduct) => void;
  onDeselect: (product: AhlsellLookupProduct) => void;
}) {
  const [query, setQuery] = useState(automaticQuery);
  const [searchOpen, setSearchOpen] = useState(!automaticQuery && !suggestions.length);
  const [loading, setLoading] = useState(Boolean(automaticQuery));
  const [result, setResult] = useState<AhlsellLookupResult | null>(null);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const componentKind = component?.kind;
  const componentId = component?.id;
  const search = useCallback(async (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/requirements/${requirementId}/ahlsell-lookup`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: controller.signal,
        body: JSON.stringify({ query: value, accessory: true, componentKind, componentId,
          mainArticleNumber, automatic: Boolean(automaticQuery && value === automaticQuery) })
      });
      const payload = await response.json() as AhlsellLookupResult & { error?: string };
      if (!response.ok) throw Error(payload.error ?? "Tillbehören kunde inte hämtas. Försök igen.");
      if (!controller.signal.aborted) setResult(payload);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Tillbehören kunde inte hämtas.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [projectId, requirementId, componentKind, componentId, mainArticleNumber, automaticQuery]);

  useEffect(() => {
    if (!disabled && ((automaticQuery && query === automaticQuery) || isAutomaticAhlsellLookup(query))) {
      timer.current = setTimeout(() => { void search(query); }, 650);
    }
    return () => { if (timer.current) clearTimeout(timer.current); request.current?.abort(); };
  }, [query, automaticQuery, disabled, search]);

  const initial = suggestions.filter(item => !component || isAssemblyComponentCandidate(component.kind, item.productName))
    .map(item => ({ ...item, specifications: [], description: item.reason, exactMatch: false,
      recommendation: "possible" as const, matchWarnings: [item.reason, "Kontrollera kompatibiliteten med den valda huvudprodukten."] }));
  // Once received, the server's combined compatibility assessment is authoritative.
  const products = mergeAhlsellCandidates(!component && query === automaticQuery ? initial : [],
    result?.products ?? (query === automaticQuery ? initial : []));
  const id = `ahlsell-accessory-lookup-${requirementId}`;
  return <div id={`accessory-lookup-card-${requirementId}`}>
    <div className="flex flex-wrap items-center gap-2 pb-3">
      <Button neutral type="button" variant="secondary" disabled={disabled} onClick={() => setSearchOpen(value => !value)} aria-expanded={searchOpen} aria-controls={`${id}-search`}>
        <Search className="h-4 w-4" aria-hidden="true" />Sök tillbehör
      </Button>
    </div>
    {searchOpen && <form id={`${id}-search`} className="mb-3 space-y-2" onSubmit={event => { event.preventDefault(); if (!disabled && query.trim()) void search(query); }}>
      <label htmlFor={id} className="block text-sm font-bold text-neutral-900">Produktnamn, NRF-nummer eller Ahlsell-länk</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={id} type="search" value={query} disabled={disabled} maxLength={2000} className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-600 focus:ring-neutral-600" onChange={event => {
          request.current?.abort(); if (timer.current) clearTimeout(timer.current);
          setLoading(false); setResult(null); setError(""); setQuery(event.target.value);
        }} />
        <Button neutral type="submit" variant="secondary" disabled={disabled || loading || !query.trim()}>Sök</Button>
      </div>
    </form>}
    {children && <div className="mb-4">{children}</div>}
    <div aria-live="polite" aria-busy={loading}>
      {loading && <p className="flex items-center gap-2 py-2 text-sm text-neutral-800"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Söker i MLDL och hos Ahlsell…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-neutral-900">{error} <button type="button" disabled={disabled || loading} className="font-bold underline" onClick={() => void search(query)}>Försök igen</button></p>}
      {result?.message && <p className="mb-3 text-sm text-neutral-700">{result.message}</p>}
    </div>
    <AhlsellCandidateList candidates={products} requirementId={requirementId} selectedArticleNumber="" selectedArticleNumbers={selections}
      accessory selectionLimitReached={selectionLimitReached} disabled={disabled} allowMatches={false} showNoMatch={false}
      onSelect={candidate => selections.some(number => normalizeNrfNumber(number) === normalizeNrfNumber(candidate.articleNumber)) ? onDeselect(candidate) : onSelect(candidate)} />
  </div>;
}
