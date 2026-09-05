import { NextResponse } from "next/server";
import {
  fetchAhlsellProductSubtitles,
  validateAhlsellProductSubtitleItems
} from "@/lib/ahlsell-product-subtitle";
import { isUuid } from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; requirementId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi([
      "project.product_suggestion.view"
    ]);
    if (authorization.error) return authorization.error;

    const { id, requirementId } = await context.params;
    if (!isUuid(id) || !isUuid(requirementId)) {
      return NextResponse.json({ error: "Ogiltigt projekt- eller krav-id." }, { status: 400 });
    }

    const rateLimit = consumeRateLimit(
      requestRateLimitKey(request, "ahlsell-subtitles", authorization.user.id),
      30,
      60_000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "För många Ahlsell-förfrågningar. Vänta en kort stund och försök igen." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const [requirement] = await selectUserRows<Record<string, unknown>>(
      "project_requirements",
      {
        id: `eq.${requirementId}`,
        project_id: `eq.${id}`,
        organization_id: `eq.${authorization.context.organization.id}`,
        select: "id",
        limit: "1"
      }
    );
    if (!requirement) {
      return NextResponse.json({ error: "Produktraden hittades inte i projektet." }, { status: 404 });
    }

    const body = await readJsonBody<unknown>(request, 12_000);
    const validated = validateAhlsellProductSubtitleItems(body);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const subtitles = await fetchAhlsellProductSubtitles({
      items: validated.data,
      signal: request.signal
    });
    return NextResponse.json({ subtitles }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Produktlistan är för stor." }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Produktlistan har ogiltigt format." }, { status: 400 });
    }
    if (error instanceof UserSupabaseError) {
      const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json(
        { error: forbidden ? "Du har inte åtkomst till projektets produktrader." : "Produktraden kunde inte läsas." },
        { status: forbidden ? 403 : 500 }
      );
    }
    return NextResponse.json(
      { error: "Ahlsells produkttext kunde inte hämtas." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
