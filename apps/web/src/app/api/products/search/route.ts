import { NextRequest, NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { isPlatformAdmin } from "@/lib/platform-role";
import { getCurrentUser } from "@/lib/supabase-auth";
import { selectSupabaseRows } from "@/lib/supabase-rest";

const PRODUCT_TABLE = "sprsok_products";

const PRODUCT_COLUMNS = [
  "id",
  "sin",
  "leverandor",
  "type",
  "utforelse",
  "k_verdi",
  "rti",
  "datablad"
].join(",");

const SEARCHABLE_COLUMNS = [
  "sin",
  "leverandor",
  "type",
  "utforelse",
  "k_verdi",
  "rti"
] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_SIMILAR_LIMIT = 5;
const MAX_SIMILAR_LIMIT = 12;
const SIMILAR_CANDIDATE_LIMIT = 100;

type ProductRow = {
  id: number | null;
  sin: string | null;
  leverandor: string | null;
  type: string | null;
  utforelse: string | null;
  k_verdi: string | null;
  rti: string | null;
  datablad: string | null;
};

type ProductsSearchResponse = {
  products: ProductRow[];
  count: number;
  limit: number;
  offset: number;
};

const SIMILARITY_FIELDS: Array<{
  column: keyof Pick<
    ProductRow,
    "leverandor" | "type" | "utforelse" | "k_verdi" | "rti"
  >;
  weight: number;
}> = [
  { column: "leverandor", weight: 6 },
  { column: "type", weight: 4 },
  { column: "utforelse", weight: 3 },
  { column: "rti", weight: 2 },
  { column: "k_verdi", weight: 2 }
];

function cleanSearchTerm(value: string | null) {
  if (!value) return "";

  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[,*%_()[\]{}]/g, "")
    .slice(0, 100);
}

function cleanFilterValue(value: string | null) {
  if (!value) return "";

  return value
    .trim()
    .replace(/[,*%_()[\]{}]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 200);
}

function parseNumber(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsedValue = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsedValue)) return fallback;
  return Math.min(Math.max(parsedValue, minimum), maximum);
}

function parseProductId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;

  const parsedValue = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : null;
}

function normalizeComparableValue(value: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function escapePostgrestOrValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function rankSimilarProducts(source: ProductRow, candidates: ProductRow[]) {
  return deduplicateProducts(candidates)
    .filter((candidate) => candidate.id !== source.id)
    .map((candidate) => ({
      product: candidate,
      score: SIMILARITY_FIELDS.reduce((score, { column, weight }) => {
        const sourceValue = normalizeComparableValue(source[column]);
        const candidateValue = normalizeComparableValue(candidate[column]);

        return sourceValue && sourceValue === candidateValue
          ? score + weight
          : score;
      }, 0)
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.product.sin ?? "").localeCompare(right.product.sin ?? "", "sv")
    );
}

function deduplicateProducts(products: ProductRow[]) {
  const seen = new Set<string>();

  return products.filter((product) => {
    const key = product.id
      ? `id:${product.id}`
      : [
          product.sin,
          product.leverandor,
          product.type,
          product.utforelse,
          product.k_verdi,
          product.rti
        ]
          .map((value) => value?.trim().toUpperCase() ?? "")
          .join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Du måste vara inloggad för att söka produkter." },
        { status: 401 }
      );
    }

    if (!isPlatformAdmin(user)) {
      const authorization = await requireOrganizationApi([
        "product.search",
        "product.view"
      ]);
      if (authorization.error) return authorization.error;
    }

    const searchParams = request.nextUrl.searchParams;
    const query = cleanSearchTerm(searchParams.get("q"));
    const leverandor = cleanFilterValue(searchParams.get("leverandor"));
    const type = cleanFilterValue(searchParams.get("type"));
    const utforelse = cleanFilterValue(searchParams.get("utforelse"));
    const kVerdi = cleanFilterValue(searchParams.get("k_verdi"));
    const rti = cleanFilterValue(searchParams.get("rti"));
    const similarTo = parseProductId(searchParams.get("similar_to"));
    const limit = parseNumber(searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = parseNumber(searchParams.get("offset"), 0, 0, 100_000);

    if (searchParams.has("similar_to")) {
      if (!similarTo) {
        return NextResponse.json(
          { error: "Ogiltigt produkt-ID fÃ¶r liknande produkter." },
          { status: 400 }
        );
      }

      const [source] = await selectSupabaseRows<ProductRow>(PRODUCT_TABLE, {
        select: PRODUCT_COLUMNS,
        id: `eq.${similarTo}`,
        limit: "1"
      });

      if (!source) {
        return NextResponse.json(
          { error: "Produkten som ska jÃ¤mfÃ¶ras hittades inte." },
          { status: 404 }
        );
      }

      const similarityExpressions = SIMILARITY_FIELDS.flatMap(({ column }) => {
        const value = source[column]?.trim();
        return value ? [`${column}.eq.${escapePostgrestOrValue(value)}`] : [];
      });

      if (similarityExpressions.length === 0) {
        return NextResponse.json({
          products: [],
          count: 0,
          limit: DEFAULT_SIMILAR_LIMIT,
          offset: 0
        } satisfies ProductsSearchResponse, {
          status: 200,
          headers: { "Cache-Control": "private, no-store" }
        });
      }

      const similarLimit = parseNumber(
        searchParams.get("limit"),
        DEFAULT_SIMILAR_LIMIT,
        1,
        MAX_SIMILAR_LIMIT
      );
      const candidates = await selectSupabaseRows<ProductRow>(PRODUCT_TABLE, {
        select: PRODUCT_COLUMNS,
        id: `neq.${source.id}`,
        or: `(${similarityExpressions.join(",")})`,
        limit: String(SIMILAR_CANDIDATE_LIMIT),
        order: "sin.asc.nullslast"
      });
      const products = rankSimilarProducts(source, candidates)
        .slice(0, similarLimit)
        .map(({ product }) => product);

      return NextResponse.json({
        products,
        count: products.length,
        limit: similarLimit,
        offset: 0
      } satisfies ProductsSearchResponse, {
        status: 200,
        headers: { "Cache-Control": "private, no-store" }
      });
    }

    const hasSearchOrFilter = Boolean(
      query || leverandor || type || utforelse || kVerdi || rti
    );
    if (!hasSearchOrFilter) {
      return NextResponse.json(
        { error: "Ange en söktext eller välj minst ett filter." },
        { status: 400 }
      );
    }

    const params: Record<string, string> = {
      select: PRODUCT_COLUMNS,
      limit: String(limit),
      offset: String(offset),
      order: "sin.asc.nullslast"
    };

    if (query) {
      params.or = `(${SEARCHABLE_COLUMNS.map(
        (column) => `${column}.ilike.*${query}*`
      ).join(",")})`;
    }
    if (leverandor) params.leverandor = `ilike.*${leverandor}*`;
    if (type) params.type = `ilike.*${type}*`;
    if (utforelse) params.utforelse = `ilike.*${utforelse}*`;
    if (kVerdi) params.k_verdi = `ilike.*${kVerdi}*`;
    if (rti) params.rti = `ilike.*${rti}*`;

    const products = deduplicateProducts(
      await selectSupabaseRows<ProductRow>(PRODUCT_TABLE, params)
    );

    const response: ProductsSearchResponse = {
      products,
      count: products.length,
      limit,
      offset
    };

    return NextResponse.json(response, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    console.error("Product search API failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Produktsökningen misslyckades."
      },
      { status: 500 }
    );
  }
}
