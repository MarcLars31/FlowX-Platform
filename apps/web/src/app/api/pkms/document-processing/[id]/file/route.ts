import { NextResponse } from "next/server";
import { requirePlatformAdminApi } from "@/lib/platform-api-authorization";
import { selectSupabaseRows } from "@/lib/supabase-rest";
import { downloadAdminStorageObject } from "@/lib/supabase-admin-storage";

type RouteContext = { params: Promise<{ id: string }> };
type DocumentStorageRow = {
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const authorizationError = await requirePlatformAdminApi();
  if (authorizationError) return authorizationError;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid document ID." }, { status: 400 });

  try {
    const rows = await selectSupabaseRows<DocumentStorageRow>("documents", {
      select: "storage_bucket,storage_path,file_name",
      id: `eq.${id}`,
      deleted_at: "is.null",
      limit: "1"
    });
    const document = rows[0];
    if (!document?.storage_bucket || !document.storage_path) {
      return NextResponse.json({ error: "PDF file not found." }, { status: 404 });
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
    return NextResponse.json({ error: "PDF file could not be opened." }, { status: 500 });
  }
}

function safeFileName(value: string | null) {
  return value?.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "datasheet.pdf";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
