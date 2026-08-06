import { NextResponse } from "next/server";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import { processProductDocument } from "@/lib/product-document-processor";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { getCurrentUser } from "@/lib/supabase-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BATCH_SIZE = 25;

export async function POST(request: Request) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;
  const user = await getCurrentUser();
  const rateLimit = consumeRateLimit(
    requestRateLimitKey(request, "product-document-bulk-retry", user?.id),
    3,
    10 * 60_000
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "För många omkörningar. Försök igen senare." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { documentIds?: unknown }
    | null;
  const documentIds = Array.isArray(body?.documentIds)
    ? [...new Set(body.documentIds.filter(isUuid))]
    : [];
  if (documentIds.length === 0) {
    return NextResponse.json({ error: "Välj minst ett dokument." }, { status: 400 });
  }
  if (documentIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Högst ${MAX_BATCH_SIZE} dokument kan köras om samtidigt.` },
      { status: 413 }
    );
  }

  const results: Record<string, unknown>[] = [];
  for (const id of documentIds) {
    try {
      results.push(
        await processProductDocument(id, "manual_retry", user?.id ?? null)
      );
    } catch (error) {
      results.push({
        documentId: id,
        status: "failed",
        message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error."
      });
    }
  }

  const failed = results.filter((result) => result.status === "failed").length;
  return NextResponse.json({
    results,
    total: results.length,
    failed,
    succeeded: results.length - failed
  });
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}
