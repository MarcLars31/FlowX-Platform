"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { Loader2, MessageSquare, RefreshCw, Trash2 } from "lucide-react";
import { normalizeNrfNumber } from "@/lib/product-card-candidates";
import type { ProductPostComment } from "@/lib/product-post-comments";

type Target = { number: string; name: string };
type Draft = { id: string; body: string; target: Target | null };

export function ProductPostComments({ projectId, requirementId, productNumber, productName, disabled, onDirtyChange, onSavingChange, children }: {
  projectId: string; requirementId: string; productNumber: string; productName: string; disabled: boolean;
  onDirtyChange: (dirty: boolean) => void; onSavingChange: (saving: boolean) => void;
  children: (sections: { postComments: ReactNode; productComments: ReactNode }) => ReactNode;
}) {
  const [comments, setComments] = useState<ProductPostComment[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedbackScope, setFeedbackScope] = useState<"post" | "product" | null>(null);
  const [postDraft, setPostDraft] = useState<Draft | null>(null);
  const [productDraft, setProductDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const endpoint = `/api/projects/${projectId}/requirements/${requirementId}/comments`;
  const dirty = Boolean(postDraft?.body.trim() || productDraft?.body.trim());

  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onSavingChange(saving); return () => onSavingChange(false); }, [saving, onSavingChange]);
  useEffect(() => {
    mounted.current = true;
    const version = ++requestVersion.current;
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Kommentarerna kunde inte hämtas.");
        if (!controller.signal.aborted && requestVersion.current === version) { setComments(payload.comments); setNextOffset(payload.nextOffset ?? null); }
      })
      .catch(err => { if (!controller.signal.aborted && requestVersion.current === version) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted && requestVersion.current === version) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
  }, [endpoint]);

  async function load(offset = 0) {
    const version = ++requestVersion.current;
    setLoading(true); setError(null); setNotice(null); setFeedbackScope(null); setDeleteConfirmation(null);
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
      setNextOffset(payload.nextOffset ?? null);
    } catch (err) { if (mounted.current && requestVersion.current === version) setError(err instanceof Error ? err.message : "Kommentarerna kunde inte hämtas."); }
    finally { if (mounted.current && requestVersion.current === version) setLoading(false); }
  }

  async function save(draft: Draft, scope: "post" | "product") {
    const version = ++requestVersion.current;
    setSaving(true); setError(null); setNotice(null);
    setFeedbackScope(scope);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        id: draft.id, body: draft.body, productNumber: draft.target?.number ?? null, productName: draft.target?.name ?? null
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kommentaren kunde inte sparas.");
      if (!mounted.current || requestVersion.current !== version) return;
      setComments(current => [payload.comment, ...current.filter(comment => comment.id !== payload.comment.id)]);
      // Keep the pagination boundary aligned after inserting a new first row.
      if (!comments.some(comment => comment.id === payload.comment.id)) setNextOffset(current => current === null ? null : current + 1);
      (scope === "post" ? setPostDraft : setProductDraft)(null);
      setNotice(scope === "post" ? "Kommentaren till posten är sparad." : "Kommentaren till produkten är sparad.");
    } catch (err) { if (mounted.current && requestVersion.current === version) setError(err instanceof Error ? err.message : "Kommentaren kunde inte sparas."); }
    finally { if (mounted.current && requestVersion.current === version) setSaving(false); }
  }

  async function remove(comment: ProductPostComment, scope: "post" | "product") {
    const version = ++requestVersion.current;
    setSaving(true); setError(null); setNotice(null); setFeedbackScope(scope);
    try {
      const response = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: comment.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kommentaren kunde inte tas bort.");
      if (!mounted.current || requestVersion.current !== version) return;
      setComments(current => current.filter(item => item.id !== comment.id));
      setNextOffset(current => current === null ? null : Math.max(0, current - 1));
      setDeleteConfirmation(null);
      setNotice("Kommentaren är borttagen och kommer inte med i nästa Excel-export.");
      window.requestAnimationFrame(() => document.getElementById(`comments-${scope}-title-${requirementId}`)?.focus({ preventScroll: true }));
    } catch (err) { if (mounted.current && requestVersion.current === version) setError(err instanceof Error ? err.message : "Kommentaren kunde inte tas bort."); }
    finally { if (mounted.current && requestVersion.current === version) setSaving(false); }
  }

  const oldTarget = productDraft?.target && normalizeNrfNumber(productDraft.target.number) !== normalizeNrfNumber(productNumber);
  function section(scope: "post" | "product") {
    const title = scope === "post" ? "Kommentarer till posten" : "Produktkommentarer";
    const scopedComments = comments.filter(comment => scope === "post" ? !comment.product_number : Boolean(comment.product_number));
    const showFeedback = feedbackScope === null || feedbackScope === scope;
    const draft = scope === "post" ? postDraft : productDraft;
    const setDraft = scope === "post" ? setPostDraft : setProductDraft;
    const targetNumber = draft?.target?.number || productNumber;
    const blocked = disabled || saving || loading || (scope === "product" && !targetNumber);
    const label = scope === "post" ? "Skriv en postkommentar" : "Skriv en produktkommentar";
    return <section aria-label={title} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
        <h4 id={`comments-${scope}-title-${requirementId}`} tabIndex={-1} className="flex items-center gap-2 text-base font-bold text-neutral-950">
          <MessageSquare className="h-5 w-5 shrink-0 text-neutral-700" aria-hidden="true" />{title}
          <span className="rounded-full bg-white px-2.5 py-0.5 text-sm text-neutral-800" aria-label={`${scopedComments.length} kommentarer visas`}>{scopedComments.length}</span>
        </h4>
        <div className="flex items-center gap-1">
          <Button neutral type="button" variant="ghost" className="min-h-9 px-2 py-1 text-xs" disabled={blocked}
            onClick={() => document.getElementById(`comment-${scope}-${requirementId}`)?.focus()}>Skriv kommentar</Button>
          <Button neutral type="button" variant="ghost" className="min-h-9 px-2 py-1" aria-label="Uppdatera kommentarer" title="Uppdatera kommentarer" onClick={() => void load()} disabled={disabled || loading || saving}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="p-4">
        {showFeedback && error && <p role="alert" className="mb-3 rounded-md bg-neutral-50 p-3 text-sm text-neutral-800">{error}</p>}
        {showFeedback && notice && <p role="status" className="mb-3 rounded-md bg-neutral-50 p-3 text-sm font-semibold text-neutral-800">{notice}</p>}
        {loading && <p role="status" className="mb-3 text-sm text-neutral-500">Hämtar kommentarer…</p>}
        {!loading && !error && !scopedComments.length && <p className="mb-4 text-sm text-neutral-600">{nextOffset === null ? "Inga kommentarer ännu." : "Inga kommentarer i den här delen bland de hämtade. Visa äldre kommentarer nedan."}</p>}
        <ul aria-label={`Sparade ${scope === "post" ? "postkommentarer" : "produktkommentarer"}`} className="space-y-3">
          {scopedComments.map(comment => <li key={comment.id} className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-neutral-950">{comment.author_name}</p>
                <time className="text-xs text-neutral-600" dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" })}</time>
              </div>
              {comment.can_delete && deleteConfirmation !== comment.id && <Button neutral type="button" variant="ghost" className="min-h-9 gap-1.5 px-2 py-1 text-xs text-neutral-600 hover:text-neutral-800" disabled={disabled || saving || loading}
                aria-label={`Ta bort kommentar av ${comment.author_name}`} onClick={() => { setDeleteConfirmation(comment.id); setError(null); setNotice(null); setFeedbackScope(scope); }}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />Ta bort
              </Button>}
            </div>
            {comment.product_number && <p className="mt-2 rounded-md bg-white px-2 py-1 text-xs font-semibold text-neutral-900">
              {normalizeNrfNumber(comment.product_number) === normalizeNrfNumber(productNumber) ? "Vald produkt" : "Tidigare produktval"} · {comment.product_name || "Produkt"} · NRF {comment.product_number}
            </p>}
            <p className="mt-3 whitespace-pre-wrap break-words text-base leading-6 text-neutral-950">{comment.body}</p>
            {deleteConfirmation === comment.id && <div className="mt-3 rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-sm font-semibold text-neutral-900">Ta bort kommentaren?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button neutral type="button" variant="danger" className="min-h-9 px-3 py-1.5 text-xs" disabled={disabled || saving || loading} onClick={() => void remove(comment, scope)}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}{saving ? "Tar bort…" : "Ta bort kommentaren"}
                </Button>
                <Button neutral type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" disabled={saving} onClick={() => { setDeleteConfirmation(null); setError(null); }}>Avbryt</Button>
              </div>
            </div>}
          </li>)}
        </ul>
        {nextOffset !== null && <Button neutral type="button" variant="ghost" className="mt-3 text-sm" disabled={disabled || loading || saving} onClick={() => void load(nextOffset)}>Visa äldre kommentarer</Button>}
        <div className="mt-4 border-t border-neutral-200 pt-4">
        <form onSubmit={event => { event.preventDefault(); if (draft?.body.trim()) void save(draft, scope); }}>
          <label htmlFor={`comment-${scope}-${requirementId}`} className="block text-xs font-semibold text-neutral-800">{label}</label>
          {scope === "product" && <p className="mt-1 text-xs text-neutral-600">{targetNumber ? `${draft?.target?.name || productName} · NRF ${targetNumber}` : "Välj en huvudprodukt för att kommentera den."}</p>}
          {scope === "product" && oldTarget && <p className="mt-1 text-xs font-semibold text-neutral-900">Utkastet gäller produkten du valde tidigare. Spara det eller töm fältet för att kommentera det nya valet.</p>}
          <textarea id={`comment-${scope}-${requirementId}`} rows={3} maxLength={3000} value={draft?.body || ""} disabled={blocked} placeholder={scope === "post" ? "Skriv en kommentar om posten…" : "Skriv en kommentar om produkten…"}
            onChange={event => { const body = event.target.value; setNotice(null); setDraft(body ? { id: draft?.id || crypto.randomUUID(), body,
              target: draft ? draft.target : scope === "product" ? { number: productNumber, name: productName } : null } : null); }}
            className="mt-2 block w-full resize-y rounded-md border-neutral-300 text-sm focus:border-neutral-500 focus:ring-neutral-500 disabled:bg-neutral-50" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-neutral-500">{draft?.body.length || 0}/3 000</span>
            <Button neutral type="submit" className="min-h-10 px-3 py-2 text-sm" disabled={blocked || !draft?.body.trim()}>{scope === "post" ? "Spara postkommentar" : "Spara produktkommentar"}</Button>
          </div>
        </form>
          <p className="mt-2 text-xs leading-5 text-neutral-600">Sparas separat från produktvalet och följer med i Excel för aktuell post och godkänd produkt.</p>
        </div>
      </div>
  </section>;
  }

  return children({ postComments: section("post"), productComments: section("product") });
}
