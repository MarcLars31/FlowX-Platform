import "server-only";
import { NextResponse } from "next/server";
import {
  getOrganizationContext,
  organizationHasAnyPermission
} from "@/lib/organization-context";
import { getCurrentUser } from "@/lib/supabase-auth";
import type { PermissionKey } from "@/lib/organization-rbac";

export async function requireOrganizationApi(
  anyPermissions: readonly PermissionKey[] = []
) {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 }
      )
    } as const;
  }

  const context = await getOrganizationContext();
  if (!context) {
    return {
      error: NextResponse.json(
        { error: "No active organization membership was found." },
        { status: 403 }
      )
    } as const;
  }

  if (
    anyPermissions.length > 0 &&
    !organizationHasAnyPermission(context, anyPermissions)
  ) {
    return {
      error: NextResponse.json(
        { error: "You do not have permission for this operation." },
        { status: 403 }
      )
    } as const;
  }

  return { user, context, error: null } as const;
}
