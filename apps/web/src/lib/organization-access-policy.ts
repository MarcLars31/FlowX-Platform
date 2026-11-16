import type { PermissionKey } from "@/lib/organization-rbac";

export type OrganizationAccessSnapshot = {
  userId: string | null | undefined;
  organizationId?: string | null;
  membership?: {
    userId: string;
    organizationId: string;
    status: string;
  } | null;
  permissions?: readonly PermissionKey[];
};

export type OrganizationAccessRequirement = {
  anyPermissions?: readonly PermissionKey[];
  /**
   * Optional organization supplied by a URL, query parameter or request body.
   * It is only a constraint; it never selects the active organization.
   */
  requestedOrganizationId?: string | null;
};

/**
 * Pure counterpart to the server API guard. Keeping this policy independent
 * from cookies and Supabase makes the complete tenant matrix regression
 * testable without weakening the real server-side checks.
 */
export function getOrganizationAccessStatus(
  snapshot: OrganizationAccessSnapshot,
  requirement: OrganizationAccessRequirement = {}
): 200 | 401 | 403 {
  if (!snapshot.userId) return 401;

  const organizationId = snapshot.organizationId;
  const membership = snapshot.membership;
  if (
    !organizationId ||
    !membership ||
    membership.status !== "active" ||
    membership.userId !== snapshot.userId ||
    membership.organizationId !== organizationId
  ) {
    return 403;
  }

  const requestedOrganizationId = requirement.requestedOrganizationId?.trim();
  if (
    requestedOrganizationId &&
    requestedOrganizationId !== organizationId
  ) {
    return 403;
  }

  const requiredPermissions = requirement.anyPermissions ?? [];
  if (requiredPermissions.length === 0) return 200;

  const granted = new Set(snapshot.permissions ?? []);
  return requiredPermissions.some((permission) => granted.has(permission))
    ? 200
    : 403;
}

export function organizationAccessSnapshot({
  userId,
  context
}: {
  userId: string | null | undefined;
  context:
    | {
        organization: { id: string };
        membership: {
          user_id: string;
          organization_id: string;
          status: string;
        };
        permissions: readonly PermissionKey[];
      }
    | null
    | undefined;
}): OrganizationAccessSnapshot {
  return {
    userId,
    organizationId: context?.organization.id,
    membership: context
      ? {
          userId: context.membership.user_id,
          organizationId: context.membership.organization_id,
          status: context.membership.status
        }
      : null,
    permissions: context?.permissions
  };
}
