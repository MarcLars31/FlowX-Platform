-- FlowX FAS 1: vendor-neutral technical domain model.
-- Existing canonical tables are extended instead of duplicated.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'requirement_kind') then
    create type public.requirement_kind as enum (
      'must', 'conditional_must', 'exclusion', 'should', 'preference',
      'informational', 'unresolved'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'requirement_review_status') then
    create type public.requirement_review_status as enum (
      'user_confirmed', 'user_modified', 'extracted_unreviewed',
      'inferred_unreviewed', 'conflicted', 'rejected', 'superseded'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'rule_lifecycle_status') then
    create type public.rule_lifecycle_status as enum ('draft', 'active', 'retired');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Roles: preserve the operational legacy roles while introducing the requested
-- vocabulary. platform_admin remains an auth.app_metadata platform role and is
-- deliberately forbidden as an organization membership role.
-- ---------------------------------------------------------------------------

insert into public.roles (
  id, organization_id, name, slug, description, is_system_role, seat_type
)
values
  (
    '00000000-0000-4000-8000-000000000006', null, 'Company admin',
    'company_admin', 'Customer company administration role.', true, 'admin'
  ),
  (
    '00000000-0000-4000-8000-000000000007', null, 'Project manager',
    'project_manager', 'Creates and manages projects and project teams.', true, 'full_user'
  ),
  (
    '00000000-0000-4000-8000-000000000008', null, 'Engineer',
    'engineer', 'Engineering, analysis and material-list role.', true, 'full_user'
  ),
  (
    '00000000-0000-4000-8000-000000000009', null, 'Viewer',
    'viewer', 'Read-only project role.', true, 'read_only'
  ),
  (
    '00000000-0000-4000-8000-000000000010', null, 'Platform admin',
    'platform_admin', 'Protected marker; authority comes only from auth app_metadata.', true, 'admin'
  )
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    description = excluded.description,
    seat_type = excluded.seat_type,
    updated_at = now();

-- Alias roles inherit the established, tested permission sets.
with aliases(alias_slug, source_slug) as (
  values
    ('company_admin', 'organization_admin'),
    ('project_manager', 'full_user'),
    ('engineer', 'full_user'),
    ('viewer', 'read_only')
)
insert into public.role_permissions (role_id, permission_id)
select alias_role.id, source_permission.permission_id
from aliases
join public.roles alias_role
  on alias_role.slug = aliases.alias_slug and alias_role.organization_id is null
join public.roles source_role
  on source_role.slug = aliases.source_slug and source_role.organization_id is null
join public.role_permissions source_permission on source_permission.role_id = source_role.id
on conflict (role_id, permission_id) do nothing;

create or replace function public.protect_platform_admin_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.roles role
    where role.id = new.role_id and role.slug = 'platform_admin'
  ) then
    raise exception 'platform_admin is not an organization membership role';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_members_protect_platform_admin on public.organization_members;
create trigger organization_members_protect_platform_admin
before insert or update of role_id on public.organization_members
for each row execute function public.protect_platform_admin_membership();

-- ---------------------------------------------------------------------------
-- Project hierarchy. Systems and buildings are siblings because a technical
-- system can span several buildings, floors, or zones.
-- ---------------------------------------------------------------------------

create unique index if not exists projects_id_organization_uidx
  on public.projects (id, organization_id);

create table if not exists public.project_systems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  code text,
  name text not null,
  system_type text not null,
  description text,
  technical_parameters jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (project_id, organization_id)
    references public.projects(id, organization_id) on delete cascade,
  constraint project_systems_name_not_blank check (btrim(name) <> ''),
  constraint project_systems_type_not_blank check (btrim(system_type) <> '')
);

create unique index if not exists project_systems_id_scope_uidx
  on public.project_systems (id, organization_id, project_id);
create unique index if not exists project_systems_code_uidx
  on public.project_systems (project_id, lower(code))
  where code is not null and deleted_at is null;

create table if not exists public.project_buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  code text,
  name text not null,
  address text,
  gross_area_m2 numeric(14,3),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (project_id, organization_id)
    references public.projects(id, organization_id) on delete cascade,
  constraint project_buildings_name_not_blank check (btrim(name) <> ''),
  constraint project_buildings_area_non_negative check (gross_area_m2 is null or gross_area_m2 >= 0)
);

create unique index if not exists project_buildings_id_scope_uidx
  on public.project_buildings (id, organization_id, project_id);
create unique index if not exists project_buildings_code_uidx
  on public.project_buildings (project_id, lower(code))
  where code is not null and deleted_at is null;

