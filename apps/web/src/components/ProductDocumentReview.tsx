"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  X
} from "lucide-react";
import { Button } from "@/components/Button";

type DocumentRecord = {
  id: string;
  title?: string | null;
  supplier_name?: string | null;
  file_name?: string | null;
  document_type?: string | null;
  original_pdf_url?: string | null;
  source_page_url?: string | null;
  file_size_bytes?: number | null;
  page_count?: number | null;
  language_code?: string | null;
  current_processing_status?: string | null;
  current_error_code?: string | null;
  current_error_message?: string | null;
  failed_page_numbers?: number[] | null;
  identified_product_count?: number | null;
  updated_product_count?: number | null;
  failed_product_count?: number | null;
  processing_attempt_count?: number | null;
  last_processing_at?: string | null;
  reader_version?: string | null;
  manual_review_status?: string | null;
  downloaded_at?: string | null;
};

type ProcessingAttempt = {
  id: string;
  attempt_number?: number | null;
  trigger_type?: string | null;
  status?: string | null;
  page_count?: number | null;
  identified_product_count?: number | null;
  updated_product_count?: number | null;
  failed_product_count?: number | null;
  failed_row_count?: number | null;
  error_code?: string | null;
  admin_error_message?: string | null;
  failed_page_numbers?: number[] | null;
  extraction_methods?: string[] | null;
  reader_version?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
};

type ProductSummary = {
  id?: string;
  manufacturer?: string | null;
  product_no?: string | null;
  product_name?: string | null;
  status?: string | null;
};

type VariantSummary = {
  id?: string;
  sku?: string | null;
  manufacturer_sku?: string | null;
  gtin?: string | null;
  variant_name?: string | null;
  technical_status?: string | null;
};

type ProductDocumentRelation = {
  id: string;
  product_id?: string | null;
  product_variant_id?: string | null;
  page_numbers?: number[] | null;
  extracted_product_number?: string | null;
  match_method?: string | null;
  match_score?: number | string | null;
  verification_status?: string | null;
  source_excerpt?: string | null;
  products?: ProductSummary | ProductSummary[] | null;
  product_variants?: VariantSummary | VariantSummary[] | null;
};

type FieldProvenance = {
  id: string;
  product_id?: string | null;
  product_variant_id?: string | null;
  field_key?: string | null;
  page_number?: number | null;
  original_value?: string | null;
  normalized_value?: unknown;
  extraction_method?: string | null;
  confidence?: number | string | null;
  source_excerpt?: string | null;
  verification_status?: string | null;
};

type ChangeProposal = {
  id: string;
  provenance_id?: string | null;
  product_id?: string | null;
  product_variant_id?: string | null;
  proposal_kind?: string | null;
  field_key?: string | null;
  existing_value?: unknown;
  proposed_value?: unknown;
  conflict_type?: string | null;
  significance?: string | null;
  confidence?: number | string | null;
  blocked_by_lock?: boolean | null;
  status?: string | null;
  review_note?: string | null;
  created_at?: string | null;
};

type ProductReviewItem = {
  id: string;
  product_id?: string | null;
  product_variant_id?: string | null;
  product_document_id?: string | null;
  change_proposal_id?: string | null;
  review_type?: string | null;
  status?: string | null;
  priority?: string | null;
  title?: string | null;
  reason?: string | null;
  evidence?: unknown;
  candidate_payload?: Record<string, unknown> | null;
  review_note?: string | null;
  created_at?: string | null;
};

type DetailResponse = {
  document?: DocumentRecord;
  attempts?: ProcessingAttempt[];
  products?: ProductDocumentRelation[];
  provenance?: FieldProvenance[];
  proposals?: ChangeProposal[];
  reviewItems?: ProductReviewItem[];
  error?: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Väntar",
  processing: "Bearbetas",
  success: "Lyckades",
  partial: "Delvis läst",
  no_products_found: "Inga produkter hittades",
  unreadable: "Oläslig",
  failed: "Tekniskt fel",
  needs_review: "Behöver granskas",
  verified: "Verifierad",
  rejected: "Avvisad",
  superseded: "Ersatt",
  approved: "Godkänd",
  applied: "Tillämpad",
  reverted: "Återställd"
};

