import { NextResponse } from "next/server";
import {
  isJsonRecord,
  normalizeProductImport,
  type NormalizedProduct
} from "@/lib/pkms-product-normalizer";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import {
  getSupabaseDiagnostics,
  insertSupabaseRow,
  selectSupabaseRows
} from "@/lib/supabase-rest";
import {
  readJsonBody,
  RequestBodyTooLargeError
} from "@/lib/request-body";

export const runtime = "nodejs";

const maxJsonBytes = 10 * 1024 * 1024;
const maxQueuedProducts = 5000;

type ProductReviewInsert = {
  id: string;
  manufacturer: string;
  product_no?: string;
  product_name?: string;
  category?: string;
  sub_category?: string;
  temperature_ratings?: Record<string, unknown>[];
  color?: string;
  source_document: string;
  raw_text: string;
  status: "needs_review";
};

type RowError = {
  row: string;
  message: string;
  manufacturer?: string;
  product_no?: string;
};

type QueueResult = {
  total: number;
  queued: number;
  failed: number;
  errors: RowError[];
  jobLogError?: string;
  supabase: ReturnType<typeof getSupabaseDiagnostics>;
};

export async function POST(request: Request) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;

  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);

    if (contentLength > maxJsonBytes) {
      return NextResponse.json(
        { error: "Product payload exceeds the 10 MB import limit." },
        { status: 413 }
      );
    }

    if (!request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json(
        { error: "Preview the JSON products before saving them for review." },
        { status: 415 }
      );
    }

    const body = (await readJsonBody<unknown>(request, maxJsonBytes)) as unknown;

    if (
      !isJsonRecord(body) ||
      body.confirmed !== true ||
      !Array.isArray(body.products) ||
      body.products.length === 0
    ) {
      return NextResponse.json(
        { error: "At least one confirmed product is required." },
        { status: 400 }
      );
    }

    if (body.products.length > maxQueuedProducts) {
      return NextResponse.json(
        { error: `A maximum of ${maxQueuedProducts} products can be queued at once.` },
        { status: 413 }
      );
    }

    const fileName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim().slice(0, 255)
        : "products.json";
    const normalized = normalizeProductImport(body.products);
    const result: QueueResult = {
      total: normalized.products.length + normalized.errors.length,
      queued: 0,
      failed: 0,
      errors: normalized.errors.map((error) => ({
        row: error.row,
        message: error.message
      })),
      supabase: getSupabaseDiagnostics()
    };
    await assertReviewQueueSchemaReady();

    for (const product of normalized.products) {
      try {
        await insertSupabaseRow(
          "products",
          toProductReviewInsert(product, fileName)
        );
        result.queued += 1;
      } catch {
        result.errors.push({
          row: product.sourceRow,
          message: "Review queue insert failed.",
          manufacturer: product.manufacturer,
          product_no: product.product_no
        });
      }
    }

    result.failed = result.total - result.queued;

    const jobLogError = await logExtractionJob(fileName, result);
    if (jobLogError) result.jobLogError = jobLogError;

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not save products for review.",
        supabase: getSupabaseDiagnostics()
      },
      {
        status:
          error instanceof RequestBodyTooLargeError
            ? 413
            : error instanceof SyntaxError
              ? 400
              : 500
      }
    );
  }
}

function toProductReviewInsert(
  product: NormalizedProduct,
  fileName: string
): ProductReviewInsert {
  return removeUndefinedValues({
    id: crypto.randomUUID(),
    manufacturer: product.manufacturer || "Unknown",
    product_no: product.product_no,
    product_name: product.product_name,
    category: product.category,
    sub_category: product.sub_category,
    temperature_ratings: product.temperature_ratings,
    color: product.color,
    source_document: fileName,
    raw_text: JSON.stringify({
      source_row: product.sourceRow,
      k_value_raw: product.k_value_raw,
      rti: product.rti,
      datasheet_url: product.datasheet_url,
      response_type: product.response_type,
      orientation: product.orientation,
      approvals: product.approvals,
      temperature_ratings: product.temperature_ratings,
      color: product.color,
      raw_json: product.raw_json
    }),
    status: "needs_review"
  });
}

async function assertReviewQueueSchemaReady() {
  try {
    await Promise.all([
      selectSupabaseRows("products", {
        select: "id,status,product_no,temperature_ratings,color",
        limit: "1"
      }),
      selectSupabaseRows("extraction_jobs", {
        select: "id,import_type,total_records,imported_records,failed_records",
        limit: "1"
      })
    ]);
  } catch {
    throw new Error(
      "Review queue schema is not ready. Run the pending SQL files in supabase/migrations."
    );
  }
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}

async function logExtractionJob(fileName: string, result: QueueResult) {
  const errorMessage = result.errors
    .slice(0, 5)
    .map((error) => `Row ${error.row}: ${error.message}`)
    .join("; ");
  const status =
    result.failed > 0 && result.queued === 0 ? "failed" : "completed";
  const createdAt = new Date().toISOString();
  const payloads: Record<string, unknown>[] = [
    {
      id: crypto.randomUUID(),
      file_name: fileName,
      import_type: "json_review_queue",
      status,
      total_records: result.total,
      imported_records: result.queued,
      failed_records: result.failed,
      error_message: errorMessage || null,
      created_at: createdAt
    },
    {
      file_name: fileName,
      status,
      total_records: result.total,
      imported_records: result.queued,
      failed_records: result.failed,
      error_message: errorMessage || null
    }
  ];

  let lastError = "Could not log extraction job.";

  for (const payload of payloads) {
    try {
      await insertSupabaseRow("extraction_jobs", payload);
      return null;
    } catch {
      lastError = "Could not log extraction job.";
    }
  }

  return `extraction_jobs logging failed: ${lastError}`;
}
