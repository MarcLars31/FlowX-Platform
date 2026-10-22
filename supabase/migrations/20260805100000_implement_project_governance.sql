-- Project governance: project-first workflow, atomic project creation and
-- version-aware technical descriptions. This migration extends the existing
-- organization/member model; it deliberately does not introduce a second
-- identity or tenant model.

-- ---------------------------------------------------------------------------
-- Project lifecycle fields and invariants
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists project_number text,
  add column if not exists current_stage text not null default 'setup',
  add column if not exists country_code text,
  add column if not exists language_code text not null default 'sv',
  add column if not exists currency_code char(3),
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at timestamptz;

update public.projects
set owner_user_id = coalesce(owner_user_id, owner_id, created_by),
    current_stage = coalesce(nullif(current_stage, ''), 'setup'),
    language_code = coalesce(nullif(language_code, ''), 'sv'),
    country_code = coalesce(country_code, country),
    currency_code = coalesce(currency_code, currency);

create unique index if not exists projects_organization_project_number_uidx
  on public.projects (organization_id, project_number)
  where project_number is not null and btrim(project_number) <> '';

create index if not exists projects_organization_stage_idx
  on public.projects (organization_id, current_stage, updated_at desc)
  where deleted_at is null;

alter table public.projects drop constraint if exists projects_current_stage_check;
alter table public.projects add constraint projects_current_stage_check
  check (current_stage in (
    'setup','documents','technical_description','requirements_review',
    'analysis','product_matching','material_list','approval','completed'
  )) not valid;
alter table public.projects validate constraint projects_current_stage_check;

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in (
    'draft','active','on_hold','completed','archived','deleted',
    'analysis','awaiting_input','proposal_ready','in_review','approved',
    'quoted','ordered','delivered'
  )) not valid;
alter table public.projects validate constraint projects_status_check;

-- ---------------------------------------------------------------------------
-- Project members: expose the requested user/role shape while preserving the
-- existing organization_member_id foreign key used by current RLS functions.
-- ---------------------------------------------------------------------------

alter table public.project_members
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists organization_id uuid,
  add column if not exists user_id uuid,
  add column if not exists role text,
  add column if not exists status text not null default 'active',
  add column if not exists added_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.project_members as member
set organization_id = project.organization_id,
    user_id = organization_member.user_id,
    role = case member.project_role
      when 'owner' then 'project_manager'
      when 'editor' then 'editor'
      else 'viewer'
    end,
    id = coalesce(member.id, gen_random_uuid())
from public.projects as project,
     public.organization_members as organization_member
where project.id = member.project_id
  and organization_member.id = member.organization_member_id;

