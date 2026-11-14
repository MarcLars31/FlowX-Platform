import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import {
  selectSupabaseRows,
  selectSupabaseRowsWithCount
} from "@/lib/supabase-rest";

const ISSUE_TYPES = [
  "missing_database",
  "missing_index",
  "hidden_filter",
  "failed_import"
] as const;

type IssueType = (typeof ISSUE_TYPES)[number];
type ReconciliationIssue = {
  issue_type: IssueType;
  source_record_key: string | null;
  product_id: number | null;
  external_product_id: string | null;
  supplier: string | null;
  manufacturer_article_number: string | null;
  variant: string | null;
  reason: string;
  run_id: string | null;
  detected_at: string;
};

type SyncRun = {
  id: string;
  status: string;
  source_total: number | null;
  records_received: number;
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  rejected_count: number;
  error_count: number;
  started_at: string;
  completed_at: string | null;
};

export async function GET(request: NextRequest) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;

  const page = integer(request.nextUrl.searchParams.get("page"), 1, 1, 100_000);
  const limit = integer(request.nextUrl.searchParams.get("limit"), 25, 1, 100);
  const issueType = parseIssueType(request.nextUrl.searchParams.get("issueType"));
  const query = clean(request.nextUrl.searchParams.get("q"), 150);
  const parameters: Record<string, string> = {
    select: "*",
    order: sortOrder(request.nextUrl.searchParams.get("sort")),
    limit: String(limit),
    offset: String((page - 1) * limit)
  };
  if (issueType) parameters.issue_type = `eq.${issueType}`;
  if (query) {
    parameters.or = `(${[
      "source_record_key",
      "external_product_id",
      "supplier",
      "manufacturer_article_number",
      "variant",
      "reason"
    ].map((column) => `${column}.ilike.${quotedPostgrestValue(`*${query}*`)}`).join(",")})`;
  }

  try {
    const [{ rows, total }, statistics, latestRuns] = await Promise.all([
      selectSupabaseRowsWithCount<ReconciliationIssue>(
        "sprsok_reconciliation_issues",
        parameters
      ),
      issueStatistics(),
      selectSupabaseRows<SyncRun>("sprsok_sync_runs", {
        select: [
          "id", "status", "source_total", "records_received", "created_count",
          "updated_count", "unchanged_count", "rejected_count", "error_count",
          "started_at", "completed_at"
        ].join(","),
        source: "eq.sprsok",
        order: "started_at.desc",
        limit: "1"
      })
    ]);
    return NextResponse.json(
      { issues: rows, total, page, limit, statistics, latestRun: latestRuns[0] ?? null },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Sprsok-avstämningen är inte tillgänglig. Kontrollera att Sprsok-migreringen är installerad."
      },
      { status: 503 }
    );
  }
}

async function issueStatistics() {
  const entries = await Promise.all(
    ISSUE_TYPES.map(async (issueType) => {
      const result = await selectSupabaseRowsWithCount<{ source_record_key: string }>(
        "sprsok_reconciliation_issues",
        { select: "source_record_key", issue_type: `eq.${issueType}`, limit: "1" }
      );
      return [issueType, result.total] as const;
    })
  );
  return Object.fromEntries(entries) as Record<IssueType, number>;
}

function parseIssueType(value: string | null): IssueType | null {
  return ISSUE_TYPES.includes(value as IssueType) ? (value as IssueType) : null;
}

function clean(value: string | null, maxLength: number) {
  return value
    ?.trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maxLength) || null;
}

function quotedPostgrestValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function integer(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function sortOrder(value: string | null) {
  if (value === "oldest") return "detected_at.asc";
  if (value === "supplier") return "supplier.asc.nullslast,detected_at.desc";
  if (value === "type") return "issue_type.asc,detected_at.desc";
  return "detected_at.desc";
}