const TRIGGER_LABELS: Record<string, string> = {
  initial: "Första läsningen",
  automatic_retry: "Automatiskt återförsök",
  manual_retry: "Manuellt återförsök",
  reader_upgrade: "Ny version av PDF-läsaren"
};

const PROPOSAL_LABELS: Record<string, string> = {
  create_product: "Skapa produkt",
  link_document: "Koppla dokument",
  update_field: "Uppdatera fält",
  add_attribute: "Lägg till egenskap"
};

const REVIEW_TYPE_LABELS: Record<string, string> = {
  document_failure: "Dokumentfel",
  partial_extraction: "Delvis extraktion",
  no_products: "Inga produkter",
  new_product: "Ny produkt",
  product_match: "Produktmatchning",
  locked_field: "LÃ¥st fÃ¤lt"
};

export function ProductDocumentReview({ documentId }: { documentId: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadDocument = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/pkms/document-processing/${encodeURIComponent(documentId)}`,
          { cache: "no-store", signal }
        );
        const payload = (await response.json().catch(() => ({}))) as DetailResponse;
        if (!response.ok || !payload.document) {
          throw new Error(payload.error ?? "Dokumentet kunde inte hämtas.");
        }
        setData(payload);
        setReviewNotes(
          Object.fromEntries(
            [...(payload.proposals ?? []), ...(payload.reviewItems ?? [])].map(
              (item) => [item.id, item.review_note ?? ""]
            )
          )
        );
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(
          loadError instanceof Error ? loadError.message : "Dokumentet kunde inte hämtas."
        );
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [documentId]
  );

  useEffect(() => {
    const controller = new AbortController();
    // The request loads the protected admin detail after the route has mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDocument(controller.signal);
    return () => controller.abort();
  }, [loadDocument]);

  const provenanceById = useMemo(
    () => new Map((data?.provenance ?? []).map((item) => [item.id, item])),
    [data?.provenance]
  );

  async function reviewProposal(
    proposal: ChangeProposal,
    decision: "approved" | "rejected"
  ) {
    setBusyProposalId(proposal.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/pkms/document-processing/proposals/${encodeURIComponent(proposal.id)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            reviewNote: reviewNotes[proposal.id]?.trim() || undefined
          })
        }
      );
      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            "Granskningsfunktionen är ännu inte tillgänglig på servern."
          )
        );
      }
      setMessage(
        decision === "approved"
          ? "Ändringsförslaget har godkänts."
          : "Ändringsförslaget har avvisats."
      );
      await loadDocument();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error ? reviewError.message : "Granskningen misslyckades."
      );
    } finally {
      setBusyProposalId(null);
    }
  }

  async function reviewProductItem(
    reviewItem: ProductReviewItem,
    decision: "approved" | "rejected"
  ) {
    setBusyProposalId(reviewItem.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/pkms/document-processing/review-items/${encodeURIComponent(reviewItem.id)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            reviewNote: reviewNotes[reviewItem.id]?.trim() || undefined
          })
        }
      );
      if (!response.ok) {
        throw new Error(
          await responseError(response, "Produktgranskningen kunde inte sparas.")
        );
      }
      setMessage(
        decision === "approved"
          ? "Produktkandidaten har godkÃ¤nts."
          : "Produktkandidaten har avvisats."
      );
      await loadDocument();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error ? reviewError.message : "Granskningen misslyckades."
      );
    } finally {
      setBusyProposalId(null);
    }
  }

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[32rem] items-center justify-center gap-3 text-sm text-ink-600">
        <LoaderCircle className="h-5 w-5 animate-spin text-flow-600" aria-hidden="true" />
        Hämtar dokumentgranskningen…
      </div>
    );
  }

  if (!data?.document) {
    return (
      <div className="space-y-5">
        <Link
          href="/admin/documents/failed"
          className="inline-flex items-center gap-2 text-sm font-semibold text-flow-700 hover:text-flow-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Tillbaka till misslyckade datablad
        </Link>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <p className="font-semibold">Dokumentet kunde inte öppnas</p>
          <p className="mt-1 text-sm">{error ?? "Dokumentet finns inte eller är inte tillgängligt."}</p>
        </div>
      </div>
    );
  }

  const document = data.document;
  const attempts = data.attempts ?? [];
  const products = data.products ?? [];
  const provenance = data.provenance ?? [];
  const proposals = data.proposals ?? [];
  const reviewItems = (data.reviewItems ?? []).filter(
    (reviewItem) => !reviewItem.change_proposal_id
  );
  const pdfUrl = `/api/pkms/document-processing/${encodeURIComponent(document.id)}/file`;
  const originalUrl = safeExternalUrl(document.original_pdf_url);
  const sourcePageUrl = safeExternalUrl(document.source_page_url);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Link
          href="/admin/documents/failed"
          className="inline-flex items-center gap-2 text-sm font-semibold text-flow-700 hover:text-flow-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Tillbaka till misslyckade datablad
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
              Dokumentgranskning
            </p>
            <h1 className="mt-2 break-words text-3xl font-semibold text-ink-950">
              {document.title || document.file_name || "Namnlöst datablad"}
            </h1>
            <p className="mt-2 text-sm text-ink-600">
              {document.supplier_name || "Okänd leverantör"}
              {document.file_name ? ` · ${document.file_name}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-flow-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-flow-700"
            >
              <FileSearch className="h-4 w-4" aria-hidden="true" />
              Öppna PDF
            </a>
            {originalUrl && (
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 transition hover:border-flow-300 hover:bg-flow-50"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Originalfil
              </a>
            )}
            <Button
              variant="secondary"
              onClick={() => loadDocument()}
              disabled={isLoading || busyProposalId !== null}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Uppdatera
            </Button>
          </div>
        </div>
      </header>

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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Status">
          <StatusBadge status={document.current_processing_status ?? "unknown"} />
        </SummaryCard>
        <SummaryCard label="Sidor" value={document.page_count ?? "–"} />
        <SummaryCard label="Hittade produkter" value={document.identified_product_count ?? 0} />
        <SummaryCard label="Uppdaterade" value={document.updated_product_count ?? 0} />
        <SummaryCard label="Misslyckade" value={document.failed_product_count ?? 0} />
        <SummaryCard label="Läsförsök" value={document.processing_attempt_count ?? 0} />
      </section>

      <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-950">Dokumentstatus</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <Metadata label="Dokumenttyp" value={document.document_type} />
              <Metadata label="Språk" value={document.language_code} />
              <Metadata label="Filstorlek" value={formatBytes(document.file_size_bytes)} />
              <Metadata label="PDF-läsare" value={document.reader_version} />
              <Metadata label="Senaste försök" value={formatDate(document.last_processing_at)} />
              <Metadata label="Hämtad" value={formatDate(document.downloaded_at)} />
              <Metadata label="Manuell granskning" value={reviewLabel(document.manual_review_status)} />
              <Metadata
                label="Misslyckade sidor"
                value={document.failed_page_numbers?.length ? document.failed_page_numbers.join(", ") : "–"}
              />
            </dl>
          </div>
          {sourcePageUrl && (
            <a
              href={sourcePageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-fit items-center gap-2 text-sm font-semibold text-flow-700 hover:text-flow-900"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Visa källsida
            </a>
          )}
        </div>
        {(document.current_error_code || document.current_error_message) && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Registrerad felorsak</p>
            <p className="mt-1 text-sm text-amber-800">
              {document.current_error_message || "Ingen begriplig felbeskrivning registrerad."}
            </p>
            {document.current_error_code && (
              <code className="mt-2 block text-xs text-amber-700">
                {document.current_error_code}
              </code>
            )}
          </div>
        )}
      </section>

      <ReviewSection
        title="Produktgranskning"
        description="GodkÃ¤nn eller avvisa nya produkter, varianter och osÃ¤kra produktmatchningar."
        count={reviewItems.length}
      >
        {reviewItems.length === 0 ? (
          <EmptyState text="Inga produktkandidater vÃ¤ntar pÃ¥ granskning." />
        ) : (
          <div className="divide-y divide-ink-200">
            {reviewItems.map((reviewItem) => {
              const pending = ["pending", "in_review"].includes(
                reviewItem.status ?? "pending"
              );
              const busy = busyProposalId === reviewItem.id;
              const identityMustBeResolved =
                ["new_product", "product_match"].includes(
                  reviewItem.review_type ?? ""
                ) && !reviewItem.product_id;
              const pageNumbers = candidatePageNumbers(reviewItem.candidate_payload);

              return (
                <article key={reviewItem.id} className="space-y-4 px-5 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-ink-950">
                          {reviewItem.title ||
                            REVIEW_TYPE_LABELS[reviewItem.review_type ?? ""] ||
                            "Produktkandidat"}
                        </h3>
                        <StatusBadge status={reviewItem.status ?? "pending"} />
                        {reviewItem.priority && (
                          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">
                            Prioritet: {reviewItem.priority}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-ink-600">
                        {REVIEW_TYPE_LABELS[reviewItem.review_type ?? ""] ??
                          reviewItem.review_type ??
                          "Granskning"}
                      </p>
                    </div>
                    <p className="text-sm text-ink-500">
                      {formatDate(reviewItem.created_at)}
                    </p>
                  </div>

                  {reviewItem.reason && (
                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      {reviewItem.reason}
                    </p>
                  )}

                  <div className="grid gap-3 lg:grid-cols-2">
                    <ValuePanel
                      label="Kandidatdata"
                      value={reviewItem.candidate_payload ?? {}}
                      highlight
                    />
                    <ValuePanel label="Bevis och matchning" value={reviewItem.evidence ?? {}} />
                  </div>

                  {pageNumbers.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {pageNumbers.map((pageNumber) => (
                        <a
                          key={pageNumber}
                          href={`${pdfUrl}#page=${pageNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-flow-700 hover:text-flow-900"
                        >
                          <FileSearch className="h-4 w-4" aria-hidden="true" />
                          Ã–ppna sida {pageNumber}
                        </a>
                      ))}
                    </div>
                  )}

                  {identityMustBeResolved && pending && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Kandidaten saknar en sÃ¤ker produktidentitet. Avvisa den eller matcha den
                      manuellt innan godkÃ¤nnande.
                    </p>
                  )}

                  {pending ? (
                    <div className="flex flex-col gap-3 border-t border-ink-100 pt-4 lg:flex-row lg:items-end">
                      <label className="block flex-1">
                        <span className="mb-2 block text-sm font-medium text-ink-700">
                          Granskningsanteckning
                        </span>
                        <input
                          value={reviewNotes[reviewItem.id] ?? ""}
                          onChange={(event) =>
                            setReviewNotes((current) => ({
                              ...current,
                              [reviewItem.id]: event.target.value
                            }))
                          }
                          placeholder="Valfri motivering"
                          className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => reviewProductItem(reviewItem, "rejected")}
                          disabled={busyProposalId !== null}
                        >
                          {busy && (
                            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                          )}
                          <X className="h-4 w-4" aria-hidden="true" />
                          Avvisa
                        </Button>
                        <Button
                          onClick={() => reviewProductItem(reviewItem, "approved")}
                          disabled={busyProposalId !== null || identityMustBeResolved}
                        >
                          {busy && (
                            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                          )}
                          <Check className="h-4 w-4" aria-hidden="true" />
                          GodkÃ¤nn
                        </Button>
                      </div>
                    </div>
                  ) : (
                    reviewItem.review_note && (
                      <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
                        <span className="font-semibold text-ink-900">
                          Granskningsanteckning:
                        </span>{" "}
                        {reviewItem.review_note}
                      </p>
                    )
                  )}
                </article>
              );
            })}
          </div>
        )}
      </ReviewSection>

      <ReviewSection
        title="Ändringsförslag"
        description="Godkänn eller avvisa föreslagna produkt- och fältändringar."
        count={proposals.length}
      >
        {proposals.length === 0 ? (
          <EmptyState text="Inga ändringsförslag skapades från dokumentet." />
        ) : (
          <div className="divide-y divide-ink-200">
            {proposals.map((proposal) => {
              const source = proposal.provenance_id
                ? provenanceById.get(proposal.provenance_id)
                : undefined;
              const pageNumber = source?.page_number ?? null;
              const pending = proposal.status === "pending";
              const busy = busyProposalId === proposal.id;
              return (
                <article key={proposal.id} className="space-y-4 px-5 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink-950">
                          {PROPOSAL_LABELS[proposal.proposal_kind ?? ""] ??
                            proposal.proposal_kind ??
                            "Ändringsförslag"}
                        </span>
                        <StatusBadge status={proposal.status ?? "pending"} />
                        {proposal.significance && (
                          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">
                            Betydelse: {proposal.significance}
                          </span>
                        )}
                        {proposal.blocked_by_lock && (
                          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">
                            Manuellt låst fält
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-ink-600">
                        Fält: <span className="font-medium text-ink-900">{proposal.field_key || "–"}</span>
                        {proposal.conflict_type && proposal.conflict_type !== "none"
                          ? ` · Konflikt: ${proposal.conflict_type}`
                          : ""}
                      </p>
                    </div>
                    <p className="text-sm text-ink-600">
                      Konfidens: <span className="font-semibold text-ink-900">{formatConfidence(proposal.confidence)}</span>
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <ValuePanel label="Befintligt värde" value={proposal.existing_value} />
                    <ValuePanel label="Föreslaget värde" value={proposal.proposed_value} highlight />
                  </div>

                  {(source?.source_excerpt || pageNumber) && (
                    <div className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
                      <p className="font-medium text-ink-900">
                        Källa
                        {source?.extraction_method ? ` · ${source.extraction_method}` : ""}
                        {source?.confidence != null
                          ? ` · ${formatConfidence(source.confidence)} konfidens`
                          : ""}
                      </p>
                      {source?.source_excerpt && (
                        <p className="mt-1 whitespace-pre-wrap">{source.source_excerpt}</p>
                      )}
                      {pageNumber && (
                        <a
                          href={`${pdfUrl}#page=${pageNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 font-semibold text-flow-700 hover:text-flow-900"
                        >
                          <FileSearch className="h-4 w-4" aria-hidden="true" />
                          Öppna PDF på sida {pageNumber}
                        </a>
                      )}
                    </div>
                  )}

                  {pending ? (
                    <div className="flex flex-col gap-3 border-t border-ink-100 pt-4 lg:flex-row lg:items-end">
                      <label className="block flex-1">
                        <span className="mb-2 block text-sm font-medium text-ink-700">
                          Granskningsanteckning
                        </span>
                        <input
                          value={reviewNotes[proposal.id] ?? ""}
                          onChange={(event) =>
                            setReviewNotes((current) => ({
                              ...current,
                              [proposal.id]: event.target.value
                            }))
                          }
                          placeholder="Valfri motivering"
                          className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => reviewProposal(proposal, "rejected")}
                          disabled={busyProposalId !== null}
                        >
                          {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                          <X className="h-4 w-4" aria-hidden="true" />
                          Avvisa
                        </Button>
                        <Button
                          onClick={() => reviewProposal(proposal, "approved")}
                          disabled={busyProposalId !== null || proposal.blocked_by_lock === true}
                        >
                          {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                          <Check className="h-4 w-4" aria-hidden="true" />
                          Godkänn
                        </Button>
                      </div>
                    </div>
                  ) : (
                    proposal.review_note && (
                      <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
                        <span className="font-semibold text-ink-900">Granskningsanteckning:</span>{" "}
                        {proposal.review_note}
                      </p>
                    )
                  )}
                </article>
              );
            })}
          </div>
        )}
      </ReviewSection>

      <ReviewSection
        title="Hittade produkter"
        description="Produkter och varianter som PDF-läsaren identifierade eller matchade."
        count={products.length}
      >
        {products.length === 0 ? (
          <EmptyState text="Inga produkter identifierades i dokumentet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[70rem] w-full text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-600">
                <tr>
                  <th className="px-5 py-3">Produkt</th>
                  <th className="px-3 py-3">Variant</th>
                  <th className="px-3 py-3">Matchning</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Källa</th>
                  <th className="px-5 py-3">Sidor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {products.map((relation) => {
                  const product = firstRelation(relation.products);
                  const variant = firstRelation(relation.product_variants);
                  const pages = relation.page_numbers ?? [];
                  return (
                    <tr key={relation.id}>
                      <td className="px-5 py-4 align-top">
                        <p className="font-semibold text-ink-900">
                          {product?.product_name || relation.extracted_product_number || "Okänd produkt"}
                        </p>
                        <p className="mt-1 text-xs text-ink-500">
                          {[product?.manufacturer, product?.product_no || relation.extracted_product_number]
                            .filter(Boolean)
                            .join(" · ") || "Identifierare saknas"}
                        </p>
                      </td>
                      <td className="px-3 py-4 align-top text-ink-700">
                        <p>{variant?.variant_name || "–"}</p>
                        <p className="mt-1 text-xs text-ink-500">
                          {variant?.manufacturer_sku || variant?.sku || variant?.gtin || ""}
                        </p>
                      </td>
                      <td className="px-3 py-4 align-top text-ink-700">
                        <p>{relation.match_method || "–"}</p>
                        <p className="mt-1 text-xs text-ink-500">
                          {formatConfidence(relation.match_score)}
                        </p>
                      </td>
                      <td className="px-3 py-4 align-top">
                        <StatusBadge status={relation.verification_status ?? "needs_review"} />
                      </td>
                      <td className="max-w-sm px-3 py-4 align-top text-ink-700">
                        <p className="line-clamp-3 whitespace-pre-wrap">
                          {relation.source_excerpt || "Källutdrag saknas"}
                        </p>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          {pages.length > 0 ? (
                            pages.map((pageNumber) => (
                              <a
                                key={pageNumber}
                                href={`${pdfUrl}#page=${pageNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-md bg-flow-50 px-2.5 py-1 text-xs font-semibold text-flow-800 hover:bg-flow-100"
                              >
                                Sida {pageNumber}
                              </a>
                            ))
                          ) : (
                            <span className="text-ink-500">–</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ReviewSection>

      <ReviewSection
        title="Extraherade fält och källor"
        description="Fältnivåns ursprung, normaliserade värde och konfidens."
        count={provenance.length}
      >
        {provenance.length === 0 ? (
          <EmptyState text="Ingen fältproveniens registrerades." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[70rem] w-full text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-600">
                <tr>
                  <th className="px-5 py-3">Fält</th>
                  <th className="px-3 py-3">Ursprungligt värde</th>
                  <th className="px-3 py-3">Normaliserat värde</th>
                  <th className="px-3 py-3">Metod</th>
                  <th className="px-3 py-3">Konfidens</th>
                  <th className="px-5 py-3">Källa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {provenance.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4 align-top font-semibold text-ink-900">
                      {item.field_key || "–"}
                    </td>
                    <td className="max-w-xs px-3 py-4 align-top text-ink-700">
                      {item.original_value || "–"}
                    </td>
                    <td className="max-w-xs px-3 py-4 align-top text-ink-700">
                      {displayValue(item.normalized_value)}
                    </td>
                    <td className="px-3 py-4 align-top text-ink-700">
                      {item.extraction_method || "–"}
                    </td>
                    <td className="px-3 py-4 align-top text-ink-700">
                      {formatConfidence(item.confidence)}
                    </td>
                    <td className="max-w-sm px-5 py-4 align-top text-ink-700">
                      <p className="line-clamp-3 whitespace-pre-wrap">
                        {item.source_excerpt || "Källutdrag saknas"}
                      </p>
                      {item.page_number && (
                        <a
                          href={`${pdfUrl}#page=${item.page_number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-flow-700 hover:text-flow-900"
                        >
                          <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                          Sida {item.page_number}
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReviewSection>

      <ReviewSection
        title="Försökshistorik"
        description="Historiska bearbetningar bevaras även efter ett lyckat återförsök."
        count={attempts.length}
      >
        {attempts.length === 0 ? (
          <EmptyState text="Ingen försökhistorik registrerades." />
        ) : (
          <div className="divide-y divide-ink-200">
            {attempts.map((attempt) => (
              <article key={attempt.id} className="px-5 py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink-950">
                        Försök {attempt.attempt_number ?? "–"}
                      </p>
                      <StatusBadge status={attempt.status ?? "unknown"} />
                    </div>
                    <p className="mt-1 text-sm text-ink-600">
                      {TRIGGER_LABELS[attempt.trigger_type ?? ""] ?? attempt.trigger_type ?? "Okänd startorsak"}
                      {attempt.reader_version ? ` · PDF-läsare ${attempt.reader_version}` : ""}
                    </p>
                  </div>
                  <p className="text-sm text-ink-600">
                    {formatDate(attempt.completed_at ?? attempt.started_at ?? attempt.created_at)}
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <AttemptMetric label="Sidor" value={attempt.page_count ?? "–"} />
                  <AttemptMetric label="Hittade" value={attempt.identified_product_count ?? 0} />
                  <AttemptMetric label="Uppdaterade" value={attempt.updated_product_count ?? 0} />
                  <AttemptMetric label="Misslyckade produkter" value={attempt.failed_product_count ?? 0} />
                  <AttemptMetric label="Misslyckade rader" value={attempt.failed_row_count ?? 0} />
                </div>
                {(attempt.error_code || attempt.admin_error_message) && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p>{attempt.admin_error_message || "Ingen begriplig felbeskrivning registrerad."}</p>
                    {attempt.error_code && <code className="mt-1 block text-xs">{attempt.error_code}</code>}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
                  <span>
                    Metoder: {attempt.extraction_methods?.join(", ") || "inte registrerat"}
                  </span>
                  <span>
                    Misslyckade sidor: {attempt.failed_page_numbers?.join(", ") || "inga"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </ReviewSection>

      <p className="text-xs text-ink-500">
        Tekniska stack traces visas inte i standardvyn. Använd serverloggen vid djupare felsökning.
      </p>
    </div>
  );
}

function ReviewSection({
  title,
  description,
  count,
  children
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
      <div className="border-b border-ink-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-ink-950">{title}</h2>
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
            {count}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  children
}: {
  label: string;
  value?: string | number;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <div className="mt-2 text-xl font-semibold text-ink-950">{children ?? value}</div>
    </div>
  );
}

function Metadata({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 text-ink-800">{value || "–"}</dd>
    </div>
  );
}

function ValuePanel({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: unknown;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-flow-200 bg-flow-50" : "border-ink-200 bg-ink-50"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium text-ink-900">
        {displayValue(value)}
      </p>
    </div>
  );
}

function AttemptMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-ink-50 px-3 py-2">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "success" || status === "verified" || status === "approved" || status === "applied"
      ? "border-green-200 bg-green-50 text-green-800"
      : status === "failed" || status === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : status === "partial" || status === "unreadable"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-ink-200 bg-ink-50 text-ink-700";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-5 py-10 text-center text-sm text-ink-500">{text}</p>;
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "–";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Värdet kunde inte visas";
  }
}

function candidatePageNumbers(candidate: Record<string, unknown> | null | undefined) {
  if (!candidate) return [];
  const raw = Array.isArray(candidate.page_numbers)
    ? candidate.page_numbers
    : Array.isArray(candidate.pageNumbers)
      ? candidate.pageNumbers
      : [candidate.page_number ?? candidate.pageNumber];
  return [
    ...new Set(
      raw.map(Number).filter((value) => Number.isInteger(value) && value > 0)
    )
  ].sort((left, right) => left - right);
}

function formatConfidence(value: number | string | null | undefined) {
  if (value == null || value === "") return "–";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric * 100)} %` : "–";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return "–";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} kB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function reviewLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    not_required: "Inte markerad",
    required: "Krävs",
    in_review: "Granskas",
    resolved: "Löst"
  };
  return value ? labels[value] ?? value : "–";
}

function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function responseError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? fallback;
}
