"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/Button";

type Issue = {
  issue_type: string;
  source_record_key: string | null;
  product_id: number | null;
  external_product_id: string | null;
  supplier: string | null;
  manufacturer_article_number: string | null;
  variant: string | null;
  reason: string;
  detected_at: string;
};

type ReportResponse = {
  issues: Issue[];
  total: number;
  page: number;
  limit: number;
  statistics: Record<string, number>;
  latestRun: {
    status: string;
    source_total: number | null;
    records_received: number;
    created_count: number;
    updated_count: number;
    unchanged_count: number;
    rejected_count: number;
    error_count: number;
    completed_at: string | null;
  } | null;
  error?: string;
};

const issueLabels: Record<string, string> = {
  missing_database: "Saknas i databasen",
  missing_index: "Saknas i sökindex",
  hidden_filter: "Dold av filter",
  failed_import: "Misslyckad import"
};

export function SprsokReconciliationPanel() {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [page, setPage] = useState(1);
  const [issueType, setIssueType] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const parameters = new URLSearchParams({ page: String(page), limit: "25" });
      if (issueType) parameters.set("issueType", issueType);
      if (query.trim()) parameters.set("q", query.trim());
      const response = await fetch(`/api/admin/sprsok/reconciliation?${parameters}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as ReportResponse;
      if (!response.ok) throw new Error(payload.error ?? "Rapporten kunde inte hämtas.");
      setData(payload);
      setSelected(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Rapporten kunde inte hämtas.");
    } finally {
      setLoading(false);
    }
  }, [issueType, page, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit ?? 25)));
  const allVisibleSelected = useMemo(
    () => Boolean(data?.issues.length) && data!.issues.every((row) => row.source_record_key && selected.has(row.source_record_key)),
    [data, selected]
  );

  async function runAction(
    action: "sync" | "reconcile" | "repair" | "reindex",
    dryRun: boolean,
    selectedOnly = false
  ) {
    if (!dryRun && !window.confirm("Åtgärden kommer att ändra Sprsok-data. Vill du fortsätta?")) return;
    setRunning(action);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/sprsok/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          dryRun,
          sourceRecordKeys: selectedOnly ? [...selected] : []
        })
      });
      const payload = (await response.json()) as { error?: string; result?: unknown; report?: { repaired?: number } };
      if (!response.ok) throw new Error(payload.error ?? "Åtgärden misslyckades.");
      setMessage(
        dryRun
          ? "Testkörningen slutfördes utan att ändra produktdata."
          : `Åtgärden slutfördes${payload.report?.repaired != null ? `, ${payload.report.repaired} poster reparerades` : ""}.`
      );
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Åtgärden misslyckades.");
    } finally {
      setRunning(null);
    }
  }

  function toggleAll() {
    if (!data) return;
    setSelected(
      allVisibleSelected
        ? new Set()
        : new Set(data.issues.flatMap((row) => row.source_record_key ? [row.source_record_key] : []))
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(issueLabels).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setIssueType(issueType === key ? "" : key); setPage(1); }}
            className={`rounded-lg border bg-white p-4 text-left shadow-sm transition ${issueType === key ? "border-flow-500 ring-1 ring-flow-500" : "border-ink-200 hover:border-flow-300"}`}
          >
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-ink-500">{label}</span>
            <span className="mt-2 block text-2xl font-semibold text-ink-950">{data?.statistics[key] ?? 0}</span>
          </button>
        ))}
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 text-sm font-medium text-ink-700">
            Sök i avvikelser
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              className="mt-2 block h-10 w-full rounded-lg border-ink-200 text-sm"
              placeholder="Artikelnummer, leverantör eller felorsak"
            />
          </label>
          <Button variant="secondary" onClick={() => void runAction("sync", true)} disabled={Boolean(running)}>
            Testkör synk
          </Button>
          <Button onClick={() => void runAction("sync", false)} disabled={Boolean(running)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Starta synk
          </Button>
          <a
            href={`/api/admin/sprsok/reconciliation/export${issueType ? `?issueType=${encodeURIComponent(issueType)}` : ""}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> CSV
          </a>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-4">
          <Button
            variant="secondary"
            onClick={() => void runAction("repair", false, true)}
            disabled={selected.size === 0 || Boolean(running)}
          >
            Reparera valda ({selected.size})
          </Button>
          <Button
            variant="secondary"
            onClick={() => void runAction("reindex", false, selected.size > 0)}
            disabled={Boolean(running)}
          >
            {selected.size > 0 ? "Indexera valda" : "Bygg om hela indexet"}
          </Button>
          {data?.latestRun && (
            <p className="text-xs text-ink-500">
              Senaste synk: {data.latestRun.status}, {data.latestRun.records_received} mottagna,
              {" "}{data.latestRun.error_count} fel.
            </p>
          )}
        </div>
      </section>

      {message && (
        <div className="flex gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {message}
        </div>
      )}
      {error && (
        <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink-200">
            <thead className="bg-ink-50">
              <tr>
                <th className="px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Välj alla synliga" /></th>
                {['Avvikelse', 'Leverantör', 'Artikelnummer', 'Variant', 'Orsak', 'Tid'].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-ink-500">Hämtar avstämning…</td></tr>
              ) : data?.issues.length ? data.issues.map((row, index) => (
                <tr key={`${row.issue_type}-${row.source_record_key ?? index}`}>
                  <td className="px-4 py-3"><input type="checkbox" disabled={!row.source_record_key} checked={Boolean(row.source_record_key && selected.has(row.source_record_key))} onChange={() => {
                    if (!row.source_record_key) return;
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(row.source_record_key!)) next.delete(row.source_record_key!); else next.add(row.source_record_key!);
                      return next;
                    });
                  }} aria-label={`Välj ${row.manufacturer_article_number ?? "post"}`} /></td>
                  <td className="px-4 py-3 text-sm font-medium text-ink-800">{issueLabels[row.issue_type] ?? row.issue_type}</td>
                  <td className="px-4 py-3 text-sm text-ink-700">{row.supplier || "—"}</td>
                  <td className="px-4 py-3 text-sm text-ink-700">{row.manufacturer_article_number || "—"}</td>
                  <td className="px-4 py-3 text-sm text-ink-700">{row.variant || "—"}</td>
                  <td className="max-w-md px-4 py-3 text-sm text-ink-600">{row.reason}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">{new Date(row.detected_at).toLocaleString("sv-SE")}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-ink-500">Inga avvikelser matchar filtret.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3 text-sm">
          <span className="text-ink-500">Sida {page} av {pageCount}, {data?.total ?? 0} avvikelser</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>Föregående</Button>
            <Button variant="secondary" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount || loading}>Nästa</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
