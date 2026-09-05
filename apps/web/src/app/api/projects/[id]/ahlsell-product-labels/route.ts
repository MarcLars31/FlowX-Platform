import { NextResponse } from "next/server";
import {
  ahlsellMarketFromSearchUrl,
  searchAhlsellPublicCatalogQueries
} from "@/lib/ahlsell-public-catalog";
import {
  type AhlsellProductLabel,
  validateAhlsellProductLabelItems
} from "@/lib/ahlsell-product-labels";
import { fetchAhlsellProductSubtitles } from "@/lib/ahlsell-product-subtitle";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";
import { isUuid } from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { normalizeNrfNumber } from "@/lib/product-card-candidates";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type RequirementRow = Record<string, unknown> & { id: string };

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi([
      "project.product_suggestion.view"
    ]);
    if (authorization.error) return authorization.error;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    }

    const rateLimit = consumeRateLimit(
      requestRateLimitKey(request, "ahlsell-product-labels", authorization.user.id),
      10,
      60_000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "För många Ahlsell-förfrågningar. Vänta en kort stund och försök igen." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body = await readJsonBody<unknown>(request, 20_000);
    const validated = validateAhlsellProductLabelItems(body);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const requirementIds = validated.data.map((item) => item.requirementId);
    const requirements = await selectUserRows<RequirementRow>(
      "project_requirements",
      {
        id: `in.(${requirementIds.join(",")})`,
        project_id: `eq.${id}`,
        organization_id: `eq.${authorization.context.organization.id}`,
        deleted_at: "is.null",
        select: "id,category,requirement_key,display_name,value_text,value_json,source_excerpt",
        limit: String(requirementIds.length)
      }
    );
    const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
    if (requirementById.size !== requirementIds.length) {
      return NextResponse.json({ error: "En eller flera produktposter hittades inte i projektet." }, { status: 404 });
    }

    const labels: Record<string, AhlsellProductLabel> = {};
    let cursor = 0;
    const candidateSearches = new Map<string, Promise<AhlsellPublicCandidate | null>>();
    const subtitleSearches = new Map<string, Promise<string>>();
    const workerCount = Math.min(3, validated.data.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (cursor < validated.data.length && !request.signal.aborted) {
        const item = validated.data[cursor];
        cursor += 1;
        const requirement = requirementById.get(item.requirementId);
        if (!requirement) continue;
        const guide = buildAhlsellRequirementGuide(requirement);
        const market = ahlsellMarketFromSearchUrl(guide.searchUrl);
        const directCandidate = guide.directCandidates.find((candidate) =>
          normalizeNrfNumber(candidate.articleNumber) === item.articleNumber
          && isProductPage(candidate.productUrl)
        );
        const searchKey = `${market}:${item.articleNumber}`;
        let candidatePromise = candidateSearches.get(searchKey);
        if (!candidatePromise) {
          candidatePromise = directCandidate
            ? Promise.resolve(directCandidate)
            : findExactCandidate(market, item.articleNumber);
          candidateSearches.set(searchKey, candidatePromise);
        }
        const candidate = await candidatePromise.catch(() => null);
        if (!candidate) continue;
        const subtitleKey = `${normalizeNrfNumber(candidate.articleNumber)}:${candidate.productUrl}`;
        let subtitlePromise = subtitleSearches.get(subtitleKey);
        if (!subtitlePromise) {
          subtitlePromise = fetchAhlsellProductSubtitles({
            items: [{ articleNumber: candidate.articleNumber, productUrl: candidate.productUrl }],
            signal: request.signal
          })
            .then((subtitles) => subtitles[candidate.articleNumber] ?? "")
            .catch(() => "");
          subtitleSearches.set(subtitleKey, subtitlePromise);
        }
        const subtitle = await subtitlePromise;
        labels[item.requirementId] = {
          articleNumber: candidate.articleNumber,
          productName: candidate.productName,
          subtitle,
          manufacturer: candidate.manufacturer,
          productUrl: candidate.productUrl
        };
      }
    }));

    return NextResponse.json({ labels }, {
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
        { error: forbidden ? "Du har inte åtkomst till projektets produktrader." : "Produktraderna kunde inte läsas." },
        { status: forbidden ? 403 : 500 }
      );
    }
    return NextResponse.json(
      { error: "Ahlsells produkttexter kunde inte hämtas." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}

async function findExactCandidate(
  market: "no" | "se",
  articleNumber: string
) {
  const result = await searchAhlsellPublicCatalogQueries({
    market,
    queries: [articleNumber],
    maxCandidates: 20,
    maxVariantFamilies: 8
  });
  return result.candidates.find((candidate) =>
    normalizeNrfNumber(candidate.articleNumber) === articleNumber
    && isProductPage(candidate.productUrl)
  ) ?? null;
}

function isProductPage(productUrl: string) {
  try {
    return new URL(productUrl).pathname.toLocaleLowerCase("en-US").includes("/products/");
  } catch {
    return false;
  }
}
