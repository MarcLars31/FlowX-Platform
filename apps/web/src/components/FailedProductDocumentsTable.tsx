"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search
} from "lucide-react";
import { Button } from "@/components/Button";

const FAILURE_STATUSES = [
  "partial",
  "no_products_found",
  "unreadable",
  "failed"
] as const;

type FailureStatus = (typeof FAILURE_STATUSES)[number];
type SortOption = "newest" | "oldest" | "supplier" | "status";
type ManualReviewStatus = "not_required" | "required" | "in_review" | "resolved";

type FailedDocument = {
  id: string;
  supplier_name: string | null;
  title: string;
  file_name: string | null;
  document_type: string | null;
  original_pdf_url: string | null;
  source_page_url: string | null;
  page_count: number | null;
  current_processing_status: FailureStatus;
  current_error_code: string | null;
  current_error_message: string | null;
  failed_page_numbers: number[];
  identified_product_count: number;
  failed_product_count: number;
  processing_attempt_count: number;
  last_processing_at: string | null;
  manual_review_status: ManualReviewStatus;
};

type Filters = {
  status: "all" | FailureStatus;
  supplier: string;
  errorCode: string;
  from: string;
  to: string;
  query: string;
};

type ListResponse = {
  documents?: FailedDocument[];
  total?: number;
  page?: number;
  limit?: number;
  statistics?: Partial<Record<FailureStatus, number>>;
  error?: string;
};

const EMPTY_FILTERS: Filters = {
  status: "all",
  supplier: "",
  errorCode: "",
  from: "",
  to: "",
  query: ""
};

const STATUS_LABELS: Record<FailureStatus, string> = {
  partial: "Delvis läst",
  no_products_found: "Inga produkter hittades",
  unreadable: "Oläslig",
  failed: "Tekniskt fel"
};

const ERROR_LABELS: Record<string, string> = {
  encrypted_pdf: "PDF-filen är krypterad",
  password_protected: "PDF-filen är lösenordsskyddad",
  corrupt_file: "Filen verkar vara skadad",
  invalid_pdf: "Filen är inte en giltig PDF",
  empty_document: "Dokumentet saknar innehåll",
  image_only_pdf: "Dokumentet innehåller endast bilder",
  ocr_failed: "Textigenkänningen misslyckades",
  text_extraction_failed: "Texten kunde inte läsas",
  table_extraction_failed: "Tabellerna kunde inte läsas",
  unsupported_encoding: "Dokumentets teckenkodning stöds inte",
  timeout: "Bearbetningen tog för lång tid",
  out_of_memory: "Dokumentet krävde för mycket minne",
  no_product_identifiers: "Inga produktidentifierare hittades",
  no_products_found: "Inga produkter hittades",
  extractor_unavailable: "PDF-läsaren är inte tillgänglig",
  unknown_error: "Ett okänt fel inträffade"
};

