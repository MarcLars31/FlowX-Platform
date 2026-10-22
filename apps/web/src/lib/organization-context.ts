import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser, type FlowXUser } from "@/lib/supabase-auth";
import { PERMISSION_KEYS } from "@/lib/organization-rbac";
import { callUserRpc, selectUserRows } from "@/lib/supabase-user-rest";
import type {
  OrganizationContext,
  OrganizationMembership,
  OrganizationOption
} from "@/types/organization";
import type { PermissionKey } from "@/lib/organization-rbac";

export const ORGANIZATION_COOKIE = "flowx_organization_id";

export async function getOrganizationContext(currentUser?: FlowXUser): Promise<OrganizationContext | null> {
  const user = currentUser ?? await getCurrentUser();
  if (!user) return null;
  const selected = (await cookies()).get(ORGANIZATION_COOKIE)?.value;
  const requested = selected && /^[a-f0-9-]{36}$/i.test(selected) ? selected : null;
  const context = await callUserRpc<OrganizationContext | null>("current_organization_context", { requested_organization_id: requested });
  if (!context) return null;
  return { ...context, permissions: context.permissions.filter(isPermissionKey) };
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
