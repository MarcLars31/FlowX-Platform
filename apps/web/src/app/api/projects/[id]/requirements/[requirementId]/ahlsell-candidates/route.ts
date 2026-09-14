import { NextResponse } from "next/server";
import { AHLSELL_MLDL_CATALOG_VERSION, AHLSELL_MLDL_PRODUCT_COUNT } from "@/lib/ahlsell-mldl-catalog";
import { findMldlOnlyCandidates } from "@/lib/ahlsell-mldl-matching";
import { classifyAhlsellCatalogCandidates } from "@/lib/ahlsell-match-groups";
import { isUuid } from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { PRODUCT_MATCHING_ENGINE_VERSION, productLearningCandidateSnapshots } from "@/lib/product-learning-feedback";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { callUserRpc, selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";
import { VICTAULIC_SPRINKLER_CATALOG_VERSION } from "@/lib/victaulic-sprinkler-catalog";

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

    const classificationMode = new URL(request.url).searchParams.get("classification") === "1";
    const rateLimit = consumeRateLimit(
      requestRateLimitKey(request, classificationMode ? "ahlsell-classification" : "ahlsell-catalog", authorization.user.id),
      classificationMode ? 120 : 30,
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
        select: "id,category,requirement_key,display_name,value_text,value_json,source_excerpt,mapping_fingerprint",
        limit: "1"
      }
    );
    if (!requirement) {
      return NextResponse.json({ error: "Produktraden hittades inte i projektet." }, { status: 404 });
    }

    const candidates = findMldlOnlyCandidates(requirement, classificationMode ? 30 : 50);
    if (classificationMode) {
      return NextResponse.json({ classification: classifyAhlsellCatalogCandidates(candidates) }, {
        headers: { "Cache-Control": "private, no-store" }
      });
    }
    await recordCandidateImpression({
      projectId: id, requirementId, candidates,
      metadata: { candidateSource: "mldl", publicSearchAvailable: false,
        databaseProductCount: AHLSELL_MLDL_PRODUCT_COUNT, shownCandidateCount: Math.min(candidates.length, 3) }
    });
    return NextResponse.json({
      query: "MLDL", queries: [], searchUrl: "", searchUrls: [],
      total: candidates.length, candidates, truncated: false,
      matchingEngine: {
        version: PRODUCT_MATCHING_ENGINE_VERSION, source: "mldl",
        catalogVersion: AHLSELL_MLDL_CATALOG_VERSION,
        sprinklerCatalogVersion: VICTAULIC_SPRINKLER_CATALOG_VERSION,
        catalogProductCount: AHLSELL_MLDL_PRODUCT_COUNT, publicSearchAvailable: false
      }
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json(
        { error: forbidden ? "Du har inte åtkomst till projektets produktrader." : "Produktraden kunde inte läsas." },
        { status: forbidden ? 403 : 500 }
      );
    }
    return NextResponse.json(
      { error: "MLDL-matchningen kunde inte genomföras." },
      { status: 500 }
    );
  }
}

async function recordCandidateImpression({
  projectId,
  requirementId,
  candidates,
  metadata
}: {
  projectId: string;
  requirementId: string;
  candidates: Parameters<typeof productLearningCandidateSnapshots>[0];
  metadata: Record<string, unknown>;
}) {
  try {
    const snapshots = productLearningCandidateSnapshots(candidates);
    try {
      await callUserRpc("record_product_candidate_impression_v2", {
        requested_project_id: projectId,
        requested_requirement_id: requirementId,
        requested_candidates: snapshots,
        requested_metadata: {
          ...metadata,
          matchingEngineVersion: PRODUCT_MATCHING_ENGINE_VERSION,
          catalogVersion: AHLSELL_MLDL_CATALOG_VERSION,
          sprinklerCatalogVersion: VICTAULIC_SPRINKLER_CATALOG_VERSION,
          rankingMode: "technical_rules_mldl_only"
        }
      });
    } catch (error) {
      if (!isMissingFeedbackRpc(error)) throw error;
      await callUserRpc("record_product_candidate_impression", {
        requested_project_id: projectId,
        requested_requirement_id: requirementId,
        requested_candidates: snapshots
      });
    }
  } catch {
    // Learning telemetry must never prevent the reviewer from seeing products.
    // This also keeps the route deployment-safe while the migration rolls out.
  }
}

function isMissingFeedbackRpc(error: unknown) {
  return error instanceof UserSupabaseError
    && (error.code === "PGRST202" || error.code === "42883" || error.status === 404);
}
