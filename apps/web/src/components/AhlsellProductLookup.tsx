"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { Button } from "@/components/Button";
import { AhlsellCandidateWarnings } from "@/components/AhlsellCandidateList";
import { AhlsellTechnicalEvidence } from "@/components/AhlsellTechnicalEvidence";
import type { AhlsellLookupProduct, AhlsellLookupResult } from "@/lib/ahlsell-product-lookup";
import type { AssemblyComponentKind } from "@/lib/product-assembly-plan";

export function AhlsellProductLookup({ projectId, requirementId, id, accessory = false, automaticQuery = "", componentKind, componentId, mainArticleNumber, disabled = false, onSelect }: {
  projectId: string;
  requirementId: string;
  id: string;
  accessory?: boolean;
  automaticQuery?: string;
  componentKind?: AssemblyComponentKind;
  componentId?: string;
  mainArticleNumber?: string;
  disabled?: boolean;
  onSelect: (product: AhlsellLookupProduct) => void;
}) {
  const [query, setQuery] = useState(automaticQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AhlsellLookupResult | null>(null);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/requirements/${requirementId}/ahlsell-lookup`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: value, accessory, componentKind, componentId, mainArticleNumber, automatic: Boolean(automaticQuery && value === automaticQuery) }), signal: controller.signal
      });
      const payload = await response.json() as AhlsellLookupResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Sökningen kunde inte genomföras.");
      if (!controller.signal.aborted) setResult(payload);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Sökningen kunde inte genomföras.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [projectId, requirementId, accessory, componentKind, componentId, mainArticleNumber, automaticQuery]);

  useEffect(() => {
    const digits = query.replace(/^nrf\s*(?:[- ]?(?:nr|nummer))?\.?\s*:?\s*/i, "").replace(/[\s-]/g, "");
    const ready = Boolean(automaticQuery && query === automaticQuery) || /^\d{7}$/.test(digits) || /^(?:https?:\/\/)?(?:www\.)?ahlsell\.(?:no|se)\/products\/\S+/i.test(query.trim());
    if (ready && !disabled) timer.current = setTimeout(() => { void search(query); }, 650);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      request.current?.abort();
    };
  }, [query, disabled, search, automaticQuery]);

  return <div className="space-y-3">
    <form onSubmit={(event) => { event.preventDefault(); if (!disabled && query.trim()) void search(query); }} className="space-y-2">
      <label htmlFor={id} className="block text-sm font-bold text-ink-900">NRF-nummer, produktnamn eller Ahlsell-länk</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={id} type="search" value={query} maxLength={2000} disabled={disabled} placeholder="NRF-nummer eller https://www.ahlsell.no/products/…" className="min-w-0 flex-1 rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-flow-500 focus:ring-flow-500"
          onChange={(event) => { request.current?.abort(); setLoading(false); setResult(null); setError(""); setQuery(event.target.value); }} />
        <Button type="submit" variant="secondary" disabled={disabled || loading || !query.trim()} className="justify-center">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}Sök hos Ahlsell
        </Button>
      </div>
      <p className="text-xs leading-5 text-ink-600">{automaticQuery ? "Programmet söker automatiskt utifrån kravdelen och den valda huvudprodukten. Du kan ändra sökningen vid behov." : "NRF-nummer och produktlänkar söks automatiskt. Produktnamn söker du med knappen eller Enter."}</p>
    </form>
    <div aria-live="polite" aria-busy={loading}>
      {loading && <p className="text-sm text-flow-800">Söker på Ahlsells webbplats…</p>}
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
      {result && <div className="space-y-3">
        {result.message && <p className="text-sm text-ink-700">{result.message}</p>}
        {result.products.map((product) => <article key={product.articleNumber} className="rounded-md border border-flow-200 bg-white p-3">
          <p className="text-sm font-bold text-ink-950">{product.productName}</p>
          {product.subtitle && <p className="mt-1 text-xs text-ink-700">{product.subtitle}</p>}
          <p className="mt-1 text-sm font-semibold text-flow-800">NRF-nummer {product.articleNumber}{product.manufacturer ? ` · ${product.manufacturer}` : ""}</p>
          {product.specifications.length > 0 && <p className="mt-1 text-xs leading-5 text-ink-600">{product.specifications.join(" · ")}</p>}
          {(!accessory || componentKind) && <AhlsellCandidateWarnings candidate={product} />}
          <AhlsellTechnicalEvidence candidate={product} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <a href={product.productUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-flow-800 underline">Visa hos Ahlsell<ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
            <Button type="button" disabled={disabled} className="min-h-9 px-3 py-1.5 text-xs" onClick={() => onSelect(product)}>{accessory ? "Välj tillbehör" : "Välj produkt"}</Button>
          </div>
        </article>)}
        <a href={result.searchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-flow-800 underline">Öppna sökningen hos Ahlsell<ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
      </div>}
    </div>
  </div>;
}
