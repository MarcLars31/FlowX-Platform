import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { createAdminStorageUploadUrl } from "@/lib/supabase-admin-storage";
import { validateTechnicalDescriptionFile } from "@/lib/technical-description-file";
import {
  cleanupTechnicalDescriptionUpload,
  ownedTechnicalDescriptionUploadPath,
  TECHNICAL_DESCRIPTION_UPLOAD_BUCKET,
  TechnicalDescriptionUploadError
} from "@/lib/technical-description-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authorization = await requireOrganizationApi(["technical_description.create"]);
    if (authorization.error) return authorization.error;
    const limit = consumeRateLimit(
      requestRateLimitKey(request, "technical-description-upload", authorization.user.id), 5, 60_000
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "For mange opplastinger. Prøv igjen senere." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    const body = await readJsonBody<Record<string, unknown> | null>(request, 4096);
    const validationError = validateTechnicalDescriptionFile({
      name: body?.fileName, size: body?.size, type: body?.contentType
    });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const uploadId = randomUUID();
    const path = ownedTechnicalDescriptionUploadPath({
      organizationId: authorization.context.organization.id,
      userId: authorization.user.id
    }, uploadId);
    const signedUrl = await createAdminStorageUploadUrl(TECHNICAL_DESCRIPTION_UPLOAD_BUCKET, path);
    return NextResponse.json({ uploadId, signedUrl }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return uploadErrorResponse(error);
  }
}

// Called if browser OCR or a storage upload fails before analysis completes.
export async function DELETE(request: Request) {
  try {
    const authorization = await requireOrganizationApi(["technical_description.create"]);
    if (authorization.error) return authorization.error;
    const body = await readJsonBody<Record<string, unknown> | null>(request, 4096);
    const path = ownedTechnicalDescriptionUploadPath({
      organizationId: authorization.context.organization.id,
      userId: authorization.user.id
    }, body?.uploadId);
    await cleanupTechnicalDescriptionUpload(path);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return uploadErrorResponse(error);
  }
}

function uploadErrorResponse(error: unknown) {
  if (error instanceof RequestBodyTooLargeError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Ugyldige opplastingsdata." }, { status: 400 });
  }
  if (error instanceof TechnicalDescriptionUploadError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Technical description upload setup failed", {
    name: error instanceof Error ? error.name : "UnknownError"
  });
  return NextResponse.json({ error: "Filopplastingen kunne ikke klargjøres. Prøv igjen." }, { status: 500 });
}
