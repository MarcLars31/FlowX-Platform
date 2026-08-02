export const PLATFORM_ADMIN_ROLES = ["admin", "platform_admin"] as const;

export type PlatformRole = (typeof PLATFORM_ADMIN_ROLES)[number] | "customer";

type UserWithRoleMetadata = {
  app_metadata?: {
    role?: unknown;
  };
};

export function getPlatformRole(user: UserWithRoleMetadata | null | undefined) {
  const role = user?.app_metadata?.role;

  if (
    role === "admin" ||
    role === "platform_admin" ||
    role === "customer"
  ) {
    return role satisfies PlatformRole;
  }

  return null;
}

export function isPlatformAdmin(
  user: UserWithRoleMetadata | null | undefined
) {
  const role = getPlatformRole(user);

  return role === "admin" || role === "platform_admin";
}

export function getPostLoginDestination(
  user: UserWithRoleMetadata | null | undefined
) {
  return isPlatformAdmin(user) ? "/admin" : "/dashboard";
}

export function getPlatformAdminAccessStatus(
  user: UserWithRoleMetadata | null | undefined
): 200 | 401 | 403 {
  if (!user) return 401;

  return isPlatformAdmin(user) ? 200 : 403;
}
