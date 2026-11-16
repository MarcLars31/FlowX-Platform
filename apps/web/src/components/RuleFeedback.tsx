"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Flag, Check } from "lucide-react";
import { FEEDBACK_KINDS, type RuleFeedback, type RuleFeedbackKind, type RuleFeedbackStatus } from "@/lib/rule-feedback";
import { RULE_CATALOG_VERSION, type CatalogRule } from "@/lib/matching-rule-catalog";
import styles from "./MatchingRuleBrowser.module.css";

const DEMO_KEY = "scipx-rule-feedback-demo-v1";

async function requestFeedback(method: string, data?: unknown) {
  const response = await fetch("/api/rules/feedback", { method, credentials: "same-origin", cache: "no-store", ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Flaggningen kunde inte sparas. Försök igen.");
  return result;
}

export function useRuleFeedback(preview: boolean) {
  const [rows, setRows] = useState<RuleFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const read = useCallback(async (): Promise<RuleFeedback[]> => preview ? JSON.parse(localStorage.getItem(DEMO_KEY) || "[]") : (await requestFeedback("GET")).feedback, [preview]);
  const reload = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await read();
      if (current === sequence.current) { setRows(result); setError(""); }
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : "Flaggningarna kunde inte läsas."); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [read]);
  useEffect(() => {
    let cancelled = false;
    const current = ++sequence.current;
    read().then(result => { if (!cancelled && current === sequence.current) { setRows(result); setError(""); } })
      .catch(cause => { if (!cancelled && current === sequence.current) setError(cause instanceof Error ? cause.message : "Flaggningarna kunde inte läsas."); })
      .finally(() => { if (!cancelled && current === sequence.current) setLoading(false); });
    return () => { cancelled = true; };
  }, [read]);

  function remember(row: RuleFeedback) {
    // Invalidate an older list request so it cannot overwrite a newly saved report.
    sequence.current++;
    if (preview) {
      const stored: RuleFeedback[] = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
      localStorage.setItem(DEMO_KEY, JSON.stringify([row, ...stored.filter(item => item.id !== row.id)]));
    }
    setRows(current => [row, ...current.filter(item => item.id !== row.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setLoading(false);
  }
  async function submit(rule: CatalogRule, id: string, kind: RuleFeedbackKind, body: string) {
    const row: RuleFeedback = preview ? {
      id, rule_id: rule.id, rule_title: rule.title, rule_version: RULE_CATALOG_VERSION,
      kind, body: body.trim(), author_id: "preview", author_name: "Testanvändare", organization_id: null,
      status: "open", created_at: new Date().toISOString(), resolved_at: null, resolved_by: null, can_resolve: true
    } : (await requestFeedback("POST", { id, rule_id: rule.id, kind, body })).feedback;
    remember(row);
  }
  async function update(row: RuleFeedback, status: RuleFeedbackStatus) {
    const updated: RuleFeedback = preview ? { ...row, status, resolved_at: status === "resolved" ? new Date().toISOString() : null, resolved_by: status === "resolved" ? "preview" : null } : (await requestFeedback("PATCH", { id: row.id, status })).feedback;
    remember(updated);
  }
  return { rows, loading, error, reload: () => { setLoading(true); return reload(); }, submit, update };
}

type FeedbackController = ReturnType<typeof useRuleFeedback>;

export function RuleFlagForm({ rule, feedback, preview }: { rule: CatalogRule; feedback: FeedbackController; preview: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RuleFeedbackKind>("error");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const id = useRef<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending || !body.trim()) return;
    setPending(true); setError("");
    id.current ??= crypto.randomUUID();
    try {
      await feedback.submit(rule, id.current, kind, body);
      id.current = null; setBody(""); setOpen(false); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Flaggningen kunde inte sparas."); }
    finally { setPending(false); }
  }
  const count = feedback.rows.filter(row => row.rule_id === rule.id && row.status === "open").length;
  return <div className={styles.flagArea}>
    <div className={styles.feedbackActions}>
      <button type="button" aria-expanded={open} aria-controls={`flag-form-${rule.id}`} onClick={() => { setOpen(!open); setSaved(false); }} disabled={pending}><Flag size={14} aria-hidden="true" />Flagga regel{count > 0 && ` (${count} öppna)`}</button>
      {saved && <span role="status"><Check size={14} aria-hidden="true" />{preview ? "Testflaggan sparades i denna webbläsare." : "Flaggningen är sparad under Flaggade regler."}</span>}
    </div>
    {open && <form id={`flag-form-${rule.id}`} className={styles.flagForm} onSubmit={submit}>
      <label>Typ<select value={kind} disabled={pending} onChange={event => { setKind(event.target.value as RuleFeedbackKind); id.current = null; }}>{Object.entries(FEEDBACK_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Kommentar<textarea required maxLength={3000} rows={4} value={body} disabled={pending} placeholder="Beskriv felet eller ändringen. Ange gärna ett exempel med PDF-post och NRF-nummer." onChange={event => { setBody(event.target.value); id.current = null; }} /></label>
      <div className={styles.feedbackActions}><small>{body.length.toLocaleString("sv-SE")} / 3 000</small><button type="submit" disabled={pending || !body.trim()}>{pending ? "Sparar…" : "Spara flaggning"}</button><button type="button" disabled={pending} onClick={() => setOpen(false)}>Avbryt</button></div>
      {error && <p role="alert">{error}</p>}
    </form>}
  </div>;
}

export function RuleFeedbackList({ feedback, onRule }: { feedback: FeedbackController; onRule: (id: string) => void }) {
  const [status, setStatus] = useState("open");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const filtered = feedback.rows.filter(row => status === "all" || row.status === status);
  async function update(row: RuleFeedback) {
    setPending(row.id); setError("");
    try { await feedback.update(row, row.status === "open" ? "resolved" : "open"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Status kunde inte sparas."); }
    finally { setPending(null); }
  }
  return <section className={styles.feedbackList} aria-label="Flaggade regler">
    <div className={styles.feedbackActions}><h2>Flaggade regler</h2><label className={styles.statusFilter}>Visa<select aria-label="Flaggningsstatus" value={status} onChange={event => setStatus(event.target.value)}><option value="open">Öppna ({feedback.rows.filter(row => row.status === "open").length})</option><option value="resolved">Hanterade ({feedback.rows.filter(row => row.status === "resolved").length})</option><option value="all">Alla ({feedback.rows.length})</option></select></label><button type="button" onClick={() => void feedback.reload()} disabled={feedback.loading || !!pending}>Uppdatera</button></div>
    <p className={styles.feedbackHint}>En hanterad flagga ligger kvar i historiken. Statusen ändrar inte matchningsregeln.</p>
    {error && <p role="alert">{error}</p>}
    {feedback.loading && <p role="status">Läser flaggningar…</p>}
    {!feedback.loading && !feedback.error && !filtered.length && <p className={styles.feedbackEmpty}>Inga {status === "resolved" ? "hanterade" : status === "open" ? "öppna" : "sparade"} flaggningar. Välj en regel och klicka på Flagga regel.</p>}
    {filtered.map(row => <article key={row.id} className={styles.feedbackCard}>
      <div className={styles.feedbackActions}><span className={styles.kindLabel}><Flag size={13} aria-hidden="true" />{FEEDBACK_KINDS[row.kind]}</span><span>{row.status === "open" ? "Öppen" : "Hanterad"}</span></div>
      <button className={styles.feedbackRuleLink} type="button" onClick={() => onRule(row.rule_id)}>{row.rule_title}</button>
      <p className={styles.feedbackBody}>{row.body}</p>
      <div className={styles.feedbackActions}><small>{row.author_name} · {new Date(row.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}{row.resolved_at && ` · Hanterad ${new Date(row.resolved_at).toLocaleDateString("sv-SE")}`}</small>{row.can_resolve && <button type="button" disabled={!!pending} onClick={() => void update(row)}>{pending === row.id ? "Sparar…" : row.status === "open" ? "Markera som hanterad" : "Öppna igen"}</button>}</div>
    </article>)}
  </section>;
}