export function FailedProductDocumentsTable() {
  const [documents, setDocuments] = useState<FailedDocument[]>([]);
  const [statistics, setStatistics] = useState<Partial<Record<FailureStatus, number>>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<SortOption>("newest");
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const queryString = useMemo(
    () => createQueryString(filters, page, limit, sort),
    [filters, page, limit, sort]
  );

  const loadDocuments = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/pkms/document-processing?${queryString}`, {
          cache: "no-store",
          signal
        });
        const payload = (await response.json().catch(() => ({}))) as ListResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Listan kunde inte hämtas.");
        }

        const nextDocuments = payload.documents ?? [];
        setDocuments(nextDocuments);
        setTotal(payload.total ?? 0);
        setStatistics(payload.statistics ?? {});
        setSelectedIds((current) => {
          const visible = new Set(nextDocuments.map((document) => document.id));
          return new Set([...current].filter((id) => visible.has(id)));
        });
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Databladen kunde inte hämtas."
        );
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [queryString]
  );

  useEffect(() => {
    const controller = new AbortController();
    // The request synchronizes this client-side table with the current filters.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDocuments(controller.signal);
    return () => controller.abort();
  }, [loadDocuments]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const allVisibleSelected =
    documents.length > 0 && documents.every((document) => selectedIds.has(document.id));
  const exportUrl = `/api/pkms/document-processing/export?${createExportQueryString(filters)}`;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters({
      ...draftFilters,
      supplier: draftFilters.supplier.trim(),
      errorCode: draftFilters.errorCode.trim(),
      query: draftFilters.query.trim()
    });
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function selectStatus(status: "all" | FailureStatus) {
    const next = { ...draftFilters, status };
    setDraftFilters(next);
    setFilters({ ...filters, status });
    setPage(1);
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        documents.forEach((document) => next.delete(document.id));
      } else {
        documents.forEach((document) => next.add(document.id));
      }
      return next;
    });
  }

  function toggleDocument(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function retryOne(document: FailedDocument) {
    await performAction(`retry:${document.id}`, async () => {
      const response = await fetch(
        `/api/pkms/document-processing/${encodeURIComponent(document.id)}/retry`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "Återförsöksfunktionen är ännu inte tillgänglig på servern."
          )
        );
      }
      setMessage(`Ett nytt läsförsök har startats för ${document.file_name ?? document.title}.`);
      await loadDocuments();
    });
  }

  async function retrySelected() {
    const documentIds = [...selectedIds];
    if (documentIds.length === 0) return;
    await performAction("retry:selected", async () => {
      const response = await fetch("/api/pkms/document-processing/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds })
      });
      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "Återförsöksfunktionen är ännu inte tillgänglig på servern."
          )
        );
      }
      setMessage(`${documentIds.length} dokument har lagts i kön för ett nytt läsförsök.`);
      setSelectedIds(new Set());
      await loadDocuments();
    });
  }

  async function markForReview(documentIds: string[]) {
    if (documentIds.length === 0) return;
    await performAction(`review:${documentIds.join(",")}`, async () => {
      const responses = await Promise.all(
        documentIds.map((id) =>
          fetch(`/api/pkms/document-processing/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ manualReviewStatus: "required" })
          })
        )
      );
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        throw new Error(
          await responseError(failedResponse, "Dokumenten kunde inte markeras för granskning.")
        );
      }
      setMessage(
        documentIds.length === 1
          ? "Dokumentet har markerats för manuell granskning."
          : `${documentIds.length} dokument har markerats för manuell granskning.`
      );
      await loadDocuments();
    });
  }

  async function performAction(action: string, operation: () => Promise<void>) {
    setBusyAction(action);
    setError(null);
    setMessage(null);
    try {
      await operation();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Åtgärden misslyckades."
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatusCard
          label="Alla misslyckade"
          count={FAILURE_STATUSES.reduce((sum, status) => sum + (statistics[status] ?? 0), 0)}
          active={filters.status === "all"}
          onClick={() => selectStatus("all")}
        />
        {FAILURE_STATUSES.map((status) => (
          <StatusCard
            key={status}
            label={STATUS_LABELS[status]}
            count={statistics[status] ?? 0}
            active={filters.status === status}
            onClick={() => selectStatus(status)}
          />
        ))}
      </section>

      <form
        onSubmit={applyFilters}
        className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="block xl:col-span-2">
            <span className="mb-2 block text-sm font-medium text-ink-700">Sök</span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={draftFilters.query}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, query: event.target.value }))
                }
                placeholder="Filnamn, produktnummer eller titel"
                className="block h-11 w-full rounded-lg border-ink-200 bg-white pl-10 text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
              />
            </span>
          </label>
          <FilterInput
            label="Leverantör"
            value={draftFilters.supplier}
            onChange={(supplier) =>
              setDraftFilters((current) => ({ ...current, supplier }))
            }
            placeholder="Till exempel Victaulic"
          />
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-ink-700">Status</span>
            <select
              value={draftFilters.status}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  status: event.target.value as Filters["status"]
                }))
              }
              className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
            >
              <option value="all">Alla statusar</option>
              {FAILURE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <FilterInput
            label="Felkod"
            value={draftFilters.errorCode}
            onChange={(errorCode) =>
              setDraftFilters((current) => ({ ...current, errorCode }))
            }
            placeholder="Till exempel ocr_failed"
          />
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-ink-700">Sortering</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortOption);
                setPage(1);
              }}
              className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
            >
              <option value="newest">Senaste försök först</option>
              <option value="oldest">Äldsta försök först</option>
              <option value="supplier">Leverantör</option>
              <option value="status">Status</option>
            </select>
          </label>
          <FilterInput
            label="Från datum"
            type="date"
            value={draftFilters.from}
            onChange={(from) => setDraftFilters((current) => ({ ...current, from }))}
          />
          <FilterInput
            label="Till datum"
            type="date"
            value={draftFilters.to}
            onChange={(to) => setDraftFilters((current) => ({ ...current, to }))}
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="ghost" onClick={clearFilters}>
            Rensa filter
          </Button>
          <Button type="submit">
            <Search className="h-4 w-4" aria-hidden="true" />
            Filtrera
          </Button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}
      {message && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{message}</p>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-ink-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-ink-600">
            <span className="font-semibold text-ink-900">{total}</span> dokument
            {selectedIds.size > 0 ? ` · ${selectedIds.size} valda` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => markForReview([...selectedIds])}
                  disabled={busyAction !== null}
                >
                  Markera valda för granskning
                </Button>
                <Button onClick={retrySelected} disabled={busyAction !== null}>
                  {busyAction === "retry:selected" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  )}
                  Kör om valda
                </Button>
              </>
            )}
            <a
              href={exportUrl}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 transition hover:border-flow-300 hover:bg-flow-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportera CSV
            </a>
            <Button
              variant="secondary"
              onClick={() => loadDocuments()}
              disabled={isLoading || busyAction !== null}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Uppdatera
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[92rem] w-full text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-600">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Välj alla dokument på sidan"
                    className="rounded border-ink-300 text-flow-600 focus:ring-flow-500"
                  />
                </th>
                <th className="px-3 py-3">Leverantör och dokument</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Felorsak</th>
                <th className="px-3 py-3">Resultat</th>
                <th className="px-3 py-3">Försök</th>
                <th className="px-3 py-3">Senaste försök</th>
                <th className="px-3 py-3">Manuell granskning</th>
                <th className="px-4 py-3 text-right">Åtgärder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {documents.map((document) => {
                const selected = selectedIds.has(document.id);
                const originalUrl = safeExternalUrl(document.original_pdf_url);
                const retryBusy = busyAction === `retry:${document.id}`;
                const reviewMarked = ["required", "in_review"].includes(
                  document.manual_review_status
                );

                return (
                  <tr key={document.id} className={selected ? "bg-flow-50/60" : "bg-white"}>
                    <td className="px-4 py-4 align-top">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleDocument(document.id)}
                        aria-label={`Välj ${document.file_name ?? document.title}`}
                        className="rounded border-ink-300 text-flow-600 focus:ring-flow-500"
                      />
                    </td>
                    <td className="max-w-sm px-3 py-4 align-top">
                      <p className="font-semibold text-ink-900">
                        {document.supplier_name || "Okänd leverantör"}
                      </p>
                      <Link
                        href={`/admin/documents/${encodeURIComponent(document.id)}`}
                        className="mt-1 line-clamp-2 text-ink-700 underline-offset-2 hover:text-flow-700 hover:underline"
                      >
                        {document.title}
                      </Link>
                      <p className="mt-1 truncate text-xs text-ink-500">
                        {document.file_name || "Filnamn saknas"}
                      </p>
                    </td>
                    <td className="px-3 py-4 align-top">
                      <StatusBadge status={document.current_processing_status} />
                    </td>
                    <td className="max-w-sm px-3 py-4 align-top">
                      <p className="font-medium text-ink-800">
                        {humanError(document.current_error_code, document.current_error_message)}
                      </p>
                      {document.current_error_code && (
                        <code className="mt-1 block text-xs text-ink-500">
                          {document.current_error_code}
                        </code>
                      )}
                      {document.failed_page_numbers.length > 0 && (
                        <p className="mt-2 text-xs text-ink-500">
                          Misslyckade sidor: {document.failed_page_numbers.join(", ")}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 align-top text-ink-700">
                      <p>{document.page_count ?? "–"} sidor</p>
                      <p className="mt-1">{document.identified_product_count} hittade</p>
                      {document.failed_product_count > 0 && (
                        <p className="mt-1 text-rose-700">
                          {document.failed_product_count} misslyckade
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-4 align-top text-ink-700">
                      {document.processing_attempt_count}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 align-top text-ink-700">
                      {formatDate(document.last_processing_at)}
                    </td>
                    <td className="px-3 py-4 align-top">
                      <ReviewBadge status={document.manual_review_status} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex justify-end gap-2">
                        <a
                          href={`/api/pkms/document-processing/${encodeURIComponent(document.id)}/file`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-flow-300 hover:bg-flow-50"
                          title="Öppna den sparade PDF-filen"
                        >
                          <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                          PDF
                        </a>
                        {originalUrl && (
                          <a
                            href={originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-flow-300 hover:bg-flow-50"
                            title="Öppna leverantörens originalfil"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Original
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => markForReview([document.id])}
                          disabled={busyAction !== null || reviewMarked}
                          className="inline-flex min-h-9 items-center rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-flow-300 hover:bg-flow-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {reviewMarked ? "Markerad" : "Manuell granskning"}
                        </button>
                        <button
                          type="button"
                          onClick={() => retryOne(document)}
                          disabled={busyAction !== null}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-flow-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-flow-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {retryBusy ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Kör om
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isLoading && documents.length === 0 && (
          <div className="flex min-h-72 items-center justify-center gap-3 text-sm text-ink-600">
            <LoaderCircle className="h-5 w-5 animate-spin text-flow-600" aria-hidden="true" />
            Hämtar misslyckade datablad…
          </div>
        )}
        {!isLoading && documents.length === 0 && (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" aria-hidden="true" />
            <p className="mt-4 font-semibold text-ink-900">Inga dokument matchar filtren</p>
            <p className="mt-1 max-w-md text-sm text-ink-500">
              Rensa filtren eller uppdatera listan för att kontrollera nya bearbetningsfel.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-ink-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm text-ink-600">
            Visa
            <select
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
              className="h-9 rounded-md border-ink-200 bg-white text-sm focus:border-flow-500 focus:ring-flow-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            per sida
          </label>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="min-h-9 px-3 py-1.5"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Föregående
            </Button>
            <span className="text-sm text-ink-600">
              Sida <span className="font-semibold text-ink-900">{page}</span> av {totalPages}
            </span>
            <Button
              variant="secondary"
              className="min-h-9 px-3 py-1.5"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Nästa
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusCard({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border p-4 text-left shadow-sm transition ${
        active
          ? "border-flow-400 bg-flow-50 ring-1 ring-flow-300"
          : "border-ink-200 bg-white hover:border-flow-300"
      }`}
    >
      <span className="block text-2xl font-semibold text-ink-950">{count}</span>
      <span className="mt-1 block text-sm text-ink-600">{label}</span>
    </button>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-ink-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
      />
    </label>
  );
}

function StatusBadge({ status }: { status: FailureStatus }) {
  const colors: Record<FailureStatus, string> = {
    partial: "border-amber-200 bg-amber-50 text-amber-800",
    no_products_found: "border-sky-200 bg-sky-50 text-sky-800",
    unreadable: "border-orange-200 bg-orange-50 text-orange-800",
    failed: "border-rose-200 bg-rose-50 text-rose-800"
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${colors[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function ReviewBadge({ status }: { status: ManualReviewStatus }) {
  const labels: Record<ManualReviewStatus, string> = {
    not_required: "Inte markerad",
    required: "Krävs",
    in_review: "Granskas",
    resolved: "Löst"
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        status === "required" || status === "in_review"
          ? "bg-violet-100 text-violet-800"
          : "bg-ink-100 text-ink-700"
      }`}
    >
      {labels[status]}
    </span>
  );
}

function createQueryString(
  filters: Filters,
  page: number,
  limit: number,
  sort: SortOption
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort
  });
  addFilterParams(params, filters);
  return params.toString();
}

function createExportQueryString(filters: Filters) {
  const params = new URLSearchParams();
  addFilterParams(params, filters);
  return params.toString();
}

function addFilterParams(params: URLSearchParams, filters: Filters) {
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.supplier) params.set("supplier", filters.supplier);
  if (filters.errorCode) params.set("errorCode", filters.errorCode);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.query) params.set("q", filters.query);
}

function humanError(code: string | null, message: string | null) {
  return message?.trim() || (code ? ERROR_LABELS[code] : null) || "Ingen felorsak registrerad";
}

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatDate(value: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

async function responseError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? fallback;
}
