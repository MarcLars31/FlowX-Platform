import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import { selectSupabaseRows } from "@/lib/supabase-rest";

type ExportRow = {
  supplier_name: string | null;
  title: string;
  file_name: string | null;
  current_processing_status: string;
  current_error_code: string | null;
  current_error_message: string | null;
  page_count: number | null;
  identified_product_count: number;
  failed_page_numbers: number[];
  processing_attempt_count: number;
  last_processing_at: string | null;
  original_pdf_url: string | null;
};

export async function GET(request: NextRequest) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;

  try {
    const params: Record<string, string> = {
      select: [
        "supplier_name",
        "title",
        "file_name",
        "current_processing_status",
        "current_error_code",
        "current_error_message",
        "page_count",
        "identified_product_count",
        "failed_page_numbers",
        "processing_attempt_count",
        "last_processing_at",
        "original_pdf_url"
      ].join(","),
      current_processing_status: "in.(partial,no_products_found,unreadable,failed)",
      deleted_at: "is.null",
      order: "last_processing_at.desc.nullslast",
      limit: "5000"
    };
    const supplier = clean(request.nextUrl.searchParams.get("supplier"), 200);
    const status = clean(request.nextUrl.searchParams.get("status"), 100);
    const errorCode = clean(request.nextUrl.searchParams.get("errorCode"), 100);
    const query = clean(request.nextUrl.searchParams.get("q"), 150);
    const from = isoDate(request.nextUrl.searchParams.get("from"));
    const to = isoDate(request.nextUrl.searchParams.get("to"));
    if (supplier) params.supplier_name = `ilike.*${supplier}*`;
    if (status && ["partial", "no_products_found", "unreadable", "failed"].includes(status)) {
      params.current_processing_status = `eq.${status}`;
    }
    if (errorCode) params.current_error_code = `eq.${errorCode}`;
    if (query) {
      const matchingDocumentIds = await productNumberDocumentIds(query);
      const filters = ["title", "file_name", "supplier_name"].map(
        (column) => `${column}.ilike.*${query}*`
      );
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

    const rows = await selectSupabaseRows<ExportRow>("documents", params);
    const header = [
      "Leverantör",
      "Dokumenttitel",
      "Filnamn",
      "Status",
      "Felkod",
      "Felorsak",
      "Sidor",
      "Hittade produkter",
      "Misslyckade sidor",
      "Försök",
      "Senaste försök",
      "Originalfil"
    ];
    const csv = [
      header,
      ...rows.map((row) => [
        row.supplier_name,
        row.title,
        row.file_name,
        row.current_processing_status,
        row.current_error_code,
        row.current_error_message,
        row.page_count,
        row.identified_product_count,
        row.failed_page_numbers.join(" "),
        row.processing_attempt_count,
        row.last_processing_at,
        row.original_pdf_url
      ])
    ].map((row) => row.map(csvCell).join(",")).join("\r\n");

    return new Response(`\uFEFF${csv}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="failed-product-documents.csv"',
        "Cache-Control": "private, no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "CSV export could not be created." }, { status: 500 });
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

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function clean(value: string | null, maxLength: number) {
  return value
    ?.trim()
    .replace(/[,*%_()[\]{}]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maxLength) || null;
}

function isoDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
