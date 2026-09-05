import type {
  PermissionKey,
  ProjectAccessLevel
} from "@/lib/organization-rbac";

export type OrganizationStatus =
  | "pending"
  | "pending_verification"
  | "active"
  | "suspended"
  | "disabled"
  | "rejected";

export type OrganizationMemberStatus =
  | "invited"
  | "active"
  | "suspended"
  | "disabled";

export type Organization = {
  id: string;
  name: string;
  organization_number?: string | null;
  country_code?: string | null;
  website?: string | null;
  email_domain?: string | null;
  status: OrganizationStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
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

export type OrganizationJoinRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type OrganizationJoinRequest = {
  id: string;
  organization_id: string;
  user_id: string;
  message?: string | null;
  status: OrganizationJoinRequestStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationContext = {
  organization: Organization;
  membership: OrganizationMembership;
  permissions: PermissionKey[];
};

export type OrganizationOption = Pick<Organization, "id" | "name">;

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
  project_number?: string | null;
  description?: string | null;
  customer_name?: string | null;
  end_customer?: string | null;
  address?: string | null;
  project_type?: string | null;
  procurement_strategy?: string | null;
  currency?: string | null;
  delivery_country?: string | null;
  warehouse_location?: string | null;
  standard?: string | null;
  system_type?: string | null;
  supplier?: string | null;
  project_manager_id?: string | null;
  estimator_id?: string | null;
  expected_start_date?: string | null;
  expected_delivery_date?: string | null;
  internal_comments?: string | null;
  technical_parameters?: Record<string, unknown>;
  demo_data_set_id?: string | null;
  status: string;
  current_stage?:
    | "setup"
    | "documents"
    | "technical_description"
    | "requirements_review"
    | "analysis"
    | "product_matching"
    | "material_list"
    | "approval"
    | "completed"
    | string;
  access_level: ProjectAccessLevel;
  created_by?: string | null;
  assigned_to?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deletion_reason?: string | null;
};
