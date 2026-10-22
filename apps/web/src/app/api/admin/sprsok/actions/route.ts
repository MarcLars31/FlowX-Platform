import { NextResponse } from "next/server";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { getCurrentUser } from "@/lib/supabase-auth";
import { reconcileSprsok } from "@/lib/sprsok-reconcile";
import { createSprsokSource, getSprsokSourceConfig } from "@/lib/sprsok-source-client";
import { runSprsokSynchronization } from "@/lib/sprsok-sync-core";
import { createSprsokSyncStore, SprsokSupabaseClient } from "@/lib/sprsok-supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

type ActionBody = {
  action?: unknown;
  dryRun?: unknown;
  sourceRecordKeys?: unknown;
};

export async function POST(request: Request) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;
  const user = await getCurrentUser();
  const limit = consumeRateLimit(
    requestRateLimitKey(request, "sprsok-admin-action", user?.id),
    5,
    10 * 60_000
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "För många Sprsok-körningar. Försök igen senare." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const body = await readJsonBody<ActionBody>(request, 32_000);
    if (!isAction(body.action)) {
      return NextResponse.json({ error: "Ogiltig Sprsok-åtgärd." }, { status: 400 });
    }
    const keys = Array.isArray(body.sourceRecordKeys)
      ? [...new Set(body.sourceRecordKeys.filter(isSourceRecordKey))].slice(0, 500)
      : [];
    const mutatesProducts =
      body.action === "repair" ||
      (body.action === "sync" && body.dryRun === false) ||
      (body.action === "reindex" && body.dryRun === false);
    if (mutatesProducts && process.env.PRODUCT_SYNC_WRITES_ENABLED !== "true") {
      return NextResponse.json(
        { error: "Skrivande Sprsok-åtgärder är inte aktiverade i denna miljö." },
        { status: 503 }
      );
    }
    const client = new SprsokSupabaseClient();
    const store = createSprsokSyncStore(client);

    if (body.action === "reindex") {
      const dryRun = body.dryRun !== false;
      const result = await client.rpc("reindex_sprsok_products", {
        p_source_record_keys: keys.length > 0 ? keys : null,
        p_dry_run: dryRun
      });
      return NextResponse.json({ action: body.action, dryRun, result });
    }

    const source = createSprsokSource(getSprsokSourceConfig());
    if (body.action === "sync") {
      const dryRun = body.dryRun !== false;
      const result = await runSprsokSynchronization(source, store, { dryRun });
      return NextResponse.json({ action: body.action, dryRun, result });
    }

    const repair = body.action === "repair";
    const report = await reconcileSprsok({
      source,
      client,
      store,
      repair,
      repairKeys: keys
    });
    return NextResponse.json({
      action: body.action,
      dryRun: !repair,
      report: { ...report, issues: report.issues.slice(0, 500) }
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Begäran är för stor." }, { status: 413 });
    }
    console.error("Sprsok admin action failed", {
      name: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes("SPRSOK_API_URL")
            ? "Sprsok API är inte konfigurerat i denna miljö."
            : "Sprsok-åtgärden misslyckades. Se systemloggen för detaljer."
      },
      { status: 503 }
    );
  }
}

function isAction(value: unknown): value is "sync" | "reconcile" | "repair" | "reindex" {
  return ["sync", "reconcile", "repair", "reindex"].includes(String(value));
}

function isSourceRecordKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 3 && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value);
}
