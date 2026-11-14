insert into public.permissions (key, description, category)
values
  ('project.settings.view', 'View project settings and technical parameters.', 'project'),
  ('project.settings.update', 'Update project settings, standards and suppliers.', 'project'),
  ('project.requirement.view', 'View extracted and confirmed project requirements.', 'project'),
  ('project.requirement.create', 'Create project requirements from documents or manually.', 'project'),
  ('project.requirement.update', 'Review, resolve and update project requirements.', 'project'),
  ('project.product_suggestion.view', 'View product suggestions for a project.', 'project'),
  ('project.product_suggestion.create', 'Create product suggestions for a project.', 'project'),
  ('project.product_suggestion.update', 'Review and select project product suggestions.', 'project'),
  ('project.decision.view', 'View project decisions.', 'project'),
  ('project.decision.create', 'Create project decisions.', 'project'),
  ('project.decision.update', 'Update project decisions.', 'project'),
  ('project.version.view', 'View project snapshots and versions.', 'project'),
  ('project.version.create', 'Create project snapshots and versions.', 'project')
on conflict (key) do update
set description = excluded.description,
    category = excluded.category;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.organization_id is null
  and role.slug in ('organization_owner', 'organization_admin', 'full_user')
  and permission.key like 'project.%'
  and permission.key in (
    'project.settings.view', 'project.settings.update',
    'project.requirement.view', 'project.requirement.create', 'project.requirement.update',
    'project.product_suggestion.view', 'project.product_suggestion.create', 'project.product_suggestion.update',
    'project.decision.view', 'project.decision.create', 'project.decision.update',
    'project.version.view', 'project.version.create'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.organization_id is null
  and role.slug = 'read_only'
  and permission.key in (
    'project.settings.view', 'project.requirement.view',
    'project.product_suggestion.view', 'project.decision.view', 'project.version.view'
  )
on conflict (role_id, permission_id) do nothing;

alter table public.projects
  add column if not exists project_number text,
  add column if not exists end_customer text,
  add column if not exists project_manager_id uuid references auth.users(id) on delete set null,
  add column if not exists estimator_id uuid references auth.users(id) on delete set null,
  add column if not exists expected_start_date date,
  add column if not exists expected_delivery_date date,
  add column if not exists internal_comments text,
  add column if not exists project_type text,
  add column if not exists procurement_strategy text,
  add column if not exists currency text default 'NOK',
  add column if not exists delivery_country text,
  add column if not exists warehouse_location text,
  add column if not exists technical_parameters jsonb not null default '{}'::jsonb;

create index if not exists projects_project_number_idx
  on public.projects (organization_id, project_number)
  where project_number is not null;

alter table public.project_documents
  add column if not exists document_category text,
  add column if not exists extraction_status text not null default 'not_started',
  add column if not exists extraction_method text,
  add column if not exists extraction_result jsonb not null default '{}'::jsonb,
  add column if not exists file_sha256 text,
  add column if not exists page_count integer;

create table if not exists public.project_system_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  system_type text not null,
  label text not null,
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, system_type)
);

create table if not exists public.project_standards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  standard_name text not null,
  edition text,
  priority integer not null default 1 check (priority > 0),
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, standard_name, edition)
);

create table if not exists public.project_supplier_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  supplier_kind text not null check (supplier_kind in ('manufacturer', 'distributor')),
  selection_role text not null check (selection_role in ('preferred', 'alternative')),
  supplier_name text not null,
  agreement_or_price_list text,
  currency text,
  delivery_country text,
  warehouse_location text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_supplier_options_project_idx
  on public.project_supplier_options (project_id, supplier_kind, selection_role);

create table if not exists public.project_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null,
  requirement_key text not null,
  value_text text,
  value_json jsonb not null default '{}'::jsonb,
  certainty text not null default 'interpreted'
    check (certainty in ('explicit', 'interpreted')),
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'unclear', 'conflict')),
  source_document_id uuid references public.project_documents(id) on delete set null,
  source_technical_description_document_id uuid references public.technical_description_documents(id) on delete set null,
  source_page integer,
  source_section text,
  source_excerpt text,
  reviewer_comment text,
  assigned_to uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_requirements_project_status_idx
  on public.project_requirements (project_id, status, category, updated_at desc);

