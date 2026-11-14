-- FlowX FAS 1: data provenance, imports, commercial observations, decisions,
-- and revision history. Technical truth stays separate from commercial data.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'flowx_data_mode') then
    create type public.flowx_data_mode as enum ('demo', 'external_unverified', 'verified');
  end if;
  if not exists (select 1 from pg_type where typname = 'data_quality_status') then
    create type public.data_quality_status as enum (
      'demo_unverified', 'source_unverified', 'under_review', 'verified', 'rejected', 'expired'
    );
  end if;
end
$$;

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  source_type text not null check (source_type in (
    'demo', 'manufacturer', 'distributor', 'crawler', 'sprsok',
    'manual', 'pdf_extractor', 'api', 'file_import'
  )),
  base_url text,
  license_name text,
  terms_url text,
  configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint data_sources_code_not_blank check (btrim(code) <> ''),
  constraint data_sources_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists data_sources_global_code_uidx
  on public.data_sources (lower(code))
  where organization_id is null and deleted_at is null;
create unique index if not exists data_sources_org_code_uidx
  on public.data_sources (organization_id, lower(code))
  where organization_id is not null and deleted_at is null;

create table if not exists public.data_sets (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  code text not null,
  name text not null,
  version text not null,
  data_mode public.flowx_data_mode not null,
  quality_status public.data_quality_status not null,
  disclaimer text,
  source_description text,
  valid_from timestamptz,
  valid_to timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint data_sets_code_not_blank check (btrim(code) <> ''),
  constraint data_sets_version_not_blank check (btrim(version) <> ''),
  constraint data_sets_validity check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint data_sets_demo_disclaimer check (
    data_mode <> 'demo'
    or disclaimer = 'Demo data – ej verifierad för projektering, installation eller inköp.'
  ),
  constraint data_sets_demo_quality check (
    data_mode <> 'demo' or quality_status = 'demo_unverified'
  ),
  constraint data_sets_verified_quality check (
    data_mode <> 'verified' or quality_status = 'verified'
  ),
  constraint data_sets_unique unique (data_source_id, code, version)
);

alter table public.manufacturers
  add column if not exists data_source_id uuid references public.data_sources(id) on delete set null,
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.categories
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null;
alter table public.product_families
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.products
  add column if not exists data_source_id uuid references public.data_sources(id) on delete set null,
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.product_variants
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.documents
  add column if not exists data_source_id uuid references public.data_sources(id) on delete set null,
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.product_document_versions
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.approvals
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.standards
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.attribute_definitions
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.product_attribute_values
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.product_approvals
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.suppliers
  add column if not exists data_source_id uuid references public.data_sources(id) on delete set null,
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.supplier_products
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.compatibility_rule_sets
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.compatibility_rules
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified';
alter table public.supplier_offers
  add column if not exists data_source_id uuid references public.data_sources(id) on delete set null,
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null,
  add column if not exists observed_at timestamptz not null default now(),
  add column if not exists external_offer_id text,
  add column if not exists quality_status public.data_quality_status not null default 'source_unverified',
  add column if not exists deleted_at timestamptz;
alter table public.reference_projects
  add column if not exists data_set_id uuid references public.data_sets(id) on delete set null;
alter table public.projects
  add column if not exists demo_data_set_id uuid references public.data_sets(id) on delete set null;

create index if not exists products_data_set_idx
  on public.products (data_set_id, quality_status, status) where deleted_at is null;
create index if not exists variants_data_set_idx
  on public.product_variants (data_set_id, quality_status, technical_status) where deleted_at is null;
create index if not exists supplier_offers_observed_idx
  on public.supplier_offers (organization_id, observed_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- General import orchestration and stable external mappings.
-- ---------------------------------------------------------------------------

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  data_set_id uuid references public.data_sets(id) on delete set null,
  parent_job_id uuid references public.import_jobs(id) on delete set null,
  job_type text not null,
  source_filename text,
  source_uri text,
  status text not null default 'queued' check (status in (
    'queued', 'validating', 'dry_run', 'running', 'completed', 'failed', 'cancelled'
  )),
  resume_cursor jsonb,
  options jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0 check (total_rows >= 0),
  successful_rows integer not null default 0 check (successful_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_jobs_counts_consistent check (
    successful_rows + failed_rows <= total_rows
  ),
  constraint import_jobs_completion_consistent check (
    completed_at is null or status in ('completed', 'failed', 'cancelled')
  )
);

create table if not exists public.import_job_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  external_key text,
  source_payload jsonb not null,
  normalized_payload jsonb,
  status text not null default 'pending' check (status in (
    'pending', 'validated', 'imported', 'skipped', 'failed', 'requires_review'
  )),
  target_table text,
  target_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_job_rows_payload_object check (jsonb_typeof(source_payload) = 'object'),
  constraint import_job_rows_unique unique (import_job_id, row_number)
);