create table if not exists public.project_floors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  building_id uuid not null,
  code text,
  name text not null,
  level_number numeric(8,2),
  gross_area_m2 numeric(14,3),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (building_id, organization_id, project_id)
    references public.project_buildings(id, organization_id, project_id) on delete cascade,
  constraint project_floors_name_not_blank check (btrim(name) <> ''),
  constraint project_floors_area_non_negative check (gross_area_m2 is null or gross_area_m2 >= 0)
);

create unique index if not exists project_floors_id_scope_uidx
  on public.project_floors (id, organization_id, project_id);
create unique index if not exists project_floors_code_uidx
  on public.project_floors (building_id, lower(code))
  where code is not null and deleted_at is null;

create table if not exists public.project_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  floor_id uuid not null,
  code text,
  name text not null,
  hazard_classification text,
  area_m2 numeric(14,3),
  design_parameters jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (floor_id, organization_id, project_id)
    references public.project_floors(id, organization_id, project_id) on delete cascade,
  constraint project_zones_name_not_blank check (btrim(name) <> ''),
  constraint project_zones_area_non_negative check (area_m2 is null or area_m2 >= 0)
);

create unique index if not exists project_zones_id_scope_uidx
  on public.project_zones (id, organization_id, project_id);
create unique index if not exists project_zones_code_uidx
  on public.project_zones (floor_id, lower(code))
  where code is not null and deleted_at is null;

create table if not exists public.project_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  zone_id uuid not null,
  position_code text not null,
  name text,
  position_type text,
  quantity numeric(14,3) not null default 1,
  coordinates jsonb,
  technical_parameters jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (zone_id, organization_id, project_id)
    references public.project_zones(id, organization_id, project_id) on delete cascade,
  constraint project_positions_code_not_blank check (btrim(position_code) <> ''),
  constraint project_positions_quantity_positive check (quantity > 0)
);

create unique index if not exists project_positions_id_scope_uidx
  on public.project_positions (id, organization_id, project_id);
create unique index if not exists project_positions_code_uidx
  on public.project_positions (project_id, lower(position_code))
  where deleted_at is null;

create table if not exists public.project_system_buildings (
  project_system_id uuid not null,
  project_building_id uuid not null,
  organization_id uuid not null,
  project_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_system_id, project_building_id),
  foreign key (project_system_id, organization_id, project_id)
    references public.project_systems(id, organization_id, project_id) on delete cascade,
  foreign key (project_building_id, organization_id, project_id)
    references public.project_buildings(id, organization_id, project_id) on delete cascade
);

create table if not exists public.project_system_zones (
  project_system_id uuid not null,
  project_zone_id uuid not null,
  organization_id uuid not null,
  project_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_system_id, project_zone_id),
  foreign key (project_system_id, organization_id, project_id)
    references public.project_systems(id, organization_id, project_id) on delete cascade,
  foreign key (project_zone_id, organization_id, project_id)
    references public.project_zones(id, organization_id, project_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Requirements, sources, reviews, conflicts, attributes and units.
-- ---------------------------------------------------------------------------

alter table public.project_requirements alter column status drop default;
alter table public.project_requirements drop constraint if exists project_requirements_status_check;
update public.project_requirements
set status = case status
  when 'pending' then 'extracted_unreviewed'
  when 'confirmed' then 'user_confirmed'
  when 'unclear' then 'inferred_unreviewed'
  when 'conflict' then 'conflicted'
  else status
end;
alter table public.project_requirements
  alter column status type public.requirement_review_status
  using status::public.requirement_review_status,
  alter column status set default 'extracted_unreviewed';
alter table public.project_requirements
  add column if not exists requirement_type public.requirement_kind not null default 'informational',
  add column if not exists project_system_id uuid references public.project_systems(id) on delete set null,
  add column if not exists project_position_id uuid references public.project_positions(id) on delete set null;

alter table public.requirement_evidence
  add column if not exists source_type text not null default 'document',
  add column if not exists source_section text,
  add column if not exists source_url text,
  add column if not exists checksum text;

alter table public.project_requirement_conflicts
  add column if not exists left_requirement_id uuid references public.project_requirements(id) on delete set null,
  add column if not exists right_requirement_id uuid references public.project_requirements(id) on delete set null,
  add column if not exists conflict_type text,
  add column if not exists deleted_at timestamptz;

create table if not exists public.requirement_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement_id uuid not null references public.project_requirements(id) on delete cascade,
  previous_status public.requirement_review_status,
  resulting_status public.requirement_review_status not null,
  previous_value jsonb,
  resulting_value jsonb,
  comment text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint requirement_reviews_value_changed check (
    previous_status is distinct from resulting_status
    or previous_value is distinct from resulting_value
  )
);

