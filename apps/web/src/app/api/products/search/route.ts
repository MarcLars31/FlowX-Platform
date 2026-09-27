import { NextRequest, NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { isPlatformAdmin } from "@/lib/platform-role";
import { getCurrentUser } from "@/lib/supabase-auth";
import {
  selectSupabaseRows,
  selectSupabaseRowsWithCount
} from "@/lib/supabase-rest";
import {
  buildSprsokSearchOr,
  isMissingSprsokSearchView,
  sprsokIlikeContains
} from "@/lib/sprsok-search";

const PRODUCT_SEARCH_VIEW = "flowx_product_search";
const SPRSOK_PRODUCT_SEARCH_VIEW = "sprsok_product_search";
const LEGACY_PRODUCT_TABLE = "sprsok_products";

const LEGACY_PRODUCT_COLUMNS = [
  "id",
  "sin",
  "leverandor",
  "type",
  "utforelse",
  "k_verdi",
  "rti",
  "datablad"
].join(",");

const PRODUCT_COLUMNS = [
  LEGACY_PRODUCT_COLUMNS,
  "source",
  "source_id",
  "is_demo",
  "demo_disclaimer"
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
  id: string | number | null;
  source?: "sprsok" | "flowx" | null;
  source_id?: string | null;
  sin: string | null;
  leverandor: string | null;
  type: string | null;
  utforelse: string | null;
  k_verdi: string | null;
  rti: string | null;
  datablad: string | null;
  is_demo?: boolean;
  demo_disclaimer?: string | null;
  documents?: PublishedProductDocument[];
};

type CanonicalProductRow = {
  id: string;
  manufacturer: string | null;
  product_no: string | null;
  manufacturer_product_number: string | null;
};

type PublishedProductDocument = {
  document_id: string;
  title: string | null;
  document_type: string | null;
  language_code: string | null;
  page_numbers: number[] | null;
  source_page: number | null;
  original_pdf_url: string | null;
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
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsedValue) && parsedValue > 0 ? value : null;
  }
  if (/^sprsok:[1-9]\d*$/.test(value)) return value;
  if (
    /^flowx:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    return value;
  }
  return null;
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

      const [source] = await selectProductRows({
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
      const candidates = await selectProductRows({
        id: `neq.${source.id}`,
        or: `(${similarityExpressions.join(",")})`,
        limit: String(SIMILAR_CANDIDATE_LIMIT),
        order: "sin.asc.nullslast"
      });
      const rankedProducts = rankSimilarProducts(source, candidates)
        .slice(0, similarLimit)
        .map(({ product }) => product);
      const products = await attachPublishedDocuments(rankedProducts);

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

    const params: Record<string, string> = {
      limit: String(limit),
      offset: String(offset),
      order: "sin.asc.nullslast"
    };

    if (leverandor) params.leverandor = sprsokIlikeContains(leverandor);
    if (type) params.type = sprsokIlikeContains(type);
    if (utforelse) params.utforelse = sprsokIlikeContains(utforelse);
    if (kVerdi) params.k_verdi = sprsokIlikeContains(kVerdi);
    if (rti) params.rti = sprsokIlikeContains(rti);

    const legacyParams = { ...params };
    const indexedParams = { ...params };
    if (query) {
      legacyParams.or = buildSprsokSearchOr(SEARCHABLE_COLUMNS, query, false);
      indexedParams.or = buildSprsokSearchOr(SEARCHABLE_COLUMNS, query, true);
    }

    const { rows: matchedProducts, total } = await selectProductRowsWithCount(
      indexedParams,
      legacyParams
    );
    const products = await attachPublishedDocuments(matchedProducts);

    const response: ProductsSearchResponse = {
      products,
      count: total,
      limit,
      offset
    };

    return NextResponse.json(response, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    console.error("Product search API failed", {
      name: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json(
      { error: "Produktsökningen misslyckades." },
      { status: 500 }
    );
  }
}

async function selectProductRows(params: Record<string, string>) {
  try {
    return await selectSupabaseRows<ProductRow>(PRODUCT_SEARCH_VIEW, {
      ...params,
      select: PRODUCT_COLUMNS,
      order:
        params.order === "sin.asc.nullslast"
          ? "is_demo.desc,sin.asc.nullslast"
          : params.order
    });
  } catch (error) {
    if (!isMissingSprsokSearchView(error)) throw error;
  }

  try {
    return await selectSupabaseRows<ProductRow>(SPRSOK_PRODUCT_SEARCH_VIEW, {
      ...params,
      select: LEGACY_PRODUCT_COLUMNS
    });
  } catch (error) {
    if (!isMissingSprsokSearchView(error)) throw error;
    // Web and migrations may be deployed independently. Keep the legacy
    // product catalog available until the versioned views exist.
    return selectSupabaseRows<ProductRow>(LEGACY_PRODUCT_TABLE, {
      ...params,
      select: LEGACY_PRODUCT_COLUMNS
    });
  }
}

async function selectProductRowsWithCount(
  indexedParams: Record<string, string>,
  legacyParams: Record<string, string>
) {
  try {
    return await selectSupabaseRowsWithCount<ProductRow>(
      PRODUCT_SEARCH_VIEW,
      {
        ...indexedParams,
        select: PRODUCT_COLUMNS,
        order:
          indexedParams.order === "sin.asc.nullslast"
            ? "is_demo.desc,sin.asc.nullslast"
            : indexedParams.order
      }
    );
  } catch (error) {
    if (!isMissingSprsokSearchView(error)) throw error;
  }

  try {
    return await selectSupabaseRowsWithCount<ProductRow>(
      SPRSOK_PRODUCT_SEARCH_VIEW,
      { ...legacyParams, select: LEGACY_PRODUCT_COLUMNS }
    );
  } catch (error) {
    if (!isMissingSprsokSearchView(error)) throw error;
    return selectSupabaseRowsWithCount<ProductRow>(LEGACY_PRODUCT_TABLE, {
      ...legacyParams,
      select: LEGACY_PRODUCT_COLUMNS
    });
  }
}

async function attachPublishedDocuments(products: ProductRow[]) {
  const productNumbers = [
    ...new Set(
      products
        .map((product) => product.sin?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ];
  if (productNumbers.length === 0) return products;

  try {
    const canonicalProducts = await selectSupabaseRows<CanonicalProductRow>("products", {
      select: "id,manufacturer,product_no,manufacturer_product_number",
      or: `(${productNumbers.flatMap((number) => [
        `product_no.eq.${escapePostgrestOrValue(number)}`,
        `manufacturer_product_number.eq.${escapePostgrestOrValue(number)}`
      ]).join(",")})`,
      deleted_at: "is.null",
      limit: String(Math.min(productNumbers.length * 4, 400))
    });
    if (canonicalProducts.length === 0) return products;

    const documents = await selectSupabaseRows<PublishedProductDocument>(
      "published_product_documents",
      {
        select: [
          "document_id", "product_id", "title", "document_type", "language_code",
          "page_numbers", "source_page", "original_pdf_url"
        ].join(","),
        product_id: `in.(${canonicalProducts.map((product) => product.id).join(",")})`,
        order: "publication_date.desc.nullslast,document_updated_at.desc",
        limit: "500"
      }
    );
    const documentsByProduct = new Map<string, PublishedProductDocument[]>();
    for (const document of documents as Array<PublishedProductDocument & { product_id?: string }>) {
      if (!document.product_id) continue;
      const current = documentsByProduct.get(document.product_id) ?? [];
      if (!current.some((item) => item.document_id === document.document_id)) {
        current.push(document);
      }
      documentsByProduct.set(document.product_id, current);
    }

    return products.map((product) => {
      const number = normalizeComparableValue(product.sin);
      const supplier = normalizeComparableValue(product.leverandor);
      const canonical = canonicalProducts.find((candidate) => {
        const numberMatches = [
          candidate.product_no,
          candidate.manufacturer_product_number
        ].some((value) => normalizeComparableValue(value) === number);
        const manufacturer = normalizeComparableValue(candidate.manufacturer);
        return numberMatches && (!supplier || !manufacturer || supplier === manufacturer);
      });
      return {
        ...product,
        documents: canonical ? documentsByProduct.get(canonical.id) ?? [] : []
      };
    });
  } catch {
    // The canonical ingestion migration may not have been deployed yet. Product
    // search must remain available while the verified-document list is empty.
    return products.map((product) => ({ ...product, documents: [] }));
  }
}
