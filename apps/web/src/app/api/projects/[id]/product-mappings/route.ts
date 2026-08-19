import { NextResponse } from "next/server";
import {
  isUuid,
  validateDistributorProductMapping
} from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { callUserRpc, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi([
      "project.product_suggestion.create"
    ]);
    if (authorization.error) return authorization.error;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    }
    const validation = validateDistributorProductMapping(
      await request.json().catch(() => null)
    );
    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const input = validation.data;
    await callUserRpc<string>(
      "prepare_requirement_for_direct_product_mapping",
      {
        requested_project_id: id,
        requested_requirement_id: input.requirementId
      }
    );
    const result = await callUserRpc<Record<string, unknown>>(
      "save_distributor_product_mapping",
      {
        requested_project_id: id,
        requested_requirement_id: input.requirementId,
        requested_product_name: input.productName,
        requested_product_number: input.productNumber,
        requested_manufacturer_name: input.manufacturerName || null,
        requested_notes: input.notes || null,
        requested_accessories: input.accessories
      }
    );

    return NextResponse.json({
      mapping: result,
      message:
        "Produktvalet och tillbehören är sparade. Kopplingen kan nu föreslås i kommande liknande projekt."
    });
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const denied =
        error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json(
        {
          error: denied
            ? "Du har inte behörighet att registrera produktval i projektet."
            : readableDatabaseError(error.message)
        },
        { status: denied ? 403 : 400 }
      );
    }
    return NextResponse.json(
      { error: "Produktvalet kunde inte sparas." },
      { status: 500 }
    );
  }
}

function readableDatabaseError(message: string) {
  if (message.includes("Rejected requirements")) {
    return "En avvisad produktrad kan inte kopplas till en produkt.";
  }
  if (message.includes("Only confirmed requirements")) {
    return "Produktraden kunde inte förberedas för produktval.";
  }
  if (message.includes("Removal lines")) {
    return "En demonteringsrad ska inte kopplas till en ny produkt.";
  }
  if (message.includes("Product name and product number")) {
    return "Produktnamn och Ahlsells artikelnummer krävs.";
  }
  return "Produktvalet kunde inte sparas. Kontrollera uppgifterna och försök igen.";
}
