-- Store the preferred manufacturer and distributor as separate project
-- preferences. The legacy projects.supplier column remains the preferred
-- manufacturer for backwards compatibility.

create unique index if not exists project_supplier_options_preferred_uidx
  on public.project_supplier_options (project_id, supplier_kind)
  where selection_role = 'preferred';

create or replace function public.set_project_supplier_preferences(
  requested_project_id uuid,
  requested_manufacturer text default null,
  requested_distributor text default null,
  requested_currency text default null,
  requested_delivery_country text default null,
  requested_warehouse_location text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_project public.projects;
  manufacturer_name text := left(nullif(btrim(requested_manufacturer), ''), 200);
  distributor_name text := left(nullif(btrim(requested_distributor), ''), 200);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select project.*
  into target_project
  from public.projects project
  where project.id = requested_project_id
    and project.deleted_at is null
  for update;

  if target_project.id is null then
    raise exception 'Project not found.';
  end if;

  if not public.can_access_project(target_project.id)
    or not public.has_permission(target_project.organization_id, 'project.settings.update') then
    raise exception 'Project supplier preferences are not permitted.';
  end if;

  delete from public.project_supplier_options option_row
  where option_row.project_id = target_project.id
    and option_row.selection_role = 'preferred'
    and option_row.supplier_kind in ('manufacturer', 'distributor');

  if manufacturer_name is not null then
    insert into public.project_supplier_options (
      organization_id, project_id, supplier_kind, selection_role,
      supplier_name, currency, delivery_country, warehouse_location, created_by
    ) values (
      target_project.organization_id, target_project.id, 'manufacturer', 'preferred',
      manufacturer_name, left(nullif(btrim(requested_currency), ''), 10),
      left(nullif(btrim(requested_delivery_country), ''), 100),
      left(nullif(btrim(requested_warehouse_location), ''), 150), auth.uid()
    );
  end if;

  if distributor_name is not null then
    insert into public.project_supplier_options (
      organization_id, project_id, supplier_kind, selection_role,
      supplier_name, currency, delivery_country, warehouse_location, created_by
    ) values (
      target_project.organization_id, target_project.id, 'distributor', 'preferred',
      distributor_name, left(nullif(btrim(requested_currency), ''), 10),
      left(nullif(btrim(requested_delivery_country), ''), 100),
      left(nullif(btrim(requested_warehouse_location), ''), 150), auth.uid()
    );
  end if;

  update public.projects
  set supplier = manufacturer_name,
      updated_at = now()
  where id = target_project.id;
end;
$$;

revoke all on function public.set_project_supplier_preferences(uuid,text,text,text,text,text)
  from public, anon;
grant execute on function public.set_project_supplier_preferences(uuid,text,text,text,text,text)
  to authenticated, service_role;

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

  perform public.set_project_supplier_preferences(
    created_project_id,
    requested_supplier,
    details ->> 'preferred_distributor',
    requested_currency_code,
    requested_delivery_country,
    details ->> 'warehouse_location'
  );

  return created_project_id;
end;
$$;

revoke all on function public.create_project_with_details(uuid,text,text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,uuid,jsonb)
  from public, anon;
grant execute on function public.create_project_with_details(uuid,text,text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,uuid,jsonb)
  to authenticated, service_role;
