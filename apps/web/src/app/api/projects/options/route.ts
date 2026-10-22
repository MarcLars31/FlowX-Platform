import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type CatalogOption = {
  id: string;
  name: string;
};

export async function GET() {
  try {
    const authorization = await requireOrganizationApi(["project.create"]);
    if (authorization.error) return authorization.error;

    const [manufacturers, distributors] = await Promise.all([
      selectUserRows<CatalogOption>("manufacturers", {
        select: "id,name",
        is_active: "eq.true",
        data_set_id: "not.is.null",
        order: "name.asc"
      }),
      selectUserRows<CatalogOption>("suppliers", {
        select: "id,name",
        supplier_type: "eq.distributor",
        is_active: "eq.true",
        data_set_id: "not.is.null",
        order: "name.asc"
      })
    ]);

    return NextResponse.json({ manufacturers, distributors });
  } catch (error) {
    const forbidden = error instanceof UserSupabaseError
      && (error.status === 401 || error.status === 403 || error.code === "42501");
    return NextResponse.json(
      { error: forbidden ? "Åtkomst till projektval nekades." : "Leverantörsvalen kunde inte hämtas." },
      { status: forbidden ? 403 : 500 }
    );
  }
}