create index if not exists requirement_reviews_requirement_idx
  on public.requirement_reviews (requirement_id, reviewed_at desc);

create table if not exists public.unit_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  symbol text not null,
  quantity_kind text not null,
  is_si boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_definitions_code_not_blank check (btrim(code) <> ''),
  constraint unit_definitions_symbol_not_blank check (btrim(symbol) <> '')
);

create table if not exists public.unit_conversions (
  id uuid primary key default gen_random_uuid(),
  from_unit_id uuid not null references public.unit_definitions(id) on delete cascade,
  to_unit_id uuid not null references public.unit_definitions(id) on delete cascade,
  multiplier numeric not null,
  offset_value numeric not null default 0,
  precision_digits integer check (precision_digits is null or precision_digits between 0 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_conversions_not_self check (from_unit_id <> to_unit_id),
  constraint unit_conversions_multiplier_nonzero check (multiplier <> 0),
  constraint unit_conversions_unique unique (from_unit_id, to_unit_id)
);

create table if not exists public.attribute_synonyms (
  id uuid primary key default gen_random_uuid(),
  attribute_definition_id uuid not null references public.attribute_definitions(id) on delete cascade,
  synonym text not null,
  language_code text not null default 'und',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attribute_synonyms_not_blank check (btrim(synonym) <> ''),
  constraint attribute_synonyms_unique unique (
    attribute_definition_id, synonym, language_code
  )
);

alter table public.attribute_definitions
  add column if not exists default_unit_id uuid references public.unit_definitions(id) on delete set null,
  add column if not exists deleted_at timestamptz;
alter table public.product_attribute_values
  add column if not exists unit_definition_id uuid references public.unit_definitions(id) on delete set null,
  add column if not exists deleted_at timestamptz;
alter table public.project_requirements
  add column if not exists attribute_definition_id uuid references public.attribute_definitions(id) on delete set null,
  add column if not exists unit_definition_id uuid references public.unit_definitions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Vendor-neutral product families, document history, approvals and rule packs.
-- ---------------------------------------------------------------------------

create table if not exists public.product_families (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  code text,
  name text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint product_families_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists product_families_code_uidx
  on public.product_families (manufacturer_id, lower(code))
  where code is not null and deleted_at is null;

alter table public.products
  add column if not exists product_family_id uuid references public.product_families(id) on delete set null;

create table if not exists public.product_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null,
  revision_label text,
  publication_date date,
  source_url text,
  storage_path text,
  mime_type text,
  file_size bigint,
  sha256 text,
  language_code text,
  is_current boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint product_document_versions_number_positive check (version_number > 0),
  constraint product_document_versions_file_size_non_negative check (file_size is null or file_size >= 0),
  constraint product_document_versions_unique unique (document_id, version_number)
);

create unique index if not exists product_document_versions_current_uidx
  on public.product_document_versions (document_id)
  where is_current and deleted_at is null;

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  image_type text not null default 'product',
  title text,
  alt_text text,
  source_url text,
  storage_path text,
  sha256 text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint product_images_one_parent check (num_nonnulls(product_id, product_variant_id) = 1),
  constraint product_images_sort_non_negative check (sort_order >= 0)
);

alter table public.approvals
  add column if not exists code text,
  add column if not exists issuing_body text,
  add column if not exists region_code text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table public.product_approvals
  add column if not exists product_variant_id uuid references public.product_variants(id) on delete cascade,
  add column if not exists valid_from date,
  add column if not exists valid_to date,
  add column if not exists document_revision text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create table if not exists public.approval_conditions (
  id uuid primary key default gen_random_uuid(),
  product_approval_id uuid not null references public.product_approvals(id) on delete cascade,
  condition_type text not null check (condition_type in (
    'dimension', 'pressure', 'temperature', 'material', 'system_type',
    'use_case', 'installation_method', 'region', 'document_revision', 'other'
  )),
  attribute_definition_id uuid references public.attribute_definitions(id) on delete set null,
  operator text not null check (operator in (
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in', 'contains'
  )),
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_json jsonb,
  second_value_number numeric,
  unit_definition_id uuid references public.unit_definitions(id) on delete set null,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint approval_conditions_one_value check (
    num_nonnulls(value_text, value_number, value_boolean, value_json) = 1
  ),
  constraint approval_conditions_between_values check (
    (operator = 'between' and value_number is not null and second_value_number is not null)
    or (operator <> 'between' and second_value_number is null)
  )
);