alter table public.project_members alter column id set not null;
alter table public.project_members alter column organization_id set not null;
alter table public.project_members alter column user_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_members_organization_fk') then
    alter table public.project_members
      add constraint project_members_organization_fk
      foreign key (organization_id) references public.organizations(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_members_user_fk') then
    alter table public.project_members
      add constraint project_members_user_fk
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_members_role_check') then
    alter table public.project_members
      add constraint project_members_role_check
      check (role in ('project_manager','editor','reviewer','viewer')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_members_status_check') then
    alter table public.project_members
      add constraint project_members_status_check
      check (status in ('active','inactive','removed')) not valid;
  end if;
end $$;

alter table public.project_members validate constraint project_members_role_check;
alter table public.project_members validate constraint project_members_status_check;

create unique index if not exists project_members_project_user_uidx
  on public.project_members (project_id, user_id);
create index if not exists project_members_organization_user_idx
  on public.project_members (organization_id, user_id, status);

-- Keep the legacy role column and the new role column consistent for current
-- policies/components. New code should use role/user_id.
create or replace function public.sync_project_member_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  member_org uuid;
  member_user uuid;
begin
  select organization_id, user_id
    into member_org, member_user
  from public.organization_members
  where id = new.organization_member_id
    and status = 'active';

  if member_org is null then
    raise exception 'An active organization member is required.';
  end if;

  if new.organization_id is null then new.organization_id := member_org; end if;
  if new.user_id is null then new.user_id := member_user; end if;
  if new.organization_id <> member_org or new.user_id <> member_user then
    raise exception 'Project member and organization member must belong to the same user and organization.';
  end if;

  if new.role is null then
    new.role := case new.project_role when 'owner' then 'project_manager' when 'editor' then 'editor' else 'viewer' end;
  end if;
  new.project_role := case new.role when 'project_manager' then 'owner' when 'editor' then 'editor' else 'viewer' end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists project_members_sync_identity on public.project_members;
create trigger project_members_sync_identity
before insert or update on public.project_members
for each row execute function public.sync_project_member_identity();

-- ---------------------------------------------------------------------------
-- Project settings and extensible modules
-- ---------------------------------------------------------------------------

create table if not exists public.project_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  technical_standards text[] not null default '{}'::text[],
  country_code text,
  language_code text not null default 'sv',
  currency_code char(3),
  unit_system text not null default 'metric' check (unit_system in ('metric','imperial')),
  preferred_manufacturers text[] not null default '{}'::text[],
  allowed_suppliers text[] not null default '{}'::text[],
  analysis_settings jsonb not null default '{}'::jsonb,
  matching_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  module_code text not null check (module_code ~ '^[a-z][a-z0-9_-]{1,49}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  status text not null default 'active' check (status in ('active','inactive','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, module_code),
  unique (id, project_id)
);

create index if not exists project_modules_organization_idx
  on public.project_modules (organization_id, project_id, status);
create unique index if not exists project_settings_project_uidx
  on public.project_settings (project_id);

insert into public.project_modules (organization_id, project_id, module_code, name)
select project.organization_id, project.id, 'sprinkler', 'Sprinkler'
from public.projects project
on conflict (project_id, module_code) do nothing;

insert into public.project_settings (organization_id, project_id, country_code, language_code, currency_code)
select project.organization_id, project.id, project.country_code, coalesce(project.language_code, 'sv'), project.currency_code
from public.projects project
on conflict (project_id) do nothing;

-- ---------------------------------------------------------------------------
-- Technical-description versioning and legacy document linkage
-- ---------------------------------------------------------------------------

alter table public.technical_description_documents
  add column if not exists project_module_id uuid references public.project_modules(id) on delete restrict;

update public.technical_description_documents document
set project_module_id = module.id
from public.project_modules module
where document.project_module_id is null
  and document.project_id = module.project_id
  and module.module_code = 'sprinkler';

create table if not exists public.technical_descriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_module_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  status text not null default 'draft' check (status in ('draft','generated','under_review','approved','superseded','archived')),
  current_version_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, project_id)
);

alter table public.technical_descriptions
  add constraint technical_descriptions_module_fk
  foreign key (project_module_id, project_id)
  references public.project_modules(id, project_id) on delete restrict;

