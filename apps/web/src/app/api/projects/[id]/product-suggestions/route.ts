import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";

export const runtime = "nodejs";

/**
 * Kept as a compatibility endpoint for older clients. Automatic catalogue
 * matching is intentionally disabled; Ahlsell records reviewed product choices
 * through /product-mappings instead.
 */
export async function POST() {
  const authorization = await requireOrganizationApi([
    "project.product_suggestion.create"
  ]);
  if (authorization.error) return authorization.error;

  return NextResponse.json(
    {
      error: "Automatisk produktmatchning är avstängd.",
      next: "Registrera Ahlsells granskade produktval i projektets produktvalsflik."
    },
    { status: 410 }
  );
}
