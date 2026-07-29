export const ORGANIZATION_ROLE_SLUGS = [
  "organization_owner",
  "organization_admin",
  "full_user",
  "mini_user",
  "read_only"
] as const;

export type OrganizationRoleSlug = (typeof ORGANIZATION_ROLE_SLUGS)[number];

export const PERMISSION_KEYS = [
  "organization.view",
  "organization.update",
  "organization.manage_billing",
  "organization.transfer_ownership",
  "member.view",
  "member.invite",
  "member.disable",
  "member.change_role",
  "team.view",
  "team.create",
  "team.update",
  "team.delete",
  "team.manage_members",
  "project.view_own",
  "project.view_team",
  "project.view_organization",
  "project.view_all",
  "project.create",
  "project.update",
  "project.delete",
  "project.restore",
  "project.permanent_delete",
  "project.manage_members",
  "document.view",
  "document.upload",
  "document.delete",
  "analysis.view",
  "analysis.create",
  "analysis.update",
  "material_list.view",
  "material_list.create",
  "material_list.update",
  "material_list.export",
  "product.search",
  "product.view",
  "product.manage",
  "news.view",
  "news.manage",
  "audit_log.view",
  "subscription.view",
  "subscription.manage"
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const organizationAdminPermissions: PermissionKey[] = [
  "organization.view",
  "organization.update",
  "member.view",
  "member.invite",
  "member.disable",
  "member.change_role",
  "team.view",
  "team.create",
  "team.update",
  "team.delete",
  "team.manage_members",
  "project.view_all",
  "project.create",
  "project.update",
  "project.delete",
  "project.restore",
  "project.manage_members",
  "document.view",
  "document.upload",
  "document.delete",
  "analysis.view",
  "analysis.create",
  "analysis.update",
  "material_list.view",
  "material_list.create",
  "material_list.update",
  "material_list.export",
  "product.search",
  "product.view",
  "product.manage",
  "news.view",
  "audit_log.view",
  "subscription.view"
];

const fullUserPermissions: PermissionKey[] = [
  "organization.view",
  "project.view_own",
  "project.view_team",
  "project.view_organization",
  "project.create",
  "project.update",
  "project.delete",
  "document.view",
  "document.upload",
  "document.delete",
  "analysis.view",
  "analysis.create",
  "analysis.update",
  "material_list.view",
  "material_list.create",
  "material_list.update",
  "material_list.export",
  "product.search",
  "product.view",
  "news.view"
];

const miniUserPermissions: PermissionKey[] = [
  "product.search",
  "product.view",
  "news.view"
];

const readOnlyPermissions: PermissionKey[] = [
  "organization.view",
  "project.view_own",
  "document.view",
  "analysis.view",
  "material_list.view",
  "product.search",
  "product.view",
  "news.view"
];

export const ROLE_PERMISSION_KEYS: Record<
  OrganizationRoleSlug,
  readonly PermissionKey[]
> = {
  organization_owner: PERMISSION_KEYS,
  organization_admin: organizationAdminPermissions,
  full_user: fullUserPermissions,
  mini_user: miniUserPermissions,
  read_only: readOnlyPermissions
};

export type ProjectAccessLevel =
  | "own"
  | "team"
  | "organization"
  | "restricted";

export function hasRolePermission(
  role: OrganizationRoleSlug,
  permission: PermissionKey
) {
  return ROLE_PERMISSION_KEYS[role].includes(permission);
}

export function isOrganizationRoleSlug(
  value: string
): value is OrganizationRoleSlug {
  return ORGANIZATION_ROLE_SLUGS.includes(value as OrganizationRoleSlug);
}

export function canAssignOrganizationRole({
  actorRole,
  actorUserId,
  targetUserId,
  targetCurrentRole,
  requestedRole,
  activeOwnerCount
}: {
  actorRole: OrganizationRoleSlug;
  actorUserId: string;
  targetUserId: string;
  targetCurrentRole: OrganizationRoleSlug;
  requestedRole: string;
  activeOwnerCount: number;
}) {
  if (!isOrganizationRoleSlug(requestedRole)) return false;
  if (actorUserId === targetUserId) return false;

  if (
    targetCurrentRole === "organization_owner" &&
    requestedRole !== "organization_owner" &&
    activeOwnerCount <= 1
  ) {
    return false;
  }

  if (actorRole === "organization_owner") return true;

  if (actorRole === "organization_admin") {
    if (
      targetCurrentRole === "organization_owner" ||
      requestedRole === "organization_owner" ||
      requestedRole === "organization_admin"
    ) {
      return false;
    }

    return ["full_user", "mini_user", "read_only"].includes(requestedRole);
  }

  return false;
}

export function canAccessProjectForRole({
  role,
  sameOrganization,
  accessLevel,
  isCreator,
  isAssigned,
  isExplicitMember,
  isTeamMember,
  isDeleted = false
}: {
  role: OrganizationRoleSlug;
  sameOrganization: boolean;
  accessLevel: ProjectAccessLevel;
  isCreator: boolean;
  isAssigned: boolean;
  isExplicitMember: boolean;
  isTeamMember: boolean;
  isDeleted?: boolean;
}) {
  if (!sameOrganization || isDeleted) return false;
  if (role === "organization_owner" || role === "organization_admin") {
    return true;
  }

  if (hasRolePermission(role, "project.view_all")) return true;

  if (
    isExplicitMember &&
    hasRolePermission(role, "project.view_own")
  ) {
    return true;
  }

  if (accessLevel === "organization") {
    return hasRolePermission(role, "project.view_organization");
  }

  if (accessLevel === "team") {
    return isTeamMember && hasRolePermission(role, "project.view_team");
  }

  if (accessLevel === "restricted") {
    return (
      isExplicitMember && hasRolePermission(role, "project.view_own")
    );
  }

  return (
    (isCreator || isAssigned || isExplicitMember) &&
    hasRolePermission(role, "project.view_own")
  );
}

export function canViewDeletedProject(
  role: OrganizationRoleSlug,
  sameOrganization: boolean
) {
  return (
    sameOrganization &&
    hasRolePermission(role, "project.restore")
  );
}
