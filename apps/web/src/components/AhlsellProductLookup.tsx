"use client";



import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { Button } from "@/components/Button";
import { AhlsellCandidateWarnings } from "@/components/AhlsellCandidateList";
import type { AhlsellLookupProduct, AhlsellLookupResult } from "@/lib/ahlsell-product-lookup";
import type { AssemblyComponentKind } from "@/lib/product-assembly-plan";
import { normalizeNrfNumber } from "@/lib/product-card-candidates";
import { ProductSelectionCheckbox } from "@/components/ProductSelectionCheckbox";
import { ProductQuantityFields } from "@/components/ProductQuantityFields";
import { isAutomaticAhlsellLookup } from "@/lib/ahlsell-lookup-input";

type LookupQuantity = { quantity: string; unit: string };
type LookupSelection = LookupQuantity & { productNumber: string };

export function AhlsellProductLookup({ projectId, requirementId, id, accessory = false, automaticQuery = "", componentKind, componentId, mainArticleNumber, disabled = false, selectionLimitReached = false, selections = [], defaultQuantity = "", defaultUnit = "st", onSelect, onDeselect, onQuantityChange }: {
  projectId: string;
  requirementId: string;
  id: string;
  accessory?: boolean;
  automaticQuery?: string;
  componentKind?: AssemblyComponentKind;
  componentId?: string;
  mainArticleNumber?: string;
  disabled?: boolean;
  selectionLimitReached?: boolean;
  selections?: LookupSelection[];
  defaultQuantity?: string;
  defaultUnit?: string;
  onSelect: (product: AhlsellLookupProduct, quantity: LookupQuantity) => void;
  onDeselect: (product: AhlsellLookupProduct) => void;
  onQuantityChange: (product: AhlsellLookupProduct, quantity: LookupQuantity) => void;
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
    const ready = Boolean(automaticQuery && query === automaticQuery) || isAutomaticAhlsellLookup(query);
    if (ready && !disabled) timer.current = setTimeout(() => { void search(query); }, 650);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      request.current?.abort();
    };
  }, [query, disabled, search, automaticQuery]);

  return <div className="space-y-3">
    <form onSubmit={(event) => { event.preventDefault(); if (!disabled && query.trim()) void search(query); }} className="space-y-2">
      <label htmlFor={id} className="block text-sm font-bold text-neutral-900">Artikkelnummer / NRF, produktnavn eller Ahlsell-lenke</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={id} type="search" value={query} maxLength={2000} disabled={disabled} placeholder="Artikkelnummer eller Ahlsell-produktlenke" className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:ring-neutral-500"
          onChange={(event) => { request.current?.abort(); setLoading(false); setResult(null); setError(""); setQuery(event.target.value); }} />
        <Button neutral type="submit" variant="secondary" disabled={disabled || loading || !query.trim()} className="justify-center">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}Sök hos Ahlsell
        </Button>
      </div>
      <p className="text-xs leading-5 text-neutral-600">{automaticQuery ? "Programmet söker automatiskt utifrån kravdelen och den valda huvudprodukten. Du kan ändra sökningen vid behov." : "Artikkelnummer og produktlenker søkes automatisk. Produktnavn søker du med knappen eller Enter."}</p>
    </form>
    <div aria-live="polite" aria-busy={loading}>
      {loading && <p className="text-sm text-neutral-800">Söker på Ahlsells webbplats…</p>}
      {error && <p role="alert" className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900">{error}</p>}
      {result && <div className="space-y-3">
        {result.message && <p className="text-sm text-neutral-700">{result.message}</p>}
        <p className="text-xs text-neutral-600">Kryss av for å velge. Klikk i samme rute igjen for å fjerne valget. Mengden gjelder hele posten.</p>
        {result.products.map((product) => <LookupProductCard key={product.articleNumber} id={id} product={product}
          accessory={accessory} componentKind={componentKind} disabled={disabled} selectionLimitReached={selectionLimitReached}
          selection={selections.find(item => normalizeNrfNumber(item.productNumber) === normalizeNrfNumber(product.articleNumber))}
          defaultQuantity={defaultQuantity} defaultUnit={defaultUnit} onSelect={onSelect} onDeselect={onDeselect} onQuantityChange={onQuantityChange} />)}
        <a href={result.searchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-neutral-800 underline">Öppna sökningen hos Ahlsell<ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
      </div>}
    </div>
  </div>;
}

function LookupProductCard({ id, product, accessory, componentKind, disabled, selectionLimitReached, selection, defaultQuantity, defaultUnit, onSelect, onDeselect, onQuantityChange }: {
  id: string; product: AhlsellLookupProduct; accessory: boolean; componentKind?: AssemblyComponentKind;
  disabled: boolean; selectionLimitReached: boolean; selection?: LookupSelection; defaultQuantity: string; defaultUnit: string;
  onSelect: (product: AhlsellLookupProduct, quantity: LookupQuantity) => void;
  onDeselect: (product: AhlsellLookupProduct) => void;
  onQuantityChange: (product: AhlsellLookupProduct, quantity: LookupQuantity) => void;
}) {
  const [draft, setDraft] = useState<LookupQuantity>({ quantity: defaultQuantity, unit: defaultUnit });
  const current = selection ?? draft;
  function update(patch: Partial<LookupQuantity>) {
    const next = { quantity: current.quantity, unit: current.unit, ...patch };
    setDraft(next);
    if (selection) onQuantityChange(product, next);
  }
  return <article className={`rounded-md border-2 p-3 ${selection ? "border-neutral-600 bg-neutral-50" : "border-neutral-200 bg-white"}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-neutral-600">{accessory ? "Tilbehør" : "Hovedprodukt"}</span>
            <div className="flex items-center gap-3">
              <ProductSelectionCheckbox checked={Boolean(selection)} disabled={disabled || (!selection && selectionLimitReached)}
                label={`${product.productName}, NRF-nummer ${product.articleNumber}`}
                onChange={checked => {
                  if (checked) onSelect(product, current);
                  else { setDraft({ quantity: current.quantity, unit: current.unit }); onDeselect(product); }
                }} />
            </div>
          </div>
          <p className="text-sm font-bold text-neutral-950">{product.productName}</p>
          {product.subtitle && <p className="mt-1 text-xs text-neutral-700">{product.subtitle}</p>}
          {product.manufacturer && <p className="mt-1 text-sm font-semibold text-neutral-800">{product.manufacturer}</p>}
          {product.specifications.length > 0 && <p className="mt-1 text-xs leading-5 text-neutral-600">{product.specifications.join(" · ")}</p>}
          <a href={product.productUrl} target="_blank" rel="noreferrer" aria-label={`Öppna Ahlsell artikel ${product.articleNumber}`}
            className="mt-1 inline-flex min-h-6 items-center text-sm font-bold text-neutral-800 underline underline-offset-2 hover:text-neutral-950">{product.articleNumber}</a>
          {(!accessory || componentKind) && <AhlsellCandidateWarnings candidate={product} />}
          <div className="mt-3 border-t border-neutral-200 pt-3">
            <ProductQuantityFields id={`${id}-${product.articleNumber}`} quantity={current.quantity} unit={current.unit} disabled={disabled}
              onQuantityChange={quantity => update({ quantity })} onUnitChange={unit => update({ unit })} />
          </div>
        </article>;
}
