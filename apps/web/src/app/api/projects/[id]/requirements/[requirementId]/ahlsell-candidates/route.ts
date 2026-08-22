import { NextResponse } from "next/server";
import {
  AhlsellCatalogError,
  ahlsellMarketFromSearchUrl,
  searchAhlsellPublicCatalog
} from "@/lib/ahlsell-public-catalog";
import { rankAhlsellCandidates } from "@/lib/ahlsell-candidate-ranking";
import { buildAhlsellRequirementGuide } from "@/lib/ahlsell-public-match";
import { isUuid } from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; requirementId: string }> };

export async function GET(request: Request, context: RouteContext) {
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
      requestRateLimitKey(request, "ahlsell-catalog", authorization.user.id),
      30,
      60_000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "För många Ahlsell-sökningar. Vänta en kort stund och försök igen." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const [requirement] = await selectUserRows<Record<string, unknown>>(
      "project_requirements",
      {
        id: `eq.${requirementId}`,
        project_id: `eq.${id}`,
        organization_id: `eq.${authorization.context.organization.id}`,
        select: "id,category,requirement_key,display_name,value_text,value_json,source_excerpt",
        limit: "1"
      }
    );
    if (!requirement) {
      return NextResponse.json({ error: "Produktraden hittades inte i projektet." }, { status: 404 });
    }

    const guide = buildAhlsellRequirementGuide(requirement);
    const result = await searchAhlsellPublicCatalog({
      market: ahlsellMarketFromSearchUrl(guide.searchUrl),
      query: guide.searchQuery
    });
    const rankedResult = {
      ...result,
      candidates: rankAhlsellCandidates(requirement, result.candidates)
    };

    return NextResponse.json(rankedResult, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    if (error instanceof AhlsellCatalogError) {
      return NextResponse.json(
        { error: error.message },
        { status: 502, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    if (error instanceof UserSupabaseError) {
      const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json(
        { error: forbidden ? "Du har inte åtkomst till projektets produktrader." : "Produktraden kunde inte läsas." },
        { status: forbidden ? 403 : 500 }
      );
    }
    return NextResponse.json(
      { error: "Ahlsell-sökningen kunde inte genomföras." },
      { status: 500 }
    );
  }
}
