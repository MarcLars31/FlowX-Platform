import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  isUuid,
  MAX_REQUIREMENT_ATTACHMENT_BYTES,
  MAX_REQUIREMENT_ATTACHMENTS,
  parseProductRequirementAttachments,
  requirementAttachmentStoragePath,
  validateRequirementAttachmentUpload,
  withProductRequirementAttachment,
  type ProductRequirementAttachment
} from "@/lib/product-requirement-attachment";
import { deleteAdminStorageObjects } from "@/lib/supabase-admin-storage";
import {
  selectUserRows,
  uploadUserStorageObject,
  updateUserRowsReturning,
  UserSupabaseError
} from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

const STORAGE_BUCKET = "project-files";
const MAX_MULTIPART_REQUEST_BYTES = MAX_REQUIREMENT_ATTACHMENT_BYTES + 64 * 1024;

type RouteContext = {
  params: Promise<{ id: string; requirementId: string }>;
};
type RequirementRow = { value_json: unknown; updated_at: string };

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
      return forbiddenResponse();
    }

    const { id: projectId, requirementId } = await context.params;
    if (!isUuid(projectId) || !isUuid(requirementId)) {
      return NextResponse.json({ error: "Ogiltigt krav-id." }, { status: 400 });
    }

    const requirement = await findRequirement(
      projectId,
      requirementId,
      authorization.context.organization.id
    );
    if (!requirement) {
      return NextResponse.json({ error: "Produktraden hittades inte." }, { status: 404 });
    }

    return NextResponse.json(
      {
        attachments: parseProductRequirementAttachments(requirement.value_json)
          .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))
          .map((attachment) =>
            publicAttachment(projectId, requirementId, attachment)
          )
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return attachmentErrorResponse(error, "Bilagorna kunde inte hämtas.");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi([
      "project.requirement.update"
    ]);
    if (authorization.error) return authorization.error;
    if (
      !authorization.context.permissions.includes("document.upload") ||
      !authorization.context.permissions.includes("project.product_suggestion.create")
    ) {
      return forbiddenResponse();
    }

    const { id: projectId, requirementId } = await context.params;
    if (!isUuid(projectId) || !isUuid(requirementId)) {
      return NextResponse.json({ error: "Ogiltigt krav-id." }, { status: 400 });
    }

    const requestContentType = request.headers.get("content-type") ?? "";
    if (!isMultipartFormData(requestContentType)) {
      return NextResponse.json(
        { error: "Bilagan måste skickas som multipart/form-data." },
        { status: 415 }
      );
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (!contentLengthHeader) {
      return NextResponse.json(
        { error: "Uppladdningens storlek måste anges." },
        { status: 411 }
      );
    }
    if (!/^\d+$/.test(contentLengthHeader)) {
      return NextResponse.json(
        { error: "Uppladdningens storlek är ogiltig." },
        { status: 400 }
      );
    }
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
      return NextResponse.json(
        { error: "Uppladdningens storlek är ogiltig." },
        { status: 400 }
      );
    }
    if (contentLength > MAX_MULTIPART_REQUEST_BYTES) {
      return NextResponse.json(
        { error: "Bilagan får vara högst 4 MB." },
        { status: 413 }
      );
    }

    const requirement = await findRequirement(
      projectId,
      requirementId,
      authorization.context.organization.id
    );
    if (!requirement) {
      return NextResponse.json({ error: "Produktraden hittades inte." }, { status: 404 });
    }
    const existingAttachments = parseProductRequirementAttachments(
      requirement.value_json
    );
    if (existingAttachments.length >= MAX_REQUIREMENT_ATTACHMENTS) {
      return NextResponse.json(
        { error: "Produktraden har nått gränsen på 50 bilagor." },
        { status: 400 }
      );
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Bilagan kunde inte läsas." }, { status: 400 });
    }
    const fileEntries = formData.getAll("file");
    if (fileEntries.length !== 1 || !isUploadedFile(fileEntries[0])) {
      return NextResponse.json(
        { error: "Välj exakt en fil att bifoga." },
        { status: 400 }
      );
    }
    const commentEntries = formData.getAll("comment");
    if (
      commentEntries.length > 1 ||
      (commentEntries.length === 1 && typeof commentEntries[0] !== "string")
    ) {
      return NextResponse.json({ error: "Kommentaren är ogiltig." }, { status: 400 });
    }

    const file = fileEntries[0];
    if (file.size > MAX_REQUIREMENT_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: "Bilagan får vara högst 4 MB." },
        { status: 413 }
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateRequirementAttachmentUpload({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: bytes.byteLength,
      comment: commentEntries[0] ?? null,
      fileBytes: bytes
    });
    if ("error" in validation) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    const attachment: ProductRequirementAttachment = {
      id: randomUUID(),
      ...validation.data,
      uploadedAt: new Date().toISOString(),
      uploadedBy: authorization.user.id
    };
    const storagePath = requirementAttachmentStoragePath({
      organizationId: authorization.context.organization.id,
      projectId,
      requirementId,
      attachment
    });

    await uploadUserStorageObject(
      STORAGE_BUCKET,
      storagePath,
      bytes,
      attachment.contentType
    );
    try {
      const latestRequirement = await findRequirement(
        projectId,
        requirementId,
        authorization.context.organization.id
      );
      if (!latestRequirement) {
        throw new Error("The requirement disappeared before the attachment was saved.");
      }
      if (
        parseProductRequirementAttachments(latestRequirement.value_json).length >=
        MAX_REQUIREMENT_ATTACHMENTS
      ) {
        throw new Error("The requirement attachment limit was reached concurrently.");
      }
      await updateUserRowsReturning(
        "project_requirements",
        {
          id: `eq.${requirementId}`,
          project_id: `eq.${projectId}`,
          organization_id: `eq.${authorization.context.organization.id}`,
          updated_at: `eq.${latestRequirement.updated_at}`,
          deleted_at: "is.null"
        },
        {
          value_json: withProductRequirementAttachment(
            latestRequirement.value_json,
            attachment
          )
        }
      );
    } catch (error) {
      await deleteAdminStorageObjects(STORAGE_BUCKET, [storagePath]).catch(
        () => undefined
      );
      throw error;
    }

    return NextResponse.json(
      { attachment: publicAttachment(projectId, requirementId, attachment) },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" }
      }
    );
  } catch (error) {
    return attachmentErrorResponse(error, "Bilagan kunde inte sparas.");
  }
}

