import { NextResponse } from "next/server";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import {
  selectSupabaseRows,
  updateSupabaseRowsReturning
} from "@/lib/supabase-rest";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid document ID." }, { status: 400 });

  try {
    const [documents, attempts, products, provenance, proposals, reviewItems] = await Promise.all([
      selectSupabaseRows<Record<string, unknown>>("documents", {
        select: [
          "id", "title", "supplier_name", "file_name", "document_type",
          "original_pdf_url", "source_page_url", "file_size_bytes", "page_count",
          "language_code", "current_processing_status", "current_error_code",
          "current_error_message", "failed_page_numbers", "identified_product_count",
          "updated_product_count", "failed_product_count", "processing_attempt_count",
          "last_processing_at", "reader_version", "manual_review_status", "downloaded_at"
        ].join(","),
        id: `eq.${id}`,
        deleted_at: "is.null",
        limit: "1"
      }),
      selectSupabaseRows<Record<string, unknown>>("product_document_processing_attempts", {
        select: [
          "id", "attempt_number", "trigger_type", "status", "page_count",
          "identified_product_count", "updated_product_count", "failed_product_count",
          "failed_row_count", "error_code", "admin_error_message", "failed_page_numbers",
          "extraction_methods", "reader_version", "started_at", "completed_at", "created_at"
        ].join(","),
        document_id: `eq.${id}`,
        order: "attempt_number.desc",
        limit: "100"
      }),
      selectSupabaseRows<Record<string, unknown>>("product_documents", {
        select: [
          "id", "product_id", "product_variant_id", "page_numbers",
          "extracted_product_number", "match_method", "match_score",
          "verification_status", "source_excerpt",
          "products(id,manufacturer,product_no,product_name,status)",
          "product_variants(id,sku,manufacturer_sku,gtin,variant_name,technical_status)"
        ].join(","),
        document_id: `eq.${id}`,
        order: "created_at.desc",
        limit: "500"
      }),
      selectSupabaseRows<Record<string, unknown>>("product_field_provenance", {
        select: [
          "id", "product_id", "product_variant_id", "field_key", "page_number",
          "original_value", "normalized_value", "extraction_method", "confidence",
          "source_excerpt", "verification_status"
        ].join(","),
        document_id: `eq.${id}`,
        order: "page_number.asc.nullslast,field_key.asc",
        limit: "1000"
      }),
      selectSupabaseRows<Record<string, unknown>>("product_change_proposals", {
        select: [
          "id", "provenance_id", "product_id", "product_variant_id", "proposal_kind",
          "field_key", "existing_value", "proposed_value", "conflict_type",
          "significance", "confidence", "blocked_by_lock", "status", "review_note", "created_at"
        ].join(","),
        document_id: `eq.${id}`,
        order: "created_at.desc",
        limit: "500"
      }),
      selectSupabaseRows<Record<string, unknown>>("product_document_review_items", {
        select: [
          "id", "product_id", "product_variant_id", "product_document_id",
          "change_proposal_id", "review_type", "status", "priority", "title",
          "reason", "evidence", "candidate_payload", "review_note", "created_at"
        ].join(","),
        document_id: `eq.${id}`,
        order: "created_at.desc",
        limit: "500"
      })
    ]);

    if (!documents[0]) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    return NextResponse.json(
      { document: documents[0], attempts, products, provenance, proposals, reviewItems },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Document details could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid document ID." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as
    | { manualReviewStatus?: string }
    | null;
  const allowed = ["required", "in_review", "resolved"];
  if (!body?.manualReviewStatus || !allowed.includes(body.manualReviewStatus)) {
    return NextResponse.json({ error: "Invalid manual review status." }, { status: 400 });
  }

  try {
    const document = await updateSupabaseRowsReturning<Record<string, unknown>>(
      "documents",
      { id: `eq.${id}` },
      { manual_review_status: body.manualReviewStatus }
    );
    return NextResponse.json({ document });
  } catch {
    return NextResponse.json({ error: "Review status could not be updated." }, { status: 500 });
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
