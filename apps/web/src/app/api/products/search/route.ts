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
    const limit = parseNumber(searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = parseNumber(searchParams.get("offset"), 0, 0, 100_000);

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
    if (leverandor) params.leverandor = `eq.${leverandor}`;
    if (type) params.type = `eq.${type}`;
    if (utforelse) params.utforelse = `eq.${utforelse}`;
    if (kVerdi) params.k_verdi = `eq.${kVerdi}`;
    if (rti) params.rti = `eq.${rti}`;

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
