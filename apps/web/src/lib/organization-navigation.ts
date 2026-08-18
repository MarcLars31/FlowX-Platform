import type { PermissionKey } from "@/lib/organization-rbac";

export type OrganizationNavigationItem = {
  name: string;
  href: string;
  icon:
    | "home"
    | "products"
    | "projects"
    | "history"
    | "technical_description";
  anyPermissions?: readonly PermissionKey[];
};

export const ORGANIZATION_NAVIGATION: readonly OrganizationNavigationItem[] = [
  {
    name: "Hem",
    href: "/dashboard",
    icon: "home"
  },
  {
    name: "Projekt",
    href: "/projects",
    icon: "projects",
    anyPermissions: [
      "project.view_own",
      "project.view_team",
      "project.view_organization",
      "project.view_all"
    ]
  },
  {
    name: "Projekthistorik",
    href: "/project-history",
    icon: "history",
    anyPermissions: [
      "project.view_own",
      "project.view_team",
      "project.view_organization",
      "project.view_all"
    ]
  }
];

export function filterOrganizationNavigation(
  permissions: readonly PermissionKey[]
) {
  const allowed = new Set(permissions);

  return ORGANIZATION_NAVIGATION.filter(
    (item) =>
      !item.anyPermissions ||
      item.anyPermissions.some((permission) => allowed.has(permission))
  );
}