create table if not exists public.project_requirement_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null,
  severity text not null default 'technical'
    check (severity in ('critical', 'technical', 'commercial', 'delivery', 'documentation', 'minor')),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  proposed_resolution text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_product_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement_id uuid references public.project_requirements(id) on delete set null,
  product_id uuid,
  product_snapshot jsonb not null default '{}'::jsonb,
  match_score numeric(5,2) check (match_score is null or (match_score >= 0 and match_score <= 100)),
  recommendation_reason text,
  deviation_type text check (deviation_type is null or deviation_type in ('critical', 'technical', 'commercial', 'delivery', 'documentation', 'minor')),
  deviation_text text,
  status text not null default 'suggested'
    check (status in ('suggested', 'selected', 'rejected', 'locked', 'needs_review')),
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_product_suggestions_project_idx
  on public.project_product_suggestions (project_id, status, match_score desc);

create table if not exists public.project_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  decision text not null,
  entity_type text,
  entity_id uuid,
  rationale text not null,
  document_id uuid references public.project_documents(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'approved', 'rejected', 'superseded')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  change_summary text,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create index if not exists project_versions_project_idx
  on public.project_versions (project_id, version_number desc);

alter table public.project_system_types enable row level security;
alter table public.project_standards enable row level security;
alter table public.project_supplier_options enable row level security;
alter table public.project_requirements enable row level security;
alter table public.project_requirement_conflicts enable row level security;
alter table public.project_product_suggestions enable row level security;
alter table public.project_decisions enable row level security;
alter table public.project_versions enable row level security;

