import { NextResponse } from "next/server";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { callSupabaseRpc } from "@/lib/supabase-rest";
import { getCurrentUser } from "@/lib/supabase-auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;
  const user = await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid proposal ID." }, { status: 400 });
  }

  const rateLimit = consumeRateLimit(
    requestRateLimitKey(request, "product-change-review", user?.id),
    60,
    10 * 60_000
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "För många granskningsändringar. Försök igen senare." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { decision?: unknown; reviewNote?: unknown }
    | null;
  if (body?.decision !== "approved" && body?.decision !== "rejected") {
    return NextResponse.json(
      { error: "Beslutet måste vara approved eller rejected." },
      { status: 400 }
    );
  }
  const reviewNote =
    typeof body.reviewNote === "string"
      ? body.reviewNote.trim().slice(0, 2_000) || null
      : null;

  try {
    const proposal =
      body.decision === "approved"
        ? await callSupabaseRpc<Record<string, unknown>>(
            "approve_and_apply_product_change",
            {
              p_proposal_id: id,
              p_review_note: reviewNote
            }
          )
        : await callSupabaseRpc<Record<string, unknown>>(
            "review_product_change_proposal",
            {
              p_proposal_id: id,
              p_decision: body.decision,
              p_review_note: reviewNote
            }
          );
    return NextResponse.json({ proposal });
  } catch {
    return NextResponse.json(
      { error: "Ändringsförslaget kunde inte granskas." },
      { status: 409 }
    );
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
