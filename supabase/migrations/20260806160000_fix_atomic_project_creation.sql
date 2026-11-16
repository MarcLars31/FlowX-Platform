-- Fix project creation after the creator-membership trigger was introduced.
--
-- The projects_add_creator_membership trigger already creates the owner's
-- project_members row. The RPC previously attempted to insert the same row a
-- second time and converted the resulting primary-key violation into an
-- incorrect "project number already exists" error.

create or replace function public.create_project_with_defaults(
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
  requested_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_user_id uuid := auth.uid();
  owner_id uuid := coalesce(requested_owner_user_id, auth.uid());
  created_project_id uuid;
  owner_organization_member_id uuid;
  module_name text;
  unique_constraint_name text;
begin
  if actor_user_id is null then raise exception 'Authentication is required.'; end if;
  if requested_organization_id is null or not public.is_organization_member(requested_organization_id) then
    raise exception 'An active organization membership is required.';
  end if;
  if not public.has_permission(requested_organization_id, 'project.create') then
    raise exception 'Project creation permission is required.';
  end if;
  if length(btrim(coalesce(requested_name, ''))) not between 1 and 200 then
    raise exception 'Project name must contain 1-200 characters.';
  end if;
  if requested_project_number is not null and length(btrim(requested_project_number)) > 100 then
    raise exception 'Project number must contain at most 100 characters.';
  end if;
  if requested_module_code <> 'sprinkler' then
    raise exception 'Unsupported project module.';
  end if;
  if requested_access_level not in ('own','team','organization','restricted') then
    raise exception 'Invalid project access level.';
  end if;
  if requested_access_level = 'team' and requested_team_id is null then
    raise exception 'Team access requires a team.';
  end if;
  if requested_team_id is not null and not exists (
    select 1 from public.teams team
    where team.id = requested_team_id
      and team.organization_id = requested_organization_id
      and team.status = 'active'
  ) then
    raise exception 'The selected team does not belong to the organization.';
  end if;

  select member.id into owner_organization_member_id
  from public.organization_members member
  where member.organization_id = requested_organization_id
    and member.user_id = owner_id
    and member.status = 'active'
  limit 1;
  if owner_organization_member_id is null then raise exception 'The project owner must be an active organization member.'; end if;

  module_name := case requested_module_code when 'sprinkler' then 'Sprinkler' else initcap(requested_module_code) end;

  insert into public.projects (
    organization_id, project_number, name, description, customer_name,
    customer, project_type, country_code, country, language_code,
    currency_code, currency, owner_id, owner_user_id, project_manager_id,
    created_by, assigned_to, status, current_stage, access_level, team_id,
    standard, system_type, supplier, delivery_country, progress
  ) values (
    requested_organization_id, nullif(btrim(requested_project_number), ''), btrim(requested_name),
    nullif(btrim(requested_description), ''), nullif(btrim(requested_customer_name), ''),
    nullif(btrim(requested_customer_name), ''), nullif(btrim(requested_project_type), ''),
    nullif(btrim(requested_country_code), ''), nullif(btrim(requested_country_code), ''),
    coalesce(nullif(btrim(requested_language_code), ''), 'sv'),
    nullif(upper(btrim(requested_currency_code)), ''), nullif(upper(btrim(requested_currency_code)), ''),
    owner_id, owner_id, owner_id, actor_user_id, owner_id, 'draft', 'setup', requested_access_level,
    requested_team_id, nullif(btrim(requested_standard), ''), nullif(btrim(requested_system_type), ''),
    nullif(btrim(requested_supplier), ''), nullif(btrim(requested_delivery_country), ''), 0
  ) returning id into created_project_id;

  insert into public.project_settings (organization_id, project_id, country_code, language_code, currency_code)
  values (requested_organization_id, created_project_id, nullif(btrim(requested_country_code), ''), coalesce(nullif(btrim(requested_language_code), ''), 'sv'), nullif(upper(btrim(requested_currency_code)), ''));
  insert into public.project_modules (organization_id, project_id, module_code, name)
  values (requested_organization_id, created_project_id, requested_module_code, module_name);

  -- projects_add_creator_membership has already created this row. Enrich it
  -- instead of inserting a duplicate primary key.
  update public.project_members project_member
  set role = 'project_manager',
      project_role = 'owner',
      status = 'active',
      added_by = actor_user_id
  where project_member.project_id = created_project_id
    and project_member.organization_member_id = owner_organization_member_id;
  if not found then
    raise exception 'The project owner membership could not be created.';
  end if;

  perform public.write_audit_log(
    requested_organization_id, 'project_created', 'project', created_project_id,
    null, jsonb_build_object('project_number', requested_project_number, 'module_code', requested_module_code)
  );
  return created_project_id;
exception
  when unique_violation then
    get stacked diagnostics unique_constraint_name = constraint_name;
    if unique_constraint_name = 'projects_organization_project_number_uidx' then
      raise exception 'Project number already exists in this organization.' using errcode = '23505';
    end if;
    raise;
end;
$$;

revoke all on function public.create_project_with_defaults(uuid,text,text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.create_project_with_defaults(uuid,text,text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,uuid) to authenticated, service_role;
