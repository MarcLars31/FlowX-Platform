import { NextResponse } from "next/server";
import { isJsonRecord } from "@/lib/pkms-product-normalizer";
import { callSupabaseRpc, getSupabaseDiagnostics } from "@/lib/supabase-rest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;

    if (!isJsonRecord(body) || typeof body.id !== "string") {
      return NextResponse.json(
        { error: "Review product id is required." },
        { status: 400 }
      );
    }

    const productId = await callSupabaseRpc<string>("approve_product_review", {
      p_review_id: body.id
    });

    return NextResponse.json({ approved: true, productId });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not approve product.",
        detail: error instanceof Error ? error.message : "Unknown approval error.",
        supabase: getSupabaseDiagnostics()
      },
      { status: 500 }
    );
  }
}
