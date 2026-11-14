import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  attachmentContentDisposition,
  isUuid,
  parseProductRequirementAttachments,
  requirementAttachmentStoragePath
} from "@/lib/product-requirement-attachment";
import { downloadAdminStorageObject } from "@/lib/supabase-admin-storage";
import { selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

const STORAGE_BUCKET = "project-files";

type RouteContext = {
  params: Promise<{ id: string; requirementId: string; documentId: string }>;
};
type RequirementRow = { value_json: unknown };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi([
      "project.requirement.view"
    ]);
    if (authorization.error) return authorization.error;
    if (
      !authorization.context.permissions.includes("document.view") ||
      !authorization.context.permissions.includes("project.product_suggestion.view")
    ) {
      return NextResponse.json(
        { error: "Du har inte behörighet att öppna bilagan." },
        { status: 403 }
      );
    }

    const {
      id: projectId,
      requirementId,
      documentId: attachmentId
    } = await context.params;
    if (
      !isUuid(projectId) ||
      !isUuid(requirementId) ||
      !isUuid(attachmentId)
    ) {
      return NextResponse.json({ error: "Ogiltigt bilage-id." }, { status: 400 });
    }

    const [requirement] = await selectUserRows<RequirementRow>(
      "project_requirements",
      {
        select: "value_json",
        id: `eq.${requirementId}`,
        project_id: `eq.${projectId}`,
        organization_id: `eq.${authorization.context.organization.id}`,
        deleted_at: "is.null",
        limit: "1"
      }
    );
    const attachment = parseProductRequirementAttachments(
      requirement?.value_json
    ).find((candidate) => candidate.id === attachmentId);
    if (!attachment) {
      return NextResponse.json({ error: "Bilagan hittades inte." }, { status: 404 });
    }

    const storagePath = requirementAttachmentStoragePath({
      organizationId: authorization.context.organization.id,
      projectId,
      requirementId,
      attachment
    });
    const file = await downloadAdminStorageObject(STORAGE_BUCKET, storagePath);

    return new Response(Buffer.from(file), {
      status: 200,
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(file.byteLength),
        "Content-Disposition": attachmentContentDisposition(attachment.fileName),
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "sandbox; default-src 'none'"
      }
    });
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const forbidden =
        error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json(
        { error: forbidden ? "Åtgärden nekades." : "Bilagan kunde inte öppnas." },
        { status: forbidden ? 403 : 500 }
      );
    }
    return NextResponse.json(
      { error: "Bilagan kunde inte öppnas." },
      { status: 500 }
    );
  }
}
