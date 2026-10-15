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
  sprsokIlikeContains,
  sprsokExactNumberFilter
} from "@/lib/sprsok-search";

import { findSimilarProducts, type SimilarityProduct, type ProductSimilarity } from "@/lib/product-similarity";
import { rankedProductSearchPage } from "@/lib/product-search-pagination";
import { normalizeArticleNumber } from "@/lib/sprsok-sync-core";

import { createProductSearchStore } from "@/lib/product-search-store";

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

type ProductRow = SimilarityProduct & {
  similarity?: ProductSimilarity;
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
  truncated?: boolean;
};

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
    .replace(/[*%_\[\]{}]/g, "")
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
          { error: "Ogiltigt produkt-ID för liknande produkter." },
          { status: 400 }
        );
      }

      const [source] = await selectProductRows({
        id: `eq.${similarTo}`,
        limit: "1"
      });

      if (!source) {
        return NextResponse.json(
          { error: "Produkten som ska jämföras hittades inte." },
          { status: 404 }
        );
      }

      const similarLimit = parseNumber(
        searchParams.get("limit"),
        DEFAULT_SIMILAR_LIMIT,
        1,
        MAX_SIMILAR_LIMIT
      );
      const similar = await findSimilarProducts(source, selectProductRows, similarLimit);
      const products = await attachPublishedDocuments(similar.products);

      return NextResponse.json({
        products,
        count: products.length,
        limit: similarLimit,
        offset: 0,
        truncated: similar.truncated
      } satisfies ProductsSearchResponse, {
        status: 200,
        headers: { "Cache-Control": "private, no-store" }
      });
    }

    const params: Record<string, string> = {
      limit: String(limit),
      offset: String(offset),
      order: "sin.asc.nullslast,id.asc"
    };

    if (leverandor) params.leverandor = sprsokIlikeContains(leverandor);
    if (type) params.type = sprsokIlikeContains(type);
    if (utforelse) params.utforelse = sprsokIlikeContains(utforelse);
    if (kVerdi) params.k_verdi = sprsokExactNumberFilter(kVerdi);
    if (rti) params.rti = sprsokIlikeContains(rti);

    const legacyParams = { ...params };
    const indexedParams = { ...params };
    if (query) {
      const legacySearch = buildSprsokSearchOr(SEARCHABLE_COLUMNS, query, false);
      const indexedSearch = buildSprsokSearchOr(SEARCHABLE_COLUMNS, query, true);
      if (legacySearch) legacyParams.or = legacySearch;
      if (indexedSearch) indexedParams.or = indexedSearch;
    }

    const { rows: matchedProducts, total } = await rankedProductSearchPage(query, limit, offset,
      (group, pageLimit, pageOffset) => {
        const indexed = { ...indexedParams, limit: String(pageLimit), offset: String(pageOffset) };
        const legacy = { ...legacyParams, limit: String(pageLimit), offset: String(pageOffset) };
        if (group !== "all") {
          Object.assign(indexed, { normalized_article_number: `${group === "exact" ? "eq" : "not.eq"}.${normalizeArticleNumber(query)}` });
          Object.assign(legacy, { sin: `${group === "exact" ? "ilike" : "not.ilike"}.${query}` });
        }
        return selectProductRowsWithCount(indexed, legacy);
      });
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

const { selectRows: selectProductRows, selectWithCount: selectProductRowsWithCount } = createProductSearchStore<ProductRow>({
  select: selectSupabaseRows,
  selectWithCount: selectSupabaseRowsWithCount
});

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