async function findRequirement(
  projectId: string,
  requirementId: string,
  organizationId: string
) {
  const [requirement] = await selectUserRows<RequirementRow>(
    "project_requirements",
    {
      select: "value_json,updated_at",
      id: `eq.${requirementId}`,
      project_id: `eq.${projectId}`,
      organization_id: `eq.${organizationId}`,
      deleted_at: "is.null",
      limit: "1"
    }
  );
  return requirement ?? null;
}

function publicAttachment(
  projectId: string,
  requirementId: string,
  attachment: ProductRequirementAttachment
) {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    comment: attachment.comment,
    uploadedAt: attachment.uploadedAt,
    uploadedBy: attachment.uploadedBy,
    downloadUrl: `/api/projects/${projectId}/requirements/${requirementId}/attachments/${attachment.id}/file`
  };
}

function isUploadedFile(value: FormDataEntryValue | undefined): value is File {
  return Boolean(
    value &&
      typeof value !== "string" &&
      typeof value.name === "string" &&
      typeof value.arrayBuffer === "function"
  );
}

function isMultipartFormData(contentType: string) {
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return false;
  const boundary = contentType.match(
    /(?:^|;)\s*boundary=(?:"([^"]{1,200})"|([^;\s]{1,200}))(?:\s*;|\s*$)/i
  );
  return Boolean(boundary && (boundary[1] || boundary[2]));
}

function forbiddenResponse() {
  return NextResponse.json(
    { error: "Du har inte behörighet för den här åtgärden." },
    { status: 403 }
  );
}

function attachmentErrorResponse(error: unknown, fallback: string) {
  if (error instanceof UserSupabaseError) {
    const forbidden =
      error.status === 401 || error.status === 403 || error.code === "42501";
    return NextResponse.json(
      { error: forbidden ? "Åtgärden nekades." : fallback },
      { status: forbidden ? 403 : 500 }
    );
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