create table if not exists public.rule_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  publisher text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint rule_packages_code_not_blank check (btrim(code) <> '')
);

create table if not exists public.rule_package_versions (
  id uuid primary key default gen_random_uuid(),
  rule_package_id uuid not null references public.rule_packages(id) on delete cascade,
  version text not null,
  status public.rule_lifecycle_status not null default 'draft',
  valid_from date,
  valid_to date,
  checksum text,
  change_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint rule_package_versions_dates check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint rule_package_versions_unique unique (rule_package_id, version)
);

create table if not exists public.rule_definitions (
  id uuid primary key default gen_random_uuid(),
  rule_package_version_id uuid not null references public.rule_package_versions(id) on delete cascade,
  rule_code text not null,
  name text not null,
  description text,
  rule_type text not null,
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  outcome text not null check (outcome in ('pass', 'fail', 'unknown', 'not_applicable')),
  priority integer not null default 100,
  expression jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint rule_definitions_unique unique (rule_package_version_id, rule_code)
);

create table if not exists public.compatibility_rule_conditions (
  id uuid primary key default gen_random_uuid(),
  compatibility_rule_id uuid not null references public.compatibility_rules(id) on delete cascade,
  side text not null check (side in ('left', 'right', 'context')),
  attribute_definition_id uuid references public.attribute_definitions(id) on delete set null,
  operator text not null,
  comparison_value jsonb not null,
  unit_definition_id uuid references public.unit_definitions(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compatibility_conditions_sort_non_negative check (sort_order >= 0)
);

create table if not exists public.product_compatibility_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.product_compatibility_group_members (
  compatibility_group_id uuid not null references public.product_compatibility_groups(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  member_role text,
  created_at timestamptz not null default now(),
  constraint compatibility_group_members_one_product check (
    num_nonnulls(product_id, product_variant_id) = 1
  ),
  unique nulls not distinct (compatibility_group_id, product_id, product_variant_id)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_systems', 'project_buildings', 'project_floors', 'project_zones',
    'project_positions', 'unit_definitions', 'unit_conversions', 'attribute_synonyms',
    'product_families', 'product_images', 'approvals', 'product_approvals',
    'approval_conditions', 'rule_packages', 'rule_package_versions',
    'rule_definitions', 'compatibility_rule_conditions', 'product_compatibility_groups'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

create index if not exists project_systems_project_idx
  on public.project_systems (project_id, system_type) where deleted_at is null;
create index if not exists project_buildings_project_idx
  on public.project_buildings (project_id, name) where deleted_at is null;
create index if not exists project_floors_building_idx
  on public.project_floors (building_id, level_number) where deleted_at is null;
create index if not exists project_zones_floor_idx
  on public.project_zones (floor_id, name) where deleted_at is null;
create index if not exists project_positions_zone_idx
  on public.project_positions (zone_id, position_type) where deleted_at is null;
create index if not exists project_requirements_type_status_idx
  on public.project_requirements (project_id, requirement_type, status)
  where deleted_at is null;
create index if not exists product_families_catalog_idx
  on public.product_families (manufacturer_id, category_id, name) where deleted_at is null;
create index if not exists product_images_product_idx
  on public.product_images (product_id, sort_order) where deleted_at is null;
create index if not exists approval_conditions_approval_idx
  on public.approval_conditions (product_approval_id, condition_type) where deleted_at is null;

-- Compatibility names requested in the specification. They are security-invoker
-- views over the established canonical model, not duplicate sources of truth.
create or replace view public.companies with (security_invoker = true) as
select * from public.organizations;

create or replace view public.company_members with (security_invoker = true) as
select * from public.organization_members;

create or replace view public.company_invitations with (security_invoker = true) as
select * from public.organization_invitations;

create or replace view public.product_categories with (security_invoker = true) as
select * from public.categories;

create or replace view public.product_attributes with (security_invoker = true) as
select * from public.attribute_definitions;

create or replace view public.requirement_sources with (security_invoker = true) as
select * from public.requirement_evidence;

create or replace view public.requirement_conflicts with (security_invoker = true) as
select * from public.project_requirement_conflicts;

comment on view public.companies is
  'Compatibility name. organizations is the canonical tenant table.';
comment on view public.requirement_sources is
  'Compatibility name. requirement_evidence is the canonical evidence/source table.';
