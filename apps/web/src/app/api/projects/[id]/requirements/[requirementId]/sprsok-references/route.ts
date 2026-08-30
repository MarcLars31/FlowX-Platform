import { NextResponse } from "next/server";
import { isUuid } from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { loadSprsokTechnicalCatalog } from "@/lib/sprsok-technical-catalog";
import { rankSprsokTechnicalReferences } from "@/lib/sprsok-technical-match";
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
      return NextResponse.json(
        { error: "Ogiltigt projekt- eller krav-id." },
        { status: 400 }
      );
    }

    const rateLimit = consumeRateLimit(
      requestRateLimitKey(request, "sprsok-references", authorization.user.id),
      60,
      60_000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "För många SPRSÖK-sökningar. Vänta en kort stund och försök igen." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
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
      return NextResponse.json(
        { error: "Produktraden hittades inte i projektet." },
        { status: 404 }
      );
    }

    const references = rankSprsokTechnicalReferences(
      requirement,
      await loadSprsokTechnicalCatalog(),
      3
    ).map((reference) => ({
      id: `sprsok:${reference.sourceId}`,
      source: "sprsok" as const,
      sin: reference.sin,
      supplier: reference.supplier,
      type: reference.productType,
      execution: reference.execution || null,
      kValue: reference.kValue || null,
      response: reference.rti || null,
      datasheetUrl: reference.datasheetUrl || null,
      matchedFields: reference.matchedFields,
      conflictingFields: [] as string[]
    }));

    return NextResponse.json(
      { references },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const forbidden = error.status === 401
        || error.status === 403
        || error.code === "42501";
      return NextResponse.json(
        {
          error: forbidden
            ? "Du har inte åtkomst till projektets produktrader."
            : "SPRSÖK-referenserna kunde inte läsas."
        },
        { status: forbidden ? 403 : 500 }
      );
    }

    return NextResponse.json(
      { error: "SPRSÖK-sökningen kunde inte genomföras." },
      { status: 500 }
    );
  }
}
