import { NextResponse } from "next/server";
import {
  isJsonRecord,
  normalizeProductImport
} from "@/lib/pkms-product-normalizer";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import {
  getSupabaseDiagnostics,
  selectSupabaseRows,
  updateSupabaseRowsReturning
} from "@/lib/supabase-rest";

export const runtime = "nodejs";

type ProductRow = Record<string, unknown> & {
  id: string;
  raw_text?: string;
  source_document?: string;
};

const directTextFields = [
  "manufacturer",
  "product_no",
  "product_name",
  "category",
  "sub_category",
  "color",
  "review_notes"
] as const;

const rawTextFields = [
  "k_value_raw",
  "rti",
  "datasheet_url",
  "response_type",
  "orientation",
  "approvals"
] as const;

export async function GET() {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;

  try {
    const rows = await selectSupabaseRows<ProductRow>("products", {
      status: "eq.needs_review",
      order: "created_at.asc"
    });

    return NextResponse.json({
      products: rows.map(expandReviewProduct),
      supabase: getSupabaseDiagnostics()
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not load products awaiting approval.",
        detail: error instanceof Error ? error.message : "Unknown queue error.",
        products: [],
        supabase: getSupabaseDiagnostics()
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;

  try {
    const body = (await request.json()) as unknown;

    if (
      !isJsonRecord(body) ||
      typeof body.id !== "string" ||
      !isJsonRecord(body.product)
    ) {
      return NextResponse.json(
        { error: "Review product id and editable values are required." },
        { status: 400 }
      );
    }

    const [existingProduct] = await selectSupabaseRows<ProductRow>("products", {
      id: `eq.${body.id}`,
      status: "eq.needs_review",
      limit: "1"
    });

    if (!existingProduct) {
      return NextResponse.json(
        { error: "Product is no longer awaiting approval." },
        { status: 409 }
      );
    }

    const product = body.product;
    const rawPayload = parseRawPayload(existingProduct.raw_text);
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    directTextFields.forEach((field) => {
      const value = product[field];
      if (typeof value === "string") {
        payload[field] = field === "manufacturer" ? value.trim() : value.trim() || null;
      }
    });

    rawTextFields.forEach((field) => {
      const value = product[field];
      if (typeof value === "string") rawPayload[field] = value.trim() || null;
    });

    if (Array.isArray(product.temperature_ratings)) {
      const temperatureRatings = product.temperature_ratings.filter(isJsonRecord);
      payload.temperature_ratings = temperatureRatings;
      rawPayload.temperature_ratings = temperatureRatings;
    }

    if (typeof product.color === "string") {
      rawPayload.color = product.color.trim() || null;
    }

    payload.raw_text = JSON.stringify(rawPayload);

    const [updatedProduct] = await updateSupabaseRowsReturning<ProductRow>(
      "products",
      { id: `eq.${body.id}`, status: "eq.needs_review" },
      payload
    );

    if (!updatedProduct) {
      return NextResponse.json(
        { error: "Product is no longer awaiting approval." },
        { status: 409 }
      );
    }

    return NextResponse.json({ product: expandReviewProduct(updatedProduct) });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not update review product.",
        detail: error instanceof Error ? error.message : "Unknown update error."
      },
      { status: 500 }
    );
  }
}

function expandReviewProduct(row: ProductRow) {
  const rawPayload = parseRawPayload(row.raw_text);
  const approvals = rawPayload.approvals;
  const rawJson = isJsonRecord(rawPayload.raw_json)
    ? rawPayload.raw_json
    : undefined;
  const normalizationSource =
    rawJson && isJsonRecord(rawJson.source) ? rawJson.source : rawJson;
  const normalizedProduct = normalizationSource
    ? normalizeProductImport(normalizationSource).products[0]
    : undefined;

  return {
    ...row,
    source_file: row.source_document ?? "JSON import",
    source_row: rawPayload.source_row,
    k_value_raw: rawPayload.k_value_raw ?? normalizedProduct?.k_value_raw,
    rti: rawPayload.rti ?? normalizedProduct?.rti,
    datasheet_url: rawPayload.datasheet_url ?? normalizedProduct?.datasheet_url,
    response_type:
      rawPayload.response_type ?? normalizedProduct?.response_type,
    orientation: rawPayload.orientation ?? normalizedProduct?.orientation,
    approvals: Array.isArray(approvals)
      ? approvals.map(String).join(", ")
      : approvals ?? normalizedProduct?.approvals,
    temperature_ratings:
      row.temperature_ratings ??
      rawPayload.temperature_ratings ??
      normalizedProduct?.temperature_ratings,
    color: row.color ?? rawPayload.color ?? normalizedProduct?.color
  };
}

function parseRawPayload(rawText: string | undefined) {
  if (!rawText) return {} as Record<string, unknown>;

  try {
    const parsed = JSON.parse(rawText) as unknown;
    return isJsonRecord(parsed) ? parsed : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}
