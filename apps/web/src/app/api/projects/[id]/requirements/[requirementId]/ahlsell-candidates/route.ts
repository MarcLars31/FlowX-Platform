import { NextResponse } from "next/server";
import {
  AhlsellCatalogError,
  ahlsellMarketFromSearchUrl,
  searchAhlsellPublicCatalogQueries,
  type AhlsellCatalogResult
} from "@/lib/ahlsell-public-catalog";
import { mergeAhlsellCandidates } from "@/lib/ahlsell-candidate-merge";
import { rankAhlsellCandidates } from "@/lib/ahlsell-candidate-ranking";
import { classifyAhlsellCatalogCandidates } from "@/lib/ahlsell-match-groups";
import { buildAhlsellRequirementGuide } from "@/lib/ahlsell-public-match";
import { isUuid } from "@/lib/distributor-product-mapping";
import { loadDistributorProductMemoryCandidates } from "@/lib/distributor-product-memory";
import {
  applyLearnedProductEvidence,
  learnedProductSearchQueries,
  rankDistributorProductMemoryHints
} from "@/lib/distributor-product-memory-match";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  PRODUCT_MATCHING_ENGINE_VERSION,
  productLearningCandidateSnapshots
} from "@/lib/product-learning-feedback";
import { hasProjectRequirementDataWarning } from "@/lib/project-requirement-data-warnings";
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

    const guide = buildAhlsellRequirementGuide(requirement);
    const learnedHints = classificationMode
      || hasProjectRequirementDataWarning(requirement)
      ? []
      : await learnedMemoryHintsOrEmpty(
          authorization.context.organization.id,
          requirement
        );
    const learnedQueries = learnedProductSearchQueries(learnedHints);
    const searchQueries = uniqueQueries(guide.directCandidates.length > 0
      ? [...guide.searchQueries, ...learnedQueries]
      : [...learnedQueries, ...guide.searchQueries]);
    const queries = classificationMode
      ? searchQueries.slice(0, 2)
      : searchQueries;
    let publicSearchAvailable = true;
    let result: AhlsellCatalogResult;
    try {
      result = await searchAhlsellPublicCatalogQueries({
        market: ahlsellMarketFromSearchUrl(guide.searchUrl),
        // The compact group check still needs the second synonym search and a
        // handful of exact variant families. Otherwise many dimensioned Ahlsell
        // products remain yellow simply because the correct family was not one
        // of the first two broad-search cards.
        queries,
        maxCandidates: classificationMode ? 50 : 80,
        maxVariantFamilies: classificationMode ? 5 : 8
      });
    } catch (error) {
      if (!(error instanceof AhlsellCatalogError) || guide.directCandidates.length === 0) throw error;
      publicSearchAvailable = false;
      result = {
        query: queries[0] ?? guide.searchQuery,
        queries,
        searchUrl: guide.searchUrl,
        searchUrls: [guide.searchUrl],
        total: 0,
        candidates: [],
        truncated: false
      };
    }
    const rankedPublicCandidates = applyLearnedProductEvidence(
      rankAhlsellCandidates(requirement, result.candidates),
      learnedHints
    );
    const rankedResult = {
      ...result,
      candidates: mergeAhlsellCandidates(guide.directCandidates, rankedPublicCandidates)
    };

    if (classificationMode) {
      const classification = classifyAhlsellCatalogCandidates(rankedResult.candidates);
      return NextResponse.json({ classification }, {
        headers: { "Cache-Control": "private, max-age=60" }
      });
    }

    const telemetryCandidates = candidatesActuallyPresented(
      learnedHints,
      rankedResult.candidates
    );
    await recordCandidateImpression({
      projectId: id,
      requirementId,
      candidates: telemetryCandidates,
      metadata: {
        publicSearchAvailable,
        queryCount: queries.length,
        directCandidateCount: guide.directCandidates.length,
        publicCandidateCount: result.candidates.length,
        historyCandidateCount: learnedHints.length,
        shownCandidateCount: Math.min(telemetryCandidates.length, 3),
        resultTruncated: result.truncated
      }
    });

    return NextResponse.json({
      ...rankedResult,
      learningAssistance: {
        source: "confirmed_product_history",
        used: learnedProductSearchQueries(learnedHints).some((query) =>
          queries.some((usedQuery) => normalizeQuery(usedQuery) === normalizeQuery(query))
        ),
        candidateCount: learnedHints.length
      },
      matchingEngine: {
        version: PRODUCT_MATCHING_ENGINE_VERSION,
        catalogVersion: VICTAULIC_SPRINKLER_CATALOG_VERSION,
        publicSearchAvailable
      }
    }, {
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

async function learnedMemoryHintsOrEmpty(
  organizationId: string,
  requirement: Record<string, unknown>
) {
  try {
    return rankDistributorProductMemoryHints(
      requirement,
      await loadDistributorProductMemoryCandidates(organizationId, requirement)
    );
  } catch {
    // Confirmed history is advisory. Ahlsell search must remain available if
    // the organization memory cannot be read during a deployment.
    return [];
  }
}

function normalizeQuery(value: string) {
  return value.toLocaleLowerCase("sv-SE").replace(/\s+/g, " ").trim();
}

function uniqueQueries(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeQuery(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidatesActuallyPresented(
  learnedHints: Awaited<ReturnType<typeof learnedMemoryHintsOrEmpty>>,
  candidates: Parameters<typeof productLearningCandidateSnapshots>[0]
) {
  const historyCandidates = learnedHints.map((hint) => ({
    articleNumber: hint.productNumber,
    productName: hint.productName,
    manufacturer: hint.manufacturerName,
    productUrl: "",
    specifications: [],
    source: "confirmed_history" as const,
    exactMatch: false,
    matchScore: hint.matchScore,
    matchReasons: [
      ...hint.matchReasons,
      hint.exactFingerprint
        ? "Tidigare bekräftad för samma tekniska krav."
        : "Tidigare bekräftad för ett tekniskt liknande krav."
    ],
    matchWarnings: [],
    recommendation: "recommended" as const,
    learningEvidence: {
      kind: "similar_confirmed" as const,
      supportCount: hint.supportCount,
      similarityScore: hint.matchScore
    }
  }));
  const historyArticles = new Set(historyCandidates.map((candidate) => normalizeArticle(candidate.articleNumber)));
  return [
    ...historyCandidates,
    ...candidates.filter((candidate) => !historyArticles.has(normalizeArticle(candidate.articleNumber)))
  ];
}

function normalizeArticle(value: string) {
  return value.toLocaleLowerCase("sv-SE").replace(/[^a-z0-9]/g, "");
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
          catalogVersion: VICTAULIC_SPRINKLER_CATALOG_VERSION,
          rankingMode: "technical_rules_with_confirmed_history"
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
