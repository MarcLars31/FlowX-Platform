import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { selectUserRows } from "@/lib/supabase-user-rest";
import { processTechnicalDescription } from "@/lib/technical-description-processor";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET() {
  try {
    const authorization = await requireOrganizationApi([
      "technical_description.view"
    ]);
    if (authorization.error) return authorization.error;

    const documents = await selectUserRows("technical_description_documents", {
      select:
        "id,project_id,file_name,status,extraction_method,page_count,project_name,project_number,chapter,standards,warnings,created_by,created_at,updated_at",
      organization_id: `eq.${authorization.context.organization.id}`,
      order: "created_at.desc",
      limit: "50"
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("technical_description_list_failed", { name: error instanceof Error ? error.name : "Error" });
    return NextResponse.json({ error: "Dokumenten kunde inte laddas." }, { status: 503 });
  }
}


export async function POST(request: Request) {
  const auth = await requireOrganizationApi(["technical_description.create"]);
  if (auth.error) return auth.error;
  return processTechnicalDescription(request, auth);
}
