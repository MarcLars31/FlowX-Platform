import "server-only";
import { NextResponse } from "next/server";
import { getOrganizationContext } from "@/lib/organization-context";
import { getCurrentUser } from "@/lib/supabase-auth";
import type { PermissionKey } from "@/lib/organization-rbac";
import {
  getOrganizationAccessStatus,
  organizationAccessSnapshot,
  type OrganizationAccessRequirement
} from "@/lib/organization-access-policy";

type OrganizationApiRequirement =
  | readonly PermissionKey[]
  | OrganizationAccessRequirement;

export async function requireOrganizationApi(
  requirement: OrganizationApiRequirement = []
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

  const normalizedRequirement = normalizeRequirement(requirement);
  const accessStatus = getOrganizationAccessStatus(
    organizationAccessSnapshot({ userId: user.id, context }),
    normalizedRequirement
  );
  if (accessStatus !== 200) {
    return {
      error: NextResponse.json(
        {
          error:
            normalizedRequirement.requestedOrganizationId &&
            normalizedRequirement.requestedOrganizationId !==
              context.organization.id
              ? "The requested organization is not available to this user."
              : "You do not have permission for this operation."
        },
        { status: 403 }
      )
    } as const;
  }

  return { user, context, error: null } as const;
}

function normalizeRequirement(
  requirement: OrganizationApiRequirement
): OrganizationAccessRequirement {
  if (Array.isArray(requirement)) {
    return { anyPermissions: requirement as readonly PermissionKey[] };
  }

  return requirement as OrganizationAccessRequirement;
}
