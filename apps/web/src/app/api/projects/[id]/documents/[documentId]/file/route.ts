import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { downloadAdminStorageObject } from "@/lib/supabase-admin-storage";
import { selectUserRows } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; documentId: string }>;
};
type ProjectDocumentStorageRow = {
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await requireOrganizationApi(["document.view"]);
  if (authorization.error) return authorization.error;

  const { id: projectId, documentId } = await params;
  if (!isUuid(projectId) || !isUuid(documentId)) {
    return NextResponse.json({ error: "Ogiltigt PDF-dokument." }, { status: 400 });
  }

  try {
    const [document] = await selectUserRows<ProjectDocumentStorageRow>(
      "project_documents",
      {
        select: "storage_bucket,storage_path,file_name",
        id: `eq.${documentId}`,
        project_id: `eq.${projectId}`,
        organization_id: `eq.${authorization.context.organization.id}`,
        status: "eq.active",
        deleted_at: "is.null",
        limit: "1"
      }
    );
    if (!document?.storage_bucket || !document.storage_path) {
      return NextResponse.json({ error: "PDF-filen hittades inte." }, { status: 404 });
    }

    const file = await downloadAdminStorageObject(
      document.storage_bucket,
      document.storage_path
    );
    return new Response(Buffer.from(file), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFileName(document.file_name)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "sandbox; default-src 'none'"
      }
    });
  } catch {
    return NextResponse.json({ error: "PDF-filen kunde inte öppnas." }, { status: 500 });
  }
}

function safeFileName(value: string | null) {
  return value?.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "project-source.pdf";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
