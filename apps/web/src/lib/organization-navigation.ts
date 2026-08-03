import type { PermissionKey } from "@/lib/organization-rbac";

export type OrganizationNavigationItem = {
  name: string;
  href: string;
  icon:
    | "home"
    | "products"
    | "projects"
    | "organization"
    | "trash"
    | "activity"
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
    name: "Produktdatabas",
    href: "/products",
    icon: "products",
    anyPermissions: ["product.search", "product.view"]
  },
  {
    name: "Tekniska beskrivningar",
    href: "/technical-descriptions",
    icon: "technical_description",
    anyPermissions: [
      "technical_description.view",
      "technical_description.create"
    ]
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
    name: "Organisation",
    href: "/organization",
    icon: "organization",
    anyPermissions: [
      "organization.update",
      "member.view",
      "team.view",
      "subscription.view"
    ]
  },
  {
    name: "Papperskorg",
    href: "/organization/trash",
    icon: "trash",
    anyPermissions: ["project.restore", "project.permanent_delete"]
  },
  {
    name: "Aktivitetslogg",
    href: "/organization/activity",
    icon: "activity",
    anyPermissions: ["audit_log.view"]
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