create table if not exists public.technical_description_versions (
  id uuid primary key default gen_random_uuid(),
  technical_description_id uuid not null references public.technical_descriptions(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content text not null,
  content_format text not null default 'markdown' check (content_format in ('plain_text','markdown','html','json')),
  source_type text not null check (source_type in ('uploaded','manual','ai_generated','imported')),
  change_summary text,
  ai_model text,
  prompt_version text,
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (technical_description_id, version_number)
);

alter table public.technical_descriptions
  add constraint technical_descriptions_current_version_fk
  foreign key (current_version_id) references public.technical_description_versions(id) on delete set null;

create index if not exists technical_descriptions_project_idx
  on public.technical_descriptions (project_id, status, updated_at desc);
create index if not exists technical_description_versions_description_idx
  on public.technical_description_versions (technical_description_id, version_number desc);

-- Require project/module linkage for all newly written legacy extraction rows.
create or replace function public.require_project_technical_description()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.project_id is null or new.project_module_id is null then
    raise exception 'A technical description must belong to a project and project module.';
  end if;
  if not exists (
    select 1 from public.project_modules module
    where module.id = new.project_module_id
      and module.project_id = new.project_id
      and module.organization_id = new.organization_id
      and module.status <> 'archived'
  ) then
    raise exception 'The technical description module does not belong to the project.';
  end if;
  return new;
end;
$$;

drop trigger if exists technical_description_documents_require_project
  on public.technical_description_documents;
create trigger technical_description_documents_require_project
before insert or update on public.technical_description_documents
for each row execute function public.require_project_technical_description();

create or replace function public.prevent_approved_description_overwrite()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.approved_at is not null and (
    new.content is distinct from old.content or
    new.version_number is distinct from old.version_number or
    new.source_type is distinct from old.source_type
  ) then
    raise exception 'Approved technical-description versions are immutable; create a new version.';
  end if;
  return new;
end;
$$;

drop trigger if exists technical_description_versions_immutable
  on public.technical_description_versions;
create trigger technical_description_versions_immutable
before update on public.technical_description_versions
for each row execute function public.prevent_approved_description_overwrite();

-- ---------------------------------------------------------------------------
-- Version dependencies and stale-result propagation
-- ---------------------------------------------------------------------------

alter table public.requirement_sets
  add column if not exists technical_description_version_id uuid references public.technical_description_versions(id) on delete set null,
  add column if not exists is_stale boolean not null default false,
  add column if not exists stale_reason text;
alter table public.analyses
  add column if not exists technical_description_version_id uuid references public.technical_description_versions(id) on delete set null,
  add column if not exists is_stale boolean not null default false,
  add column if not exists requires_review boolean not null default false;
alter table public.match_runs
  add column if not exists technical_description_version_id uuid references public.technical_description_versions(id) on delete set null,
  add column if not exists is_stale boolean not null default false,
  add column if not exists requires_review boolean not null default false;
alter table public.material_lists
  add column if not exists technical_description_version_id uuid references public.technical_description_versions(id) on delete set null,
  add column if not exists is_stale boolean not null default false,
  add column if not exists requires_review boolean not null default false;
alter table public.material_list_versions
  add column if not exists technical_description_version_id uuid references public.technical_description_versions(id) on delete set null,
  add column if not exists is_stale boolean not null default false,
  add column if not exists requires_review boolean not null default false;

create or replace function public.mark_project_results_stale(
  description_version_id uuid,
  description_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.requirement_sets
  set is_stale = true, stale_reason = 'Technical description version changed', updated_at = now()
  where project_id = description_project_id
    and technical_description_version_id is distinct from description_version_id;
  update public.analyses
  set is_stale = true, requires_review = true, updated_at = now()
  where project_id = description_project_id
    and technical_description_version_id is distinct from description_version_id;
  update public.match_runs
  set is_stale = true, requires_review = true, updated_at = now()
  where project_id = description_project_id
    and technical_description_version_id is distinct from description_version_id;
  update public.material_lists
  set is_stale = true, requires_review = true, updated_at = now()
  where project_id = description_project_id
    and technical_description_version_id is distinct from description_version_id;
  update public.material_list_versions version
  set is_stale = true, requires_review = true, updated_at = now()
  from public.material_lists list
  where list.id = version.material_list_id
    and list.project_id = description_project_id
    and version.technical_description_version_id is distinct from description_version_id;
end;
$$;

create or replace function public.technical_description_version_stale_results()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare description_project_id uuid;
begin
  select project_id into description_project_id
  from public.technical_descriptions
  where id = new.technical_description_id;
  perform public.mark_project_results_stale(new.id, description_project_id);
  return new;
end;
$$;

drop trigger if exists technical_description_versions_stale_results
  on public.technical_description_versions;
create trigger technical_description_versions_stale_results
after insert on public.technical_description_versions
for each row execute function public.technical_description_version_stale_results();

-- ---------------------------------------------------------------------------
-- Server-side workflow gates
-- ---------------------------------------------------------------------------

create or replace function public.enforce_project_workflow_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  has_document boolean;
  has_confirmed_requirements boolean;
  has_completed_match boolean;
  has_approved_material_list boolean;
begin
  if tg_table_name = 'analyses' then
    select exists (select 1 from public.project_documents where project_id = new.project_id and status = 'active' and upload_status = 'uploaded') into has_document;
    if not has_document then raise exception 'Analysis requires an uploaded project document.'; end if;
  elsif tg_table_name = 'match_runs' then
    select exists (select 1 from public.requirement_sets where project_id = new.project_id and status = 'confirmed' and not is_stale) into has_confirmed_requirements;
    if not has_confirmed_requirements then raise exception 'Product matching requires a confirmed, current requirement set.'; end if;
  elsif tg_table_name = 'material_lists' then
    select exists (select 1 from public.match_runs where project_id = new.project_id and status = 'completed' and not is_stale) into has_completed_match;
    if not has_completed_match then raise exception 'A material list requires a completed, current product-matching run.'; end if;
  elsif tg_table_name = 'exports' then
    select exists (select 1 from public.material_lists where id = new.material_list_id and status = 'approved' and not is_stale) into has_approved_material_list;
    if not has_approved_material_list then raise exception 'Export requires an approved, current material list.'; end if;
  elsif tg_table_name = 'projects' and new.status = 'completed' then
    select exists (select 1 from public.project_documents where project_id = new.id and status = 'active') into has_document;
    select exists (select 1 from public.requirement_sets where project_id = new.id and status = 'confirmed' and not is_stale) into has_confirmed_requirements;
    select exists (select 1 from public.match_runs where project_id = new.id and status = 'completed' and not is_stale) into has_completed_match;
    select exists (select 1 from public.material_lists where project_id = new.id and status = 'approved' and not is_stale) into has_approved_material_list;
    if not has_document or not has_confirmed_requirements or not has_completed_match or not has_approved_material_list then
      raise exception 'Project cannot be completed until documents, confirmed requirements, matching and an approved material list are current.';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
    new.current_stage := 'completed';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_workflow_gate on public.projects;
create trigger projects_workflow_gate
before insert or update on public.projects
for each row execute function public.enforce_project_workflow_gate();
drop trigger if exists analyses_workflow_gate on public.analyses;
create trigger analyses_workflow_gate
before insert or update on public.analyses
for each row execute function public.enforce_project_workflow_gate();
drop trigger if exists match_runs_workflow_gate on public.match_runs;
create trigger match_runs_workflow_gate
before insert or update on public.match_runs
for each row execute function public.enforce_project_workflow_gate();
drop trigger if exists material_lists_workflow_gate on public.material_lists;
create trigger material_lists_workflow_gate
before insert or update on public.material_lists
for each row execute function public.enforce_project_workflow_gate();
drop trigger if exists exports_workflow_gate on public.exports;
create trigger exports_workflow_gate
before insert or update on public.exports
for each row execute function public.enforce_project_workflow_gate();

-- ---------------------------------------------------------------------------
-- Atomic project creation RPC. organization_id is checked against the
-- authenticated user's active membership; it is never trusted by itself.
-- ---------------------------------------------------------------------------

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
  project_id uuid;
  organization_member_id uuid;
  module_name text;
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

  select member.id into organization_member_id
  from public.organization_members member
  where member.organization_id = requested_organization_id
    and member.user_id = owner_id
    and member.status = 'active'
  limit 1;
  if organization_member_id is null then raise exception 'The project owner must be an active organization member.'; end if;

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
  ) returning id into project_id;

  insert into public.project_settings (organization_id, project_id, country_code, language_code, currency_code)
  values (requested_organization_id, project_id, nullif(btrim(requested_country_code), ''), coalesce(nullif(btrim(requested_language_code), ''), 'sv'), nullif(upper(btrim(requested_currency_code)), ''));
  insert into public.project_modules (organization_id, project_id, module_code, name)
  values (requested_organization_id, project_id, requested_module_code, module_name);
  insert into public.project_members (
    id, organization_id, project_id, organization_member_id, user_id, role, project_role,
    status, added_by
  ) values (
    gen_random_uuid(), requested_organization_id, project_id, organization_member_id, owner_id,
    'project_manager', 'owner', 'active', actor_user_id
  );
  perform public.write_audit_log(
    requested_organization_id, 'project_created', 'project', project_id,
    null, jsonb_build_object('project_number', requested_project_number, 'module_code', requested_module_code)
  );
  return project_id;
exception
  when unique_violation then
    raise exception 'Project number already exists in this organization.' using errcode = '23505';
end;
$$;

revoke all on function public.create_project_with_defaults(uuid,text,text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.create_project_with_defaults(uuid,text,text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS for the newly governed tables and project-linked technical documents
-- ---------------------------------------------------------------------------

alter table public.project_settings enable row level security;
alter table public.project_modules enable row level security;
alter table public.technical_descriptions enable row level security;
alter table public.technical_description_versions enable row level security;

drop policy if exists project_settings_select on public.project_settings;
create policy project_settings_select on public.project_settings for select to authenticated
using (public.can_access_project(project_id));
drop policy if exists project_settings_write on public.project_settings;
create policy project_settings_write on public.project_settings for all to authenticated
using (public.can_manage_project(project_id, 'project.settings.update'))
with check (public.can_manage_project(project_id, 'project.settings.update'));

drop policy if exists project_modules_select on public.project_modules;
create policy project_modules_select on public.project_modules for select to authenticated
using (public.can_access_project(project_id));
drop policy if exists project_modules_write on public.project_modules;
create policy project_modules_write on public.project_modules for all to authenticated
using (public.can_manage_project(project_id, 'project.update'))
with check (public.can_manage_project(project_id, 'project.update'));

drop policy if exists technical_descriptions_select on public.technical_descriptions;
create policy technical_descriptions_select on public.technical_descriptions for select to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'technical_description.view'));
drop policy if exists technical_descriptions_insert on public.technical_descriptions;
create policy technical_descriptions_insert on public.technical_descriptions for insert to authenticated
with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'technical_description.create') and created_by = auth.uid());
drop policy if exists technical_descriptions_update on public.technical_descriptions;
create policy technical_descriptions_update on public.technical_descriptions for update to authenticated
using (public.can_manage_project(project_id, 'technical_description.update'))
with check (public.can_manage_project(project_id, 'technical_description.update'));

