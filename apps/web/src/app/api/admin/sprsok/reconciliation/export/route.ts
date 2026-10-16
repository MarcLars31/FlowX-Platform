import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import { selectSupabaseRows } from "@/lib/supabase-rest";

type ExportIssue = {
  issue_type: string;
  source_record_key: string | null;
  external_product_id: string | null;
  supplier: string | null;
  manufacturer_article_number: string | null;
  variant: string | null;
  reason: string;
  detected_at: string;
};

export async function GET(request: NextRequest) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;
  const issueType = request.nextUrl.searchParams.get("issueType");
  const parameters: Record<string, string> = {
    select: [
      "issue_type", "source_record_key", "external_product_id", "supplier",
      "manufacturer_article_number", "variant", "reason", "detected_at"
    ].join(","),
    order: "detected_at.desc",
    limit: "1000"
  };
  if (["missing_database", "missing_index", "hidden_filter", "failed_import"].includes(issueType ?? "")) {
    parameters.issue_type = `eq.${issueType}`;
  }
  try {
    const rows: ExportIssue[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await selectSupabaseRows<ExportIssue>(
        "sprsok_reconciliation_issues",
        { ...parameters, offset: String(offset) }
      );
      rows.push(...page);
      if (page.length < 1000) break;
    }
    const csv = [
      ["Avvikelse", "Källnyckel", "Externt id", "Leverantör", "Artikelnummer", "Variant", "Orsak", "Upptäckt"],
      ...rows.map((row) => [
        row.issue_type, row.source_record_key, row.external_product_id, row.supplier,
        row.manufacturer_article_number, row.variant, row.reason, row.detected_at
      ])
    ].map((row) => row.map(csvCell).join(",")).join("\r\n");
    return new Response(`\uFEFF${csv}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sprsok-reconciliation.csv"',
        "Cache-Control": "private, no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "CSV-exporten kunde inte skapas." }, { status: 503 });
  }
}

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
