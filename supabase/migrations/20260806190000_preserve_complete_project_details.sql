-- Persist the complete new-project form in the same transaction as the
-- project, default module, settings, membership and audit event.

create or replace function public.create_project_with_details(
  requested_organization_id uuid,
  requested_project_number text,
  requested_name text,
  requested_description text default null,
  requested_customer_name text default null,
  requested_project_type text default null,
  requested_country_code text default null,
  requested_language_code text default 'sv',
  requested_currency_code text default null,
  requested_owner_user_id uuid default null,
  requested_module_code text default 'sprinkler',
  requested_standard text default null,
  requested_system_type text default null,
  requested_supplier text default null,
  requested_delivery_country text default null,
  requested_access_level text default 'own',
  requested_team_id uuid default null,
  requested_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_project_id uuid;
  details jsonb := case
    when jsonb_typeof(coalesce(requested_details, '{}'::jsonb)) = 'object'
      then coalesce(requested_details, '{}'::jsonb)
    else '{}'::jsonb
  end;
begin
  created_project_id := public.create_project_with_defaults(
    requested_organization_id,
    requested_project_number,
    requested_name,
    requested_description,
    requested_customer_name,
    requested_project_type,
    requested_country_code,
    requested_language_code,
    requested_currency_code,
    requested_owner_user_id,
    requested_module_code,
    requested_standard,
    requested_system_type,
    requested_supplier,
    requested_delivery_country,
    requested_access_level,
    requested_team_id
  );

  update public.projects
  set end_customer = left(nullif(btrim(details ->> 'end_customer'), ''), 200),
      address = left(nullif(btrim(details ->> 'address'), ''), 300),
      procurement_strategy = left(nullif(btrim(details ->> 'procurement_strategy'), ''), 100),
      warehouse_location = left(nullif(btrim(details ->> 'warehouse_location'), ''), 150),
      expected_start_date = case
        when (details ->> 'expected_start_date') ~ '^\d{4}-\d{2}-\d{2}$'
          then (details ->> 'expected_start_date')::date
        else null
      end,
      expected_delivery_date = case
        when (details ->> 'expected_delivery_date') ~ '^\d{4}-\d{2}-\d{2}$'
          then (details ->> 'expected_delivery_date')::date
        else null
      end,
      internal_comments = left(nullif(btrim(details ->> 'internal_comments'), ''), 5000),
      technical_parameters = case
        when jsonb_typeof(details -> 'technical_parameters') = 'object'
          then details -> 'technical_parameters'
        else '{}'::jsonb
      end
  where id = created_project_id
    and organization_id = requested_organization_id;

  return created_project_id;
end;
$$;

revoke all on function public.create_project_with_details(uuid,text,text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,uuid,jsonb) from public, anon;
grant execute on function public.create_project_with_details(uuid,text,text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,uuid,jsonb) to authenticated, service_role;