drop policy if exists technical_description_versions_select on public.technical_description_versions;
create policy technical_description_versions_select on public.technical_description_versions for select to authenticated
using (exists (select 1 from public.technical_descriptions description where description.id = technical_description_id and public.can_access_project(description.project_id) and public.has_permission(description.organization_id, 'technical_description.view')));
drop policy if exists technical_description_versions_insert on public.technical_description_versions;
create policy technical_description_versions_insert on public.technical_description_versions for insert to authenticated
with check (created_by = auth.uid() and exists (select 1 from public.technical_descriptions description where description.id = technical_description_id and public.can_manage_project(description.project_id, 'technical_description.update')));
drop policy if exists technical_description_versions_update on public.technical_description_versions;
create policy technical_description_versions_update on public.technical_description_versions for update to authenticated
using (exists (select 1 from public.technical_descriptions description where description.id = technical_description_id and public.can_manage_project(description.project_id, 'technical_description.update')))
with check (exists (select 1 from public.technical_descriptions description where description.id = technical_description_id and public.can_manage_project(description.project_id, 'technical_description.update')));

drop policy if exists technical_description_documents_select on public.technical_description_documents;
create policy technical_description_documents_select on public.technical_description_documents for select to authenticated
using (project_id is not null and public.can_access_project(project_id) and public.has_permission(organization_id, 'technical_description.view'));
drop policy if exists technical_description_documents_insert on public.technical_description_documents;
create policy technical_description_documents_insert on public.technical_description_documents for insert to authenticated
with check (project_id is not null and public.can_access_project(project_id) and created_by = auth.uid() and public.has_permission(organization_id, 'technical_description.create'));
drop policy if exists technical_description_documents_update on public.technical_description_documents;
create policy technical_description_documents_update on public.technical_description_documents for update to authenticated
using (project_id is not null and public.can_manage_project(project_id, 'technical_description.update'))
with check (project_id is not null and public.can_manage_project(project_id, 'technical_description.update'));

