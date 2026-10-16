import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import {
  selectSupabaseRows,
  selectSupabaseRowsWithCount
} from "@/lib/supabase-rest";

const FAILURE_STATUSES = [
  "partial",
  "no_products_found",
  "unreadable",
  "failed"
] as const;

type FailureStatus = (typeof FAILURE_STATUSES)[number];
type ProductDocumentFailure = {
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
  manual_review_status: string;
};

export async function GET(request: NextRequest) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;

  try {
    const page = integer(request.nextUrl.searchParams.get("page"), 1, 1, 100_000);
    const limit = integer(request.nextUrl.searchParams.get("limit"), 25, 1, 100);
    const statuses = parseStatuses(request.nextUrl.searchParams.get("status"));
    const params: Record<string, string> = {
      select: [
        "id",
        "supplier_name",
        "title",
        "file_name",
        "document_type",
        "original_pdf_url",
        "source_page_url",
        "page_count",
        "current_processing_status",
        "current_error_code",
        "current_error_message",
        "failed_page_numbers",
        "identified_product_count",
        "failed_product_count",
        "processing_attempt_count",
        "last_processing_at",
        "manual_review_status"
      ].join(","),
      current_processing_status: `in.(${statuses.join(",")})`,
      deleted_at: "is.null",
      order: sortOrder(request.nextUrl.searchParams.get("sort")),
      limit: String(limit),
      offset: String((page - 1) * limit)
    };

    const supplier = cleanFilter(request.nextUrl.searchParams.get("supplier"), 200);
    const errorCode = cleanFilter(request.nextUrl.searchParams.get("errorCode"), 100);
    const query = cleanFilter(request.nextUrl.searchParams.get("q"), 150);
    const from = isoDate(request.nextUrl.searchParams.get("from"));
    const to = isoDate(request.nextUrl.searchParams.get("to"));
    if (supplier) params.supplier_name = `ilike.*${supplier}*`;
    if (errorCode) params.current_error_code = `eq.${errorCode}`;
    if (query) {
      const matchingDocumentIds = await productNumberDocumentIds(query);
      const filters = [
        "title",
        "file_name",
        "supplier_name",
        "original_pdf_url"
      ].map((column) => `${column}.ilike.*${query}*`);
      if (matchingDocumentIds.length > 0) {
        filters.push(`id.in.(${matchingDocumentIds.join(",")})`);
      }
      params.or = `(${filters.join(",")})`;
    }
    const dateFilters = [
      from ? `last_processing_at.gte.${from}T00:00:00.000Z` : null,
      to ? `last_processing_at.lte.${to}T23:59:59.999Z` : null
    ].filter((value): value is string => Boolean(value));
    if (dateFilters.length > 0) params.and = `(${dateFilters.join(",")})`;

    const [{ rows, total }, statistics] = await Promise.all([
      selectSupabaseRowsWithCount<ProductDocumentFailure>("documents", params),
      failureStatistics()
    ]);

    return NextResponse.json(
      { documents: rows, total, page, limit, statistics },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Datablad som misslyckats kunde inte hämtas." },
      { status: 500 }
    );
  }
}

async function productNumberDocumentIds(query: string) {
  const relations = await selectSupabaseRows<{ document_id: string }>(
    "product_documents",
    {
      select: "document_id",
      extracted_product_number: `ilike.*${query}*`,
      limit: "250"
    }
  );
  return [...new Set(relations.map((relation) => relation.document_id).filter(isUuid))];
}

async function failureStatistics() {
  const entries = await Promise.all(
    FAILURE_STATUSES.map(async (status) => {
      const result = await selectSupabaseRowsWithCount<{ id: string }>("documents", {
        select: "id",
        current_processing_status: `eq.${status}`,
        deleted_at: "is.null",
        limit: "1"
      });
      return [status, result.total] as const;
    })
  );
  return Object.fromEntries(entries) as Record<FailureStatus, number>;
}

function parseStatuses(value: string | null): FailureStatus[] {
  const requested = value?.split(",").filter(isFailureStatus) ?? [];
  return requested.length > 0 ? [...new Set(requested)] : [...FAILURE_STATUSES];
}

function isFailureStatus(value: string): value is FailureStatus {
  return (FAILURE_STATUSES as readonly string[]).includes(value);
}

function cleanFilter(value: string | null, maxLength: number) {
  return value
    ?.trim()
    .replace(/[,*%_()[\]{}]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maxLength) || null;
}

function integer(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function isoDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function sortOrder(value: string | null) {
  const options: Record<string, string> = {
    oldest: "last_processing_at.asc.nullslast",
    supplier: "supplier_name.asc.nullslast,last_processing_at.desc.nullslast",
    status: "current_processing_status.asc,last_processing_at.desc.nullslast"
  };
  return options[value ?? ""] ?? "last_processing_at.desc.nullslast";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
