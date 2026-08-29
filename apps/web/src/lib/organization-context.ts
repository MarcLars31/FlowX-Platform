import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/supabase-auth";
import { PERMISSION_KEYS } from "@/lib/organization-rbac";
import { selectUserRows } from "@/lib/supabase-user-rest";
import type {
  Organization,
  OrganizationContext,
  OrganizationMembership,
  OrganizationOption
} from "@/types/organization";
import type { PermissionKey } from "@/lib/organization-rbac";

export const ORGANIZATION_COOKIE = "flowx_organization_id";

type MembershipRow = Omit<OrganizationMembership, "role_slug">;
type RoleRow = {
  id: string;
  slug: string;
  organization_id: string | null;
};
type RolePermissionRow = { permission_id: string };
type PermissionRow = { id: string; key: string };

export async function getOrganizationContext(): Promise<OrganizationContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await selectUserRows<MembershipRow>(
    "organization_members",
    {
      select:
        "id,organization_id,user_id,role_id,status,joined_at,last_active_at",
      user_id: `eq.${user.id}`,
      status: "eq.active",
      order: "created_at.asc"
    }
  );
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const selectedOrganizationId = cookieStore.get(ORGANIZATION_COOKIE)?.value;
  const membership =
    memberships.find(
      (item) => item.organization_id === selectedOrganizationId
    ) ?? memberships[0];

  const [organizations, roles] = await Promise.all([
    selectUserRows<Organization>("organizations", {
      select:
        "id,name,organization_number,status,created_by,created_at,updated_at",
      id: `eq.${membership.organization_id}`,
      limit: "1"
    }),
    selectUserRows<RoleRow>("roles", {
      select: "id,slug,organization_id",
      id: `eq.${membership.role_id}`,
      limit: "1"
    })
  ]);
  const organization = organizations[0];
  const role = roles[0];
  if (!organization || !role) return null;

  const rolePermissions = await selectUserRows<RolePermissionRow>(
    "role_permissions",
    {
      select: "permission_id",
      role_id: `eq.${role.id}`
    }
  );
  const permissionIds = rolePermissions.map((item) => item.permission_id);
  const permissions =
    permissionIds.length === 0
      ? []
      : await selectUserRows<PermissionRow>("permissions", {
          select: "id,key",
          id: `in.(${permissionIds.join(",")})`
        });

  return {
    organization,
    membership: {
      ...membership,
      role_slug: role.slug
    },
    permissions: permissions
      .map((permission) => permission.key)
      .filter((key): key is PermissionKey =>
        isPermissionKey(key)
      )
  };
}

export async function getOrganizationOptions(
  userId: string
): Promise<OrganizationOption[]> {
  const memberships = await selectUserRows<
    Pick<OrganizationMembership, "organization_id">
  >("organization_members", {
    select: "organization_id",
    user_id: `eq.${userId}`,
    status: "eq.active"
  });
  const organizationIds = [
    ...new Set(memberships.map((membership) => membership.organization_id))
  ];

  if (organizationIds.length === 0) return [];

  return selectUserRows<OrganizationOption>("organizations", {
    select: "id,name",
    id: `in.(${organizationIds.join(",")})`,
    status: "eq.active",
    deleted_at: "is.null",
    order: "name.asc"
  });
}

export function organizationHasAnyPermission(
  context: OrganizationContext,
  permissions: readonly PermissionKey[]
) {
  const granted = new Set(context.permissions);
  return permissions.some((permission) => granted.has(permission));
}

function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEYS.includes(value as PermissionKey);
}