drop policy if exists technical_description_lines_select on public.technical_description_material_lines;
create policy technical_description_lines_select on public.technical_description_material_lines for select to authenticated
using (exists (select 1 from public.technical_description_documents document where document.id = document_id and document.project_id is not null and public.can_access_project(document.project_id) and public.has_permission(document.organization_id, 'technical_description.view')));
drop policy if exists technical_description_lines_insert on public.technical_description_material_lines;
create policy technical_description_lines_insert on public.technical_description_material_lines for insert to authenticated
with check (created_by = auth.uid() and exists (select 1 from public.technical_description_documents document where document.id = document_id and document.project_id is not null and public.can_manage_project(document.project_id, 'technical_description.create')));
drop policy if exists technical_description_lines_update on public.technical_description_material_lines;
create policy technical_description_lines_update on public.technical_description_material_lines for update to authenticated
using (exists (select 1 from public.technical_description_documents document where document.id = document_id and document.project_id is not null and public.can_manage_project(document.project_id, 'technical_description.update')))
with check (exists (select 1 from public.technical_description_documents document where document.id = document_id and document.project_id is not null and public.can_manage_project(document.project_id, 'technical_description.update')));

grant select, insert, update on public.project_settings, public.project_modules, public.technical_descriptions, public.technical_description_versions to authenticated;
grant execute on function public.mark_project_results_stale(uuid, uuid) to service_role;

comment on table public.project_settings is 'Project-scoped technical and commercial defaults. Technical requirements remain authoritative.';
comment on table public.project_modules is 'Extensible modules enabled for a project; sprinkler is the first supported module.';
comment on table public.technical_description_versions is 'Immutable approved versions of a project technical description.';