drop policy if exists project_system_types_select on public.project_system_types;
create policy project_system_types_select on public.project_system_types
for select to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.view'));
drop policy if exists project_system_types_insert on public.project_system_types;
create policy project_system_types_insert on public.project_system_types
for insert to authenticated
with check (created_by = auth.uid() and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'));
drop policy if exists project_system_types_update on public.project_system_types;
create policy project_system_types_update on public.project_system_types
for update to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'))
with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'));
drop policy if exists project_system_types_delete on public.project_system_types;
create policy project_system_types_delete on public.project_system_types
for delete to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'));

drop policy if exists project_standards_select on public.project_standards;
create policy project_standards_select on public.project_standards
for select to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.view'));
drop policy if exists project_standards_insert on public.project_standards;
create policy project_standards_insert on public.project_standards
for insert to authenticated
with check (created_by = auth.uid() and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'));
drop policy if exists project_standards_update on public.project_standards;
create policy project_standards_update on public.project_standards
for update to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'))
with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'));
drop policy if exists project_standards_delete on public.project_standards;
create policy project_standards_delete on public.project_standards
for delete to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'));

drop policy if exists project_supplier_options_select on public.project_supplier_options;
create policy project_supplier_options_select on public.project_supplier_options
for select to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.view'));
drop policy if exists project_supplier_options_insert on public.project_supplier_options;
create policy project_supplier_options_insert on public.project_supplier_options
for insert to authenticated
with check (created_by = auth.uid() and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'));
drop policy if exists project_supplier_options_update on public.project_supplier_options;
create policy project_supplier_options_update on public.project_supplier_options
for update to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'))
with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'));
drop policy if exists project_supplier_options_delete on public.project_supplier_options;
create policy project_supplier_options_delete on public.project_supplier_options
for delete to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.settings.update'));

drop policy if exists project_requirements_select on public.project_requirements;
create policy project_requirements_select on public.project_requirements
for select to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.view'));
drop policy if exists project_requirements_insert on public.project_requirements;
create policy project_requirements_insert on public.project_requirements
for insert to authenticated
with check (created_by = auth.uid() and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.create'));
drop policy if exists project_requirements_update on public.project_requirements;
create policy project_requirements_update on public.project_requirements
for update to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.update'))
with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.update'));
drop policy if exists project_requirements_delete on public.project_requirements;
create policy project_requirements_delete on public.project_requirements
for delete to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.update'));

drop policy if exists project_requirement_conflicts_select on public.project_requirement_conflicts;
create policy project_requirement_conflicts_select on public.project_requirement_conflicts
for select to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.view'));
drop policy if exists project_requirement_conflicts_insert on public.project_requirement_conflicts;
create policy project_requirement_conflicts_insert on public.project_requirement_conflicts
for insert to authenticated
with check (created_by = auth.uid() and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.update'));
drop policy if exists project_requirement_conflicts_update on public.project_requirement_conflicts;
create policy project_requirement_conflicts_update on public.project_requirement_conflicts
for update to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.update'))
with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.update'));

drop policy if exists project_product_suggestions_select on public.project_product_suggestions;
create policy project_product_suggestions_select on public.project_product_suggestions
for select to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.product_suggestion.view'));
drop policy if exists project_product_suggestions_insert on public.project_product_suggestions;
create policy project_product_suggestions_insert on public.project_product_suggestions
for insert to authenticated
with check (created_by = auth.uid() and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.product_suggestion.create'));
drop policy if exists project_product_suggestions_update on public.project_product_suggestions;
create policy project_product_suggestions_update on public.project_product_suggestions
for update to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.product_suggestion.update'))
with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.product_suggestion.update'));

drop policy if exists project_decisions_select on public.project_decisions;
create policy project_decisions_select on public.project_decisions
for select to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.decision.view'));
drop policy if exists project_decisions_insert on public.project_decisions;
create policy project_decisions_insert on public.project_decisions
for insert to authenticated
with check (created_by = auth.uid() and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.decision.create'));
drop policy if exists project_decisions_update on public.project_decisions;
create policy project_decisions_update on public.project_decisions
for update to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.decision.update'))
with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.decision.update'));

drop policy if exists project_versions_select on public.project_versions;
create policy project_versions_select on public.project_versions
for select to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.version.view'));
drop policy if exists project_versions_insert on public.project_versions;
create policy project_versions_insert on public.project_versions
for insert to authenticated
with check (created_by = auth.uid() and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.version.create'));

create or replace function public.enforce_project_artifact_organization()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  project_organization_id uuid;
begin
  select project.organization_id into project_organization_id
  from public.projects project where project.id = new.project_id;
  if project_organization_id is distinct from new.organization_id then
    raise exception 'Project artifact organization_id does not match its project.';
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_system_types',
    'project_standards',
    'project_supplier_options',
    'project_requirements',
    'project_requirement_conflicts',
    'project_product_suggestions',
    'project_decisions',
    'project_versions'
  ] loop
    execute format('drop trigger if exists %I_enforce_organization on public.%I', table_name, table_name);
    execute format('create trigger %I_enforce_organization before insert or update on public.%I for each row execute function public.enforce_project_artifact_organization()', table_name, table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_system_types',
    'project_standards',
    'project_supplier_options',
    'project_requirements',
    'project_requirement_conflicts',
    'project_product_suggestions',
    'project_decisions'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

revoke all on table
  public.project_system_types,
  public.project_standards,
  public.project_supplier_options,
  public.project_requirements,
  public.project_requirement_conflicts,
  public.project_product_suggestions,
  public.project_decisions,
  public.project_versions
from public, anon, authenticated;

grant select, insert, update, delete on public.project_system_types to authenticated;
grant select, insert, update, delete on public.project_standards to authenticated;
grant select, insert, update, delete on public.project_supplier_options to authenticated;
grant select, insert, update, delete on public.project_requirements to authenticated;
grant select, insert, update on public.project_requirement_conflicts to authenticated;
grant select, insert, update on public.project_product_suggestions to authenticated;
grant select, insert, update on public.project_decisions to authenticated;
grant select, insert on public.project_versions to authenticated;
