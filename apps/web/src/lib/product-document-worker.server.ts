import "server-only";
import { callSupabaseRpc, updateSupabaseRowsReturning } from "./supabase-rest";
import { processProductDocument } from "./product-document-processor";

type ProductJob = { document_id: string; requested_by: string | null; trigger_type: "initial" | "automatic_retry" | "manual_retry" | "reader_upgrade"; attempts: number; lease_id: string };
const retryable = new Set(["ocr_failed", "text_extraction_failed", "table_extraction_failed", "timeout", "out_of_memory", "extractor_unavailable", "unknown_error"]);
export function enqueueProductDocument(documentId: string, userId: string | null) {
  return callSupabaseRpc<ProductJob>("enqueue_product_document_job", { requested_document_id: documentId, requested_by: userId, requested_trigger: "manual_retry" });
}
/** One bounded attempt per invocation. The scheduler resumes the durable queue. */
export async function runProductDocumentWorker(documentId: string | null = null) {
  const job = await callSupabaseRpc<ProductJob | null>("claim_product_document_job", { requested_document_id: documentId });
  // PostgREST represents an empty composite result as an object of null fields.
  if (!job?.document_id || !job.lease_id) return;
  const filters = { document_id: `eq.${job.document_id}`, lease_id: `eq.${job.lease_id}`, status: "eq.running", select: "document_id" };
  let errorCode: string | null = null;
  let shouldRetry = false;
  let status = "completed";
  try {
    const result = await processProductDocument(job.document_id, job.attempts > 1 ? "manual_retry" : job.trigger_type, job.requested_by, job.lease_id);
    errorCode = result.errorCode;
    shouldRetry = Boolean(errorCode && retryable.has(errorCode));
    if (result.status !== "success" && result.status !== "partial") status = "failed";
  } catch (error) {
    errorCode = "unknown_error"; shouldRetry = true; status = "failed";
    console.error("product_document_job_failed", { documentId: job.document_id, attempt: job.attempts, name: error instanceof Error ? error.name : "Error" });
  }
  await updateSupabaseRowsReturning("product_document_jobs", filters, {
    status: shouldRetry && job.attempts < 5 ? "queued" : status, error_code: errorCode, lease_until: null,
    next_attempt_at: new Date(Date.now() + Math.min(300_000, 15_000 * 2 ** job.attempts)).toISOString(), updated_at: new Date().toISOString()
  });
}