create table if not exists public.import_errors (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  import_job_row_id uuid references public.import_job_rows(id) on delete cascade,
  error_code text not null,
  error_message text not null,
  field_name text,
  severity text not null default 'error' check (severity in ('warning', 'error', 'fatal')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.external_product_mappings (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.data_sources(id) on delete cascade,
  external_product_id text not null,
  external_variant_id text,
  product_id uuid references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  mapping_status text not null default 'proposed' check (mapping_status in (
    'proposed', 'confirmed', 'rejected', 'superseded'
  )),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  mapping_method text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint external_product_mappings_one_target check (
    num_nonnulls(product_id, product_variant_id) = 1
  )
);

create unique index if not exists external_product_mappings_source_uidx
  on public.external_product_mappings (
    data_source_id, external_product_id, coalesce(external_variant_id, '')
  ) where deleted_at is null and mapping_status <> 'superseded';

create table if not exists public.external_attribute_mappings (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.data_sources(id) on delete cascade,
  external_attribute_key text not null,
  attribute_definition_id uuid not null references public.attribute_definitions(id) on delete cascade,
  source_unit text,
  target_unit_id uuid references public.unit_definitions(id) on delete set null,
  transformation jsonb not null default '{}'::jsonb,
  mapping_status text not null default 'proposed' check (mapping_status in (
    'proposed', 'confirmed', 'rejected', 'superseded'
  )),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists external_attribute_mappings_source_uidx
  on public.external_attribute_mappings (data_source_id, external_attribute_key)
  where deleted_at is null and mapping_status <> 'superseded';

create index if not exists import_jobs_status_idx
  on public.import_jobs (data_source_id, status, created_at desc);
create index if not exists import_job_rows_status_idx
  on public.import_job_rows (import_job_id, status, row_number);
create index if not exists import_errors_job_idx
  on public.import_errors (import_job_id, severity, created_at);

-- ---------------------------------------------------------------------------
-- Commercial data. Offers remain organization scoped and are observations,
-- never technical approval records.
-- ---------------------------------------------------------------------------

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  data_source_id uuid references public.data_sources(id) on delete set null,
  data_set_id uuid references public.data_sets(id) on delete set null,
  code text not null,
  name text not null,
  currency_code char(3) not null,
  version text,
  valid_from timestamptz,
  valid_to timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'expired', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint price_lists_validity check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create unique index if not exists price_lists_code_uidx
  on public.price_lists (organization_id, supplier_id, lower(code)) where deleted_at is null;

create table if not exists public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  unit_price numeric(18,4) not null check (unit_price >= 0),
  price_unit text not null,
  minimum_quantity numeric check (minimum_quantity is null or minimum_quantity > 0),
  discount_breaks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint price_list_items_unique unique (price_list_id, supplier_product_id)
);

create table if not exists public.stock_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  warehouse_code text,
  quantity numeric check (quantity is null or quantity >= 0),
  stock_status text,
  observed_at timestamptz not null,
  data_source_id uuid references public.data_sources(id) on delete set null,
  data_set_id uuid references public.data_sets(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.lead_times (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  delivery_region text,
  minimum_days integer check (minimum_days is null or minimum_days >= 0),
  maximum_days integer check (maximum_days is null or maximum_days >= 0),
  observed_at timestamptz not null,
  data_source_id uuid references public.data_sources(id) on delete set null,
  data_set_id uuid references public.data_sets(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint lead_times_range check (
    maximum_days is null or minimum_days is null or maximum_days >= minimum_days
  )
);

create table if not exists public.offer_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_offer_id uuid references public.supplier_offers(id) on delete set null,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  change_type text not null check (change_type in ('insert', 'update', 'delete')),
  previous_offer jsonb,
  current_offer jsonb,
  observed_at timestamptz not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_levels_latest_idx
  on public.stock_levels (organization_id, supplier_product_id, observed_at desc) where deleted_at is null;
create index if not exists lead_times_latest_idx
  on public.lead_times (organization_id, supplier_product_id, observed_at desc) where deleted_at is null;
create index if not exists offer_history_offer_idx
  on public.offer_history (supplier_offer_id, observed_at desc);

create or replace function public.capture_supplier_offer_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  row_value public.supplier_offers%rowtype;
begin
  row_value := case when tg_op = 'DELETE' then old else new end;
  insert into public.offer_history (
    organization_id, supplier_offer_id, supplier_product_id, change_type,
    previous_offer, current_offer, observed_at, changed_by
  ) values (
    row_value.organization_id,
    case when tg_op = 'DELETE' then null else row_value.id end,
    row_value.supplier_product_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    coalesce(row_value.observed_at, now()),
    auth.uid()
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists supplier_offers_history on public.supplier_offers;
create trigger supplier_offers_history
after insert or update or delete on public.supplier_offers
for each row execute function public.capture_supplier_offer_history();

-- ---------------------------------------------------------------------------
-- Explicit matching decisions and exceptional overrides.
-- ---------------------------------------------------------------------------

create table if not exists public.matching_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  match_run_id uuid not null references public.match_runs(id) on delete cascade,
  match_candidate_id uuid not null references public.match_candidates(id) on delete cascade,
  decision text not null check (decision in ('selected', 'rejected', 'requires_review', 'superseded')),
  rationale text not null,
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists matching_decisions_active_uidx
  on public.matching_decisions (match_candidate_id)
  where decision <> 'superseded' and deleted_at is null;

create table if not exists public.matching_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  match_candidate_id uuid not null references public.match_candidates(id) on delete cascade,
  override_type text not null check (override_type in (
    'data_correction', 'compatibility_review', 'requirement_interpretation', 'other'
  )),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'superseded')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint matching_overrides_reason_not_blank check (btrim(reason) <> '')
);

create index if not exists matching_overrides_candidate_idx
  on public.matching_overrides (match_candidate_id, status, created_at desc) where deleted_at is null;

-- Global catalog revisions cannot use organization audit_logs. They form a
-- separate append-only history with optional dataset provenance.
create table if not exists public.catalog_revision_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  previous_data jsonb,
  current_data jsonb,
  data_set_id uuid references public.data_sets(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists catalog_revision_entity_idx
  on public.catalog_revision_history (entity_type, entity_id, created_at desc);

create or replace function public.capture_catalog_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_value jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_value jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  entity_uuid uuid := coalesce((new_value ->> 'id')::uuid, (old_value ->> 'id')::uuid);
  source_data_set uuid := coalesce(
    nullif(new_value ->> 'data_set_id', '')::uuid,
    nullif(old_value ->> 'data_set_id', '')::uuid
  );
begin
  insert into public.catalog_revision_history (
    entity_type, entity_id, operation, previous_data, current_data,
    data_set_id, actor_user_id
  ) values (
    tg_table_name, entity_uuid, lower(tg_op), old_value, new_value,
    source_data_set, auth.uid()
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['products', 'product_variants', 'product_families', 'documents', 'approvals']
  loop
    execute format('drop trigger if exists %I_catalog_revision on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_catalog_revision after insert or update or delete on public.%I for each row execute function public.capture_catalog_revision()',
      table_name,
      table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'data_sources', 'data_sets', 'import_jobs', 'import_job_rows',
    'external_product_mappings', 'external_attribute_mappings',
    'price_lists', 'price_list_items', 'matching_decisions', 'matching_overrides'
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

-- Requested names mapped to the existing implementation without parallel data.
create or replace view public.distributors with (security_invoker = true) as
select * from public.suppliers where supplier_type = 'distributor';

create or replace view public.distributor_offers with (security_invoker = true) as
select offer.*, supplier_product.supplier_id
from public.supplier_offers offer
join public.supplier_products supplier_product on supplier_product.id = offer.supplier_product_id;

create or replace view public.analysis_runs with (security_invoker = true) as
select * from public.analyses;

create or replace view public.matching_runs with (security_invoker = true) as
select * from public.match_runs;

create or replace view public.matching_candidates with (security_invoker = true) as
select * from public.match_candidates;

create or replace view public.matching_results with (security_invoker = true) as
select * from public.match_candidates;

create or replace view public.matching_result_checks with (security_invoker = true) as
select * from public.requirement_evaluations;

create or replace view public.compatibility_checks with (security_invoker = true) as
select * from public.compatibility_evaluations;

create or replace view public.compatibility_rule_results with (security_invoker = true) as
select * from public.compatibility_evaluations;

create or replace view public.material_list_exports with (security_invoker = true) as
select * from public.exports;

comment on view public.matching_results is
  'Compatibility name. match_candidates contains both candidate identity and evaluated result.';
comment on view public.material_list_exports is
  'Compatibility name. exports is the canonical export table.';
