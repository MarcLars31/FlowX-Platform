import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { ahlsellRequestContext } from "@/lib/ahlsell-shared-fetch.server";
import { ahlsellEvidenceStore } from "@/lib/ahlsell-evidence-store.server";
import { MaterialImportError, validateMaterialSearchInput } from "@/lib/material-import";
import { matchMaterialRow } from "@/lib/material-import-matching";
import { AhlsellLookupInputError } from "@/lib/ahlsell-product-lookup";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const supplier = ahlsellRequestContext();
  try {
    const authorization = await requireOrganizationApi(["project.product_suggestion.view"]);
    if (authorization.error) return authorization.error;
    const limit = consumeRateLimit(requestRateLimitKey(request, "material-import-match", authorization.user.id), 20, 60_000);
    if (!limit.allowed) return NextResponse.json({ error: "Sökningen pausades tillfälligt. Försök igen om en stund." }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds) } });
    const input = validateMaterialSearchInput(await readJsonBody<unknown>(request, 16000));
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
    const result = await matchMaterialRow(input, { fetchImpl: supplier.fetch, signal, store: ahlsellEvidenceStore() });
    if (supplier.retryAfter) return NextResponse.json({ error: "Ahlsell-sökningen är tillfälligt upptagen. Försök igen om en stund." }, { status: 429, headers: { ...headers, "Retry-After": String(supplier.retryAfter) } });
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (supplier.retryAfter) return NextResponse.json({ error: "Ahlsell-sökningen är tillfälligt upptagen." }, { status: 429, headers: { ...headers, "Retry-After": String(supplier.retryAfter) } });
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Materialraden är för stor." }, { status: 413, headers });
    if (error instanceof MaterialImportError || error instanceof AhlsellLookupInputError || error instanceof SyntaxError) return NextResponse.json({ error: error instanceof SyntaxError ? "Ogiltig materialrad." : error.message }, { status: 400, headers });
    return NextResponse.json({ error: "Produktsökningen kunde inte slutföras. Dina tidigare resultat finns kvar; försök igen." }, { status: 502, headers });
  }
}
