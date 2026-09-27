import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  updateUserRowsReturning,
  UserSupabaseError
} from "@/lib/supabase-user-rest";
import type { Organization } from "@/types/organization";

export const runtime = "nodejs";

type SettingsBody = {
  name?: unknown;
  organizationNumber?: unknown;
  retentionDays?: unknown;
};

export async function PATCH(request: Request) {
  try {
    const authorization = await requireOrganizationApi([
      "organization.update",
      "subscription.manage"
    ]);
    if (authorization.error) return authorization.error;

    const body = (await request.json().catch(() => null)) as SettingsBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Inställningar saknas." }, { status: 400 });
    }
    const hasOrganizationFields = "name" in body || "organizationNumber" in body;
    const hasRetention = "retentionDays" in body;
    if (!hasOrganizationFields && !hasRetention) {
      return NextResponse.json({ error: "Ingen ändring angavs." }, { status: 400 });
    }

    const permissions = authorization.context.permissions;
    if (hasOrganizationFields && !permissions.includes("organization.update")) {
      return NextResponse.json({ error: "Du saknar behörighet att ändra organisationen." }, { status: 403 });
    }
    if (hasRetention && !permissions.includes("subscription.manage")) {
      return NextResponse.json({ error: "Du saknar behörighet att ändra retention-inställningen." }, { status: 403 });
    }

    let organization: Organization | undefined;
    if (hasOrganizationFields) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 200) {
        return NextResponse.json({ error: "Organisationsnamnet måste vara 1–200 tecken." }, { status: 400 });
      }
      const organizationNumber = body.organizationNumber === null || body.organizationNumber === ""
        ? null
        : typeof body.organizationNumber === "string"
          ? body.organizationNumber.trim().slice(0, 100)
          : undefined;
      if (organizationNumber === undefined) {
        return NextResponse.json({ error: "Organisationsnummer måste vara text." }, { status: 400 });
      }
      organization = await updateUserRowsReturning<Organization>(
        "organizations",
        { id: `eq.${authorization.context.organization.id}` },
        { name, organization_number: organizationNumber }
      );
    }

    let subscription: { retention_days: number | null } | undefined;
    if (hasRetention) {
      const value = body.retentionDays;
      const retentionDays = value === null || value === "" ? null : Number(value);
      if (retentionDays !== null && (!Number.isInteger(retentionDays) || retentionDays < 0 || retentionDays > 3650)) {
        return NextResponse.json({ error: "Retention ska vara ett heltal mellan 0 och 3650 dagar." }, { status: 400 });
      }
      subscription = await updateUserRowsReturning<{ retention_days: number | null }>(
        "organization_subscriptions",
        { organization_id: `eq.${authorization.context.organization.id}` },
        { retention_days: retentionDays }
      );
    }

    return NextResponse.json({ organization, subscription });
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json({ error: forbidden ? "Inställningsåtkomsten nekades." : "Inställningarna kunde inte sparas." }, { status: forbidden ? 403 : 500 });
    }
    return NextResponse.json({ error: "Inställningarna kunde inte sparas." }, { status: 500 });
  }
}
