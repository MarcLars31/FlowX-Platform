import type {
  PermissionKey,
  ProjectAccessLevel
} from "@/lib/organization-rbac";

export type OrganizationStatus =
  | "pending"
  | "active"
  | "suspended"
  | "disabled";

export type OrganizationMemberStatus =
  | "invited"
  | "active"
  | "suspended"
  | "disabled";

export type Organization = {
  id: string;
  name: string;
  organization_number?: string | null;
  status: OrganizationStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationMembership = {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string;
  role_slug: string;
  status: OrganizationMemberStatus;
  joined_at?: string | null;
};

export type OrganizationContext = {
  organization: Organization;
  membership: OrganizationMembership;
  permissions: PermissionKey[];
};

export type Team = {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  status: "active" | "inactive";
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationProject = {
  id: string;
  organization_id: string;
  team_id?: string | null;
  name: string;
  description?: string | null;
  customer_name?: string | null;
  status: string;
  access_level: ProjectAccessLevel;
  created_by?: string | null;
  assigned_to?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deletion_reason?: string | null;
};
