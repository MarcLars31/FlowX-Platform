-- Project updates are still protected by projects_update_authorized and
-- can_manage_project(). This grant only exposes columns already accepted by
-- the authenticated project API; it does not bypass organization or project RLS.
grant update (
  team_id,
  name,
  description,
  customer,
  customer_name,
  project_number,
  end_customer,
  address,
  country,
  standard,
  system_type,
  supplier,
  status,
  progress,
  current_stage,
  access_level,
  assigned_to,
  project_manager_id,
  estimator_id,
  project_type,
  procurement_strategy,
  currency,
  delivery_country,
  warehouse_location,
  expected_start_date,
  expected_delivery_date,
  internal_comments,
  technical_parameters
) on public.projects to authenticated;
