import { ahlsellEvidenceStore } from "@/lib/ahlsell-evidence-store.server";
import { NextResponse } from "next/server";
import { AhlsellCatalogError, ahlsellMarketFromSearchUrl } from "@/lib/ahlsell-public-catalog";
import { AhlsellLookupInputError, lookupAhlsellProduct, parseAhlsellLookupQuery } from "@/lib/ahlsell-product-lookup";
import { buildAhlsellRequirementGuide } from "@/lib/ahlsell-public-match";
import { complementMldlCandidates } from "@/lib/ahlsell-hybrid-matching";
import { productAssemblyPlan } from "@/lib/product-assembly-plan";
import { lookupAssemblyComponents } from "@/lib/assembly-component-lookup";
import { isUuid } from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string; requirementId: string }> };
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(["project.product_suggestion.view"]);
    if (authorization.error) return authorization.error;
    const { id, requirementId } = await context.params;
    if (!isUuid(id) || !isUuid(requirementId)) return NextResponse.json({ error: "Ogiltigt projekt- eller krav-id." }, { status: 400, headers });
    const limit = consumeRateLimit(requestRateLimitKey(request, "ahlsell-lookup", authorization.user.id), 30, 60_000);
    if (!limit.allowed) return NextResponse.json({ error: "För många Ahlsell-sökningar. Vänta en kort stund och försök igen." }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds) } });
    const body = await readJsonBody<{ query?: unknown; accessory?: unknown; componentKind?: unknown; componentId?: unknown; mainArticleNumber?: unknown; automatic?: unknown } | null>(request, 8_000);
    parseAhlsellLookupQuery(body?.query, "no");
    const [requirement] = await selectUserRows<Record<string, unknown>>("project_requirements", {
      id: `eq.${requirementId}`, project_id: `eq.${id}`, organization_id: `eq.${authorization.context.organization.id}`, deleted_at: "is.null",
      select: "id,category,requirement_key,display_name,value_text,value_json,source_excerpt", limit: "1"
    });
    if (!requirement) return NextResponse.json({ error: "Produktraden hittades inte i projektet." }, { status: 404, headers });
    const component = productAssemblyPlan(requirement)?.components.find(item => body?.componentId != null ? item.id === body.componentId : item.kind === body?.componentKind);
    if ((body?.componentId != null || body?.componentKind != null) && (!component || body.accessory !== true)) {
      return NextResponse.json({ error: "Tillbehörsgruppen finns inte i den här PDF-posten." }, { status: 400, headers });
    }
    if (component) {
      const result = await lookupAssemblyComponents({ requirement, component, mainArticleNumber: body?.mainArticleNumber,
        query: body?.query, automatic: body?.automatic === true,
        market: ahlsellMarketFromSearchUrl(buildAhlsellRequirementGuide(requirement).searchUrl), signal: request.signal, store: ahlsellEvidenceStore() });
      return NextResponse.json(result, { headers });
    }
    const result = await lookupAhlsellProduct({ query: body?.query, market: ahlsellMarketFromSearchUrl(buildAhlsellRequirementGuide(requirement).searchUrl), signal: request.signal, store: ahlsellEvidenceStore() });
    // Accessories have their own compatibility check against the chosen head;
    // do not compare an escutcheon with the head's K-factor or temperature.
    const products = body?.accessory === true
      ? result.products
      : complementMldlCandidates(requirement, [], result.products)
      .map(candidate => ({ ...candidate, subtitle: result.products.find(product => product.articleNumber === candidate.articleNumber)?.subtitle }));
    return NextResponse.json({ ...result, products }, { headers });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Sökningen är för lång." }, { status: 413, headers });
    if (error instanceof AhlsellLookupInputError || error instanceof SyntaxError) return NextResponse.json({ error: error instanceof AhlsellLookupInputError ? error.message : "Sökningen har ogiltigt format." }, { status: 400, headers });
    if (error instanceof UserSupabaseError) {
      const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json({ error: forbidden ? "Du har inte åtkomst till projektet." : "Produktraden kunde inte läsas." }, { status: forbidden ? 403 : 500, headers });
    }
    return NextResponse.json({ error: error instanceof AhlsellCatalogError ? error.message : "Ahlsell kunde inte nås. Försök igen om en stund." }, { status: 502, headers });
  }
}
