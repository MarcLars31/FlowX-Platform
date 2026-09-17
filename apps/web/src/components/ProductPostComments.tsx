"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { normalizeNrfNumber } from "@/lib/product-card-candidates";
import type { ProductPostComment } from "@/lib/product-post-comments";

type Target = { number: string; name: string };
type Draft = { id: string; body: string; target: Target | null };

export function ProductPostComments({ projectId, requirementId, productNumber, productName, disabled, onDirtyChange, onSavingChange }: {
  projectId: string; requirementId: string; productNumber: string; productName: string; disabled: boolean;
  onDirtyChange: (dirty: boolean) => void; onSavingChange: (saving: boolean) => void;
}) {
  const [comments, setComments] = useState<ProductPostComment[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [postDraft, setPostDraft] = useState<Draft | null>(null);
  const [productDraft, setProductDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const endpoint = `/api/projects/${projectId}/requirements/${requirementId}/comments`;
  const dirty = Boolean(postDraft?.body.trim() || productDraft?.body.trim());

  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onSavingChange(saving); return () => onSavingChange(false); }, [saving, onSavingChange]);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Kommentarerna kunde inte hämtas.");
        if (!controller.signal.aborted) { setComments(payload.comments); setNextOffset(payload.nextOffset); }
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
  }, [endpoint]);

  async function load(offset = 0) {
    const version = ++requestVersion.current;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${endpoint}?offset=${offset}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kommentarerna kunde inte hämtas.");
      if (!mounted.current || requestVersion.current !== version) return;
      setComments(current => {
        const merged = new Map((offset ? current : []).map(comment => [comment.id, comment]));
        for (const comment of payload.comments as ProductPostComment[]) merged.set(comment.id, comment);
        return [...merged.values()];
      });
      setNextOffset(payload.nextOffset);
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Kommentarerna kunde inte hämtas."); }
    finally { if (mounted.current && requestVersion.current === version) setLoading(false); }
  }

  async function save(draft: Draft, scope: "post" | "product") {
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        id: draft.id, body: draft.body, productNumber: draft.target?.number ?? null, productName: draft.target?.name ?? null
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kommentaren kunde inte sparas.");
      setComments(current => [payload.comment, ...current.filter(comment => comment.id !== payload.comment.id)]);
      // Keep the pagination boundary aligned after inserting a new first row.
      setNextOffset(current => current === null ? null : current + 1);
      (scope === "post" ? setPostDraft : setProductDraft)(null);
      setNotice(scope === "post" ? "Kommentaren till posten är sparad." : "Kommentaren till produkten är sparad.");
    } catch (err) { setError(err instanceof Error ? err.message : "Kommentaren kunde inte sparas."); }
    finally { setSaving(false); }
  }

  const oldTarget = productDraft?.target && normalizeNrfNumber(productDraft.target.number) !== normalizeNrfNumber(productNumber);
  return <section aria-label="Kommentarer" className="rounded-lg border border-ink-200 bg-white p-4">
    <h4 className="text-sm font-bold text-ink-950">Kommentarer</h4>
    <p className="mt-1 text-xs leading-5 text-ink-600">Synliga för projektets användare. Sparas separat från produktgodkännandet.</p>
    <div className="mt-3 space-y-4">
      {(["post", "product"] as const).map(scope => {
        const draft = scope === "post" ? postDraft : productDraft;
        const setDraft = scope === "post" ? setPostDraft : setProductDraft;
        const targetNumber = draft?.target?.number || productNumber;
        const blocked = disabled || saving || loading || (scope === "product" && !targetNumber);
        const label = scope === "post" ? "Kommentar till posten" : "Kommentar till vald produkt";
        return <form key={scope} onSubmit={event => { event.preventDefault(); if (draft?.body.trim()) void save(draft, scope); }}>
          <label htmlFor={`comment-${scope}-${requirementId}`} className="block text-xs font-semibold text-ink-800">{label}</label>
          {scope === "product" && <p className="mt-1 text-xs text-ink-600">{targetNumber ? `${draft?.target?.name || productName} · NRF ${targetNumber}` : "Välj en huvudprodukt för att kommentera den."}</p>}
          {scope === "product" && oldTarget && <p className="mt-1 text-xs font-semibold text-amber-900">Utkastet gäller produkten du valde tidigare. Spara det eller töm fältet för att kommentera det nya valet.</p>}
          <textarea id={`comment-${scope}-${requirementId}`} rows={2} maxLength={3000} value={draft?.body || ""} disabled={blocked}
            onChange={event => { const body = event.target.value; setNotice(null); setDraft(body ? { id: draft?.id || crypto.randomUUID(), body,
              target: draft ? draft.target : scope === "product" ? { number: productNumber, name: productName } : null } : null); }}
            className="mt-2 block w-full resize-y rounded-md border-ink-300 text-sm focus:border-flow-500 focus:ring-flow-500 disabled:bg-ink-50" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-ink-500">{draft?.body.length || 0}/3 000</span>
            <Button type="submit" variant="secondary" className="min-h-8 px-3 py-1 text-xs" disabled={blocked || !draft?.body.trim()}>{scope === "post" ? "Spara postkommentar" : "Spara produktkommentar"}</Button>
          </div>
        </form>;
      })}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mt-3 text-xs font-semibold text-emerald-800">{notice}</p>}
    <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
      <h5 className="text-xs font-semibold text-ink-800">Sparade kommentarer</h5>
      <Button type="button" variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={() => void load()} disabled={loading || saving}>Uppdatera kommentarer</Button>
    </div>
    {loading && <p role="status" className="text-xs text-ink-500">Hämtar kommentarer…</p>}
    {!loading && !error && !comments.length && <p className="mt-2 text-xs text-ink-500">Inga kommentarer ännu.</p>}
    <ul className="mt-2 max-h-64 space-y-3 overflow-y-auto">
      {comments.map(comment => <li key={comment.id} className="rounded-md bg-ink-50 p-3">
        <p className="text-xs font-semibold text-flow-900">{comment.product_number ? `Produkt · ${comment.product_name || "NRF"} · ${comment.product_number}` : "PDF-posten"}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-900">{comment.body}</p>
        <p className="mt-2 text-xs text-ink-500">{comment.author_name} · <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</time></p>
      </li>)}
    </ul>
    {nextOffset !== null && <Button type="button" variant="ghost" className="mt-2 text-xs" disabled={loading || saving} onClick={() => void load(nextOffset)}>Visa äldre kommentarer</Button>}
  </section>;
}
