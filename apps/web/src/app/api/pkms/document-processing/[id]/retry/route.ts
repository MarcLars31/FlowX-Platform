import { NextResponse } from "next/server";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import {
  processProductDocument,
  ProductDocumentAlreadyProcessingError,
  ProductDocumentNotFoundError
} from "@/lib/product-document-processor";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { getCurrentUser } from "@/lib/supabase-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;
  const user = await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid document ID." }, { status: 400 });
  }

  const rateLimit = consumeRateLimit(
    requestRateLimitKey(request, "product-document-retry", user?.id),
    10,
    10 * 60_000
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "För många omkörningar. Försök igen senare." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  try {
    const result = await processProductDocument(id, "manual_retry", user?.id ?? null);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof ProductDocumentNotFoundError) {
      return NextResponse.json({ error: "Dokumentet hittades inte." }, { status: 404 });
    }
    if (error instanceof ProductDocumentAlreadyProcessingError) {
      return NextResponse.json(
        { error: "Dokumentet behandlas redan." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Ett nytt läsförsök kunde inte startas." },
      { status: 500 }
    );
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
