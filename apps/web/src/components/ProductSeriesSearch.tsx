"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { AhlsellCandidateWarnings } from "./AhlsellCandidateList";
import type { AhlsellLookupProduct, AhlsellLookupResult } from "@/lib/ahlsell-product-lookup";
import { dimensionMatchedSeriesProducts } from "@/lib/product-post-card";
import { projectRequirementDetails } from "@/lib/project-requirement-details";

type Row = Record<string, unknown> & { id: string };
type Result = { requirementId: string; products: AhlsellLookupProduct[]; selected: string; error?: string };
export type ProductSeriesProposal = { requirementId: string; product: AhlsellLookupProduct };
export function ProductSeriesSearch({ projectId, requirementId, rows, disabled, onApply, onBusyChange }: {
  projectId: string; requirementId: string; rows: Row[]; disabled: boolean;
  onApply: (proposals: ProductSeriesProposal[]) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<AhlsellLookupProduct[]>([]);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function lookup(id: string, value: string, signal: AbortSignal, series = false) {
    const response = await fetch(`/api/projects/${projectId}/requirements/${id}/ahlsell-lookup`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ query: value, series })
    });
    const payload = await response.json() as AhlsellLookupResult & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Produktsøket mislyktes.");
    return payload;
  }
  async function run(seed?: AhlsellLookupProduct) {
    if (disabled || busy) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); onBusyChange(true); setError(""); setResults(null); setProgress("");
    try {
      if (!seed) {
        setProducts([]);
        const found = await lookup(requirementId, query, controller.signal);
        setProducts(found.products);
        if (!found.products.length) setError(found.message ?? "Ingen produkter funnet.");
      } else {
        const next: Result[] = [];
        // Sequential requests respect the supplier limit and make partial
        // failures visible. No product mappings are written by this search.
        for (const [index, row] of rows.entries()) {
          controller.signal.throwIfAborted();
          setProgress(`Kontrollerer underpost ${index + 1} av ${rows.length}…`);
          try {
            const found = await lookup(row.id, seed.articleNumber, controller.signal, true);
            const candidates = dimensionMatchedSeriesProducts(found.products);
            next.push({ requirementId: row.id, products: candidates, selected: candidates.length === 1 ? candidates[0].articleNumber : "" });
          } catch (failure) {
            controller.signal.throwIfAborted();
            next.push({ requirementId: row.id, products: [], selected: "", error: failure instanceof Error ? failure.message : "Søket mislyktes." });
          }
        }
        setResults(next);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Søket mislyktes.");
    } finally {
      if (!controller.signal.aborted) { setBusy(false); setProgress(""); onBusyChange(false); }
    }
  }
  const proposals = (results ?? []).flatMap(result => {
    const product = result.products.find(product => product.articleNumber === result.selected);
    return product ? [{requirementId: result.requirementId, product}] : [];
  });
  return <section id="product-post-candidate-panel" className="product-series-panel" aria-label="Produktserie for hovedposten">
    <h3>Produktserie for underpostene</h3>
    <p>Finn en serie, og kontroller dimensjonene. Produktene legges til som forslag og godkjennes separat på hver underpost. Eksisterende produktvalg beholdes.</p>
    {!rows.length ? <p>Alle underposter har allerede produktvalg eller forslag, eller kan ikke redigeres.</p> : <>
      <form onSubmit={event => { event.preventDefault(); void run(); }}>
        <label htmlFor="product-series-query">Artikkelnummer, produktnavn eller produktlenke</label>
        <div><input id="product-series-query" type="search" value={query} maxLength={2000} disabled={disabled || busy} onChange={event => setQuery(event.target.value)} /><Button type="submit" disabled={disabled || busy || query.trim().length < 2}>Søk serie</Button></div>
      </form>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">{progress || "Søker etter produktserier…"}</p>}
      {!results && products.map(product => <article key={product.articleNumber}>
        <h4>{product.productName}</h4><p>{product.manufacturer} · Art. {product.articleNumber}</p>
        {product.subtitle && <p>{product.subtitle}</p>}
        <Button variant="secondary" disabled={disabled || busy} onClick={() => void run(product)}>Finn dimensjoner i denne serien</Button>
      </article>)}
      {results && <><div aria-live="polite">{results.map(result => {
        const row = rows.find(row => row.id === result.requirementId)!;
        const selected = result.products.find(product => product.articleNumber === result.selected);
        return <article key={row.id}><h4>Post {projectRequirementDetails(row).postNumber} · {String(row.value_text ?? "")}</h4>
          {result.error ? <p role="alert">{result.error}</p> : !result.products.length ? <p>Ingen entydig dokumentert dimensjon uten kjente kravavvik. Velg produkt manuelt på underposten.</p> : <>
            <label htmlFor={`series-${row.id}`}>Produktforslag</label><select id={`series-${row.id}`} value={result.selected} disabled={disabled || busy} onChange={event => setResults(current => current?.map(item => item.requirementId === row.id ? {...item, selected:event.target.value} : item) ?? null)}>
              <option value="">{result.products.length > 1 ? "Flere varianter – velg produkt" : "Ikke legg til forslag"}</option>
              {result.products.map(product=><option key={product.articleNumber} value={product.articleNumber}>{product.productName} · {product.articleNumber}</option>)}
            </select>{selected && <AhlsellCandidateWarnings candidate={selected} />}
          </>}
        </article>;
      })}</div><Button disabled={disabled || busy || !proposals.length} onClick={() => onApply(proposals)}>Legg til forslag for {proposals.length} underposter</Button></>}
    </>}
  </section>;
}
