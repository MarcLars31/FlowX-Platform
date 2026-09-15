-- FlowX database completion (additive, tenant-safe, and data preserving).
-- Existing names remain canonical: project_documents is the project document
-- table, project_requirements stores confirmed requirements, products is the
-- global technical catalog, and supplier_offers is organization scoped.

-- ---------------------------------------------------------------------------
-- Project documents, pages, extraction runs, and requirement review
-- ---------------------------------------------------------------------------

alter table public.project_documents
  add column if not exists document_type text,
  add column if not exists original_filename text,
  add column if not exists version integer not null default 1,
  add column if not exists upload_status text not null default 'uploaded',
  add column if not exists processing_status text not null default 'pending',
  add column if not exists checksum text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint;

update public.project_documents
set original_filename = coalesce(original_filename, file_name),
    mime_type = coalesce(mime_type, content_type),
    file_size = coalesce(file_size, size_bytes),
    checksum = coalesce(checksum, file_sha256),
    upload_status = coalesce(upload_status, case when status = 'active' then 'uploaded' else 'failed' end),
    processing_status = coalesce(processing_status, case when extraction_status is null then 'pending' else extraction_status end)
where original_filename is null
   or mime_type is null
   or file_size is null
   or checksum is null;

create index if not exists project_documents_org_processing_idx
  on public.project_documents (organization_id, processing_status, created_at desc);
create unique index if not exists project_documents_org_checksum_uidx
  on public.project_documents (organization_id, checksum)
  where checksum is not null and deleted_at is null;

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid not null references public.project_documents(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  extracted_text text,
  extraction_method text not null default 'text' check (extraction_method in ('text','ocr','mixed','manual')),
  metadata jsonb not null default '{}'::jsonb,
  source_coordinates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, page_number)
);

create index if not exists document_pages_project_idx
  on public.document_pages (project_id, document_id, page_number);

create table if not exists public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid references public.projects(id) on delete cascade,
  document_id uuid not null references public.project_documents(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled','requires_review')),
  extraction_provider text not null default 'flowx',
  model_name text,
  model_version text,
  prompt_version text,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  raw_result jsonb,
  token_usage jsonb,
  cost_metadata jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists extraction_runs_document_idx on public.extraction_runs (document_id, created_at desc);
create index if not exists extraction_runs_project_status_idx on public.extraction_runs (project_id, status, created_at desc);

create table if not exists public.requirement_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft','under_review','confirmed','superseded','archived')),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, version)
);

create index if not exists requirement_sets_project_status_idx
  on public.requirement_sets (project_id, status, version desc);

create table if not exists public.requirement_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  extraction_run_id uuid references public.extraction_runs(id) on delete set null,
  document_id uuid references public.project_documents(id) on delete set null,
  technical_description_document_id uuid references public.technical_description_documents(id) on delete set null,
  page_number integer,
  raw_text text not null,
  requirement_category text not null,
  attribute_key text,
  operator text,
  raw_value text,
  normalized_value jsonb,
  unit text,
  is_mandatory boolean not null default false,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  source_coordinates jsonb not null default '[]'::jsonb,
  status text not null default 'extracted' check (status in ('extracted','accepted','rejected','modified','duplicate','requires_review')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists requirement_candidates_project_status_idx
  on public.requirement_candidates (project_id, status, created_at desc);
create index if not exists requirement_candidates_run_idx
  on public.requirement_candidates (extraction_run_id, page_number);

alter table public.project_requirements
  add column if not exists requirement_set_id uuid references public.requirement_sets(id) on delete set null,
  add column if not exists source_candidate_id uuid references public.requirement_candidates(id) on delete set null,
  add column if not exists attribute_key text,
  add column if not exists display_name text,
  add column if not exists operator text,
  add column if not exists value_type text,
  add column if not exists value_number numeric,
  add column if not exists value_boolean boolean,
  add column if not exists unit text,
  add column if not exists is_mandatory boolean not null default false,
  add column if not exists severity text not null default 'technical',
  add column if not exists verification_status text not null default 'unknown',
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists confirmed_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists project_requirements_set_idx
  on public.project_requirements (requirement_set_id, status, updated_at desc);

create table if not exists public.requirement_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement_id uuid not null references public.project_requirements(id) on delete cascade,
  document_id uuid references public.project_documents(id) on delete set null,
  technical_description_document_id uuid references public.technical_description_documents(id) on delete set null,
  page_number integer,
  source_text text not null,
  source_coordinates jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists requirement_evidence_requirement_idx
  on public.requirement_evidence (requirement_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Global catalog and typed technical attributes
-- ---------------------------------------------------------------------------

alter table public.categories
  add column if not exists code text,
  add column if not exists path text,
  add column if not exists level integer,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists categories_code_uidx on public.categories (code) where code is not null;

alter table public.manufacturers
  add column if not exists normalized_name text,
  add column if not exists country_code text,
  add column if not exists external_identifiers jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true;
update public.manufacturers set normalized_name = lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) where normalized_name is null;
create unique index if not exists manufacturers_normalized_name_uidx on public.manufacturers (normalized_name) where normalized_name is not null;

alter table public.standards
  add column if not exists code text,
  add column if not exists issuing_body text,
  add column if not exists version text,
  add column if not exists jurisdiction text,
  add column if not exists valid_from date,
  add column if not exists valid_to date,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists standards_code_version_uidx on public.standards (code, version) where code is not null;

alter table public.products
  add column if not exists product_family text,
  add column if not exists manufacturer_product_number text,
  add column if not exists source_type text,
  add column if not exists raw_data jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz;
create index if not exists products_catalog_filter_idx on public.products (category_id, manufacturer_id, status);
create index if not exists products_product_number_idx on public.products (manufacturer_product_number) where manufacturer_product_number is not null;

alter table public.product_variants
  add column if not exists sku text,
  add column if not exists manufacturer_sku text,
  add column if not exists gtin text,
  add column if not exists variant_name text,
  add column if not exists unit_of_measure text,
  add column if not exists package_quantity numeric,
  add column if not exists technical_status text not null default 'unverified',
  add column if not exists deleted_at timestamptz;
create unique index if not exists product_variants_sku_uidx on public.product_variants (sku) where sku is not null;

alter table public.product_documents
  add column if not exists document_type text,
  add column if not exists title text,
  add column if not exists storage_path text,
  add column if not exists external_reference text,
  add column if not exists language_code text,
  add column if not exists version text,
  add column if not exists publication_date date,
  add column if not exists checksum text,
  add column if not exists is_current boolean not null default true;

alter table public.product_certifications
  add column if not exists standard_id uuid references public.standards(id) on delete set null,
  add column if not exists certificate_number text,
  add column if not exists valid_from date,
  add column if not exists valid_to date,
  add column if not exists certificate_document_id uuid references public.product_documents(id) on delete set null,
  add column if not exists source_url text,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists product_certifications_validity_idx on public.product_certifications (product_id, status, valid_to);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  website text,
  country_code text,
  supplier_type text,
  external_identifiers jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table if not exists public.attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  key text not null,
  name text not null,
  description text,
  value_type text not null check (value_type in ('text','number','boolean','enum','json')),
  default_unit text,
  allowed_units jsonb not null default '[]'::jsonb,
  allowed_values jsonb not null default '[]'::jsonb,
  is_required_for_matching boolean not null default false,
  is_filterable boolean not null default false,
  is_comparable boolean not null default false,
  normalization_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, key)
);

create table if not exists public.product_attribute_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  attribute_definition_id uuid not null references public.attribute_definitions(id) on delete restrict,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_json jsonb,
  unit text,
  normalized_value jsonb,
  source_document_id uuid references public.product_documents(id) on delete set null,
  source_reference text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','ai_extracted','manufacturer_verified','manually_verified','disputed','expired')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(product_id, product_variant_id) = 1),
  check (num_nonnulls(value_text, value_number, value_boolean, value_json) <= 1)
);

create unique index if not exists product_attribute_values_product_uidx
  on public.product_attribute_values (product_id, attribute_definition_id)
  where product_id is not null;
create unique index if not exists product_attribute_values_variant_uidx
  on public.product_attribute_values (product_variant_id, attribute_definition_id)
  where product_variant_id is not null;

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  supplier_sku text not null,
  supplier_product_name text,
  package_quantity numeric check (package_quantity is null or package_quantity > 0),
  minimum_order_quantity numeric check (minimum_order_quantity is null or minimum_order_quantity > 0),
  order_unit text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(product_id, product_variant_id) = 1),
  unique (supplier_id, supplier_sku)
);

create table if not exists public.supplier_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  supplier_product_id uuid not null references public.supplier_products(id) on delete cascade,
  price numeric(18,4) check (price is null or price >= 0),
  currency_code char(3),
  price_unit text,
  stock_quantity numeric check (stock_quantity is null or stock_quantity >= 0),
  stock_status text,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  valid_from timestamptz,
  valid_to timestamptz,
  source_timestamp timestamptz,
  source_type text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create index if not exists supplier_offers_org_validity_idx on public.supplier_offers (organization_id, supplier_product_id, valid_to desc, created_at desc);

create table if not exists public.catalog_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  import_type text not null,
  filename text not null,
  status text not null default 'queued' check (status in ('queued','validating','dry_run','running','completed','failed','cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  successful_rows integer not null default 0 check (successful_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_import_errors (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.catalog_imports(id) on delete cascade,
  row_number integer,
  error_code text not null,
  error_message text not null,
  raw_row jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Compatibility, matching, commercial scenarios, material list versions
-- ---------------------------------------------------------------------------

create table if not exists public.compatibility_rule_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  category_id uuid references public.categories(id) on delete set null,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version)
);

create table if not exists public.compatibility_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.compatibility_rule_sets(id) on delete cascade,
  rule_code text not null,
  name text not null,
  description text,
  severity text not null default 'error' check (severity in ('info','warning','error','critical')),
  rule_type text not null,
  conditions jsonb not null default '{}'::jsonb,
  outcome text not null default 'fail' check (outcome in ('pass','fail','unknown','not_applicable')),
  error_message text,
  is_active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_set_id, rule_code)
);

create table if not exists public.compatibility_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  match_run_id uuid,
  rule_id uuid references public.compatibility_rules(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  result text not null check (result in ('pass','fail','unknown','not_applicable')),
  details jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.match_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement_set_id uuid references public.requirement_sets(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  technical_gate_status text check (technical_gate_status in ('pass','fail','unknown','not_applicable','requires_review')),
  ranking_version text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.compatibility_evaluations
  add constraint compatibility_evaluations_match_run_fk
  foreign key (match_run_id) references public.match_runs(id) on delete cascade;

create table if not exists public.match_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  match_run_id uuid not null references public.match_runs(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  technical_result text not null default 'unknown' check (technical_result in ('pass','fail','unknown','not_applicable')),
  review_status text not null default 'requires_review' check (review_status in ('eligible','rejected','requires_review')),
  ranking_score numeric(10,4),
  ranking_factors jsonb not null default '{}'::jsonb,
  commercial_factors jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.requirement_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  match_run_id uuid not null references public.match_runs(id) on delete cascade,
  match_candidate_id uuid not null references public.match_candidates(id) on delete cascade,
  requirement_id uuid references public.project_requirements(id) on delete set null,
  result text not null check (result in ('pass','fail','unknown','not_applicable')),
  is_mandatory boolean not null default false,
  evidence jsonb not null default '[]'::jsonb,
  explanation text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.commercial_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  weights jsonb not null default '{}'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.material_list_items
  add column if not exists material_list_version_id uuid,
  add column if not exists selected boolean not null default true,
  add column if not exists unit_price numeric(18,4),
  add column if not exists currency_code char(3),
  add column if not exists technical_status text not null default 'unknown',
  add column if not exists compatibility_status text not null default 'unknown',
  add column if not exists override_reason text,
  add column if not exists source_match_candidate_id uuid;

create table if not exists public.material_list_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  material_list_id uuid not null references public.material_lists(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','under_review','approved','superseded','archived')),
  source_match_run_id uuid references public.match_runs(id) on delete set null,
  notes text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_list_id, version)
);

alter table public.material_list_items
  add constraint material_list_items_version_fk
  foreign key (material_list_version_id) references public.material_list_versions(id) on delete cascade;

create table if not exists public.material_list_item_alternatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  material_list_item_id uuid not null references public.material_list_items(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  reason text,
  technical_status text not null default 'unknown' check (technical_status in ('pass','fail','unknown','not_applicable')),
  ranking_score numeric(10,4),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  material_list_id uuid references public.material_lists(id) on delete set null,
  material_list_version_id uuid references public.material_list_versions(id) on delete set null,
  export_type text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  storage_bucket text,
  storage_path text,
  checksum text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.reference_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_project_id uuid references public.projects(id) on delete set null,
  name text not null,
  visibility text not null default 'private' check (visibility in ('private','organization','platform_anonymized')),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.reference_project_products (
  reference_project_id uuid not null references public.reference_projects(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  quantity numeric(14,3),
  notes text,
  primary key (reference_project_id, product_id, product_variant_id),
  check (num_nonnulls(product_id, product_variant_id) = 1)
);

create index if not exists match_candidates_run_idx on public.match_candidates (match_run_id, review_status, ranking_score desc);
create index if not exists requirement_evaluations_candidate_idx on public.requirement_evaluations (match_candidate_id, result);
create index if not exists material_list_versions_list_idx on public.material_list_versions (material_list_id, version desc);
create index if not exists exports_project_idx on public.exports (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrity helpers and audit trails
-- ---------------------------------------------------------------------------

create or replace function public.enforce_database_project_scope()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare project_org uuid;
begin
  if new.project_id is not null then
    select organization_id into project_org from public.projects where id = new.project_id;
    if project_org is distinct from new.organization_id then
      raise exception 'Project and organization do not match.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.audit_database_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare row_org uuid; row_id uuid; action_name text;
begin
  if tg_op = 'DELETE' then row_org := old.organization_id; row_id := old.id;
  else row_org := new.organization_id; row_id := new.id; end if;
  if row_org is not null then
    action_name := lower(tg_table_name) || '.' || lower(tg_op);
    perform public.write_audit_log(row_org, action_name, tg_table_name, row_id,
      case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
      case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.validate_material_list_item_selection()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.quantity is null or new.quantity <= 0 then
    raise exception 'Material list quantity must be greater than zero.';
  end if;
  if new.selected and new.technical_status = 'fail' and nullif(btrim(coalesce(new.override_reason, '')), '') is null then
    raise exception 'A technically failed item requires an override reason before selection.';
  end if;
  if new.technical_status = 'pass' and new.compatibility_status = 'fail' and new.selected
     and nullif(btrim(coalesce(new.override_reason, '')), '') is null then
    raise exception 'A compatibility failure requires an override reason before selection.';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'document_pages','extraction_runs','requirement_sets','requirement_candidates',
    'categories','manufacturers','standards','product_certifications','suppliers',
    'attribute_definitions','product_attribute_values','supplier_products','supplier_offers',
    'compatibility_rule_sets','compatibility_rules','match_runs','match_candidates',
    'commercial_scenarios','material_list_versions','reference_projects'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
      execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
    end if;
  end loop;
end $$;

drop trigger if exists document_pages_enforce_scope on public.document_pages;
create trigger document_pages_enforce_scope before insert or update on public.document_pages for each row execute function public.enforce_database_project_scope();
drop trigger if exists extraction_runs_enforce_scope on public.extraction_runs;
create trigger extraction_runs_enforce_scope before insert or update on public.extraction_runs for each row execute function public.enforce_database_project_scope();
drop trigger if exists requirement_sets_enforce_scope on public.requirement_sets;
create trigger requirement_sets_enforce_scope before insert or update on public.requirement_sets for each row execute function public.enforce_database_project_scope();
drop trigger if exists requirement_candidates_enforce_scope on public.requirement_candidates;
create trigger requirement_candidates_enforce_scope before insert or update on public.requirement_candidates for each row execute function public.enforce_database_project_scope();
drop trigger if exists requirement_evidence_enforce_scope on public.requirement_evidence;
create trigger requirement_evidence_enforce_scope before insert or update on public.requirement_evidence for each row execute function public.enforce_database_project_scope();
drop trigger if exists match_runs_enforce_scope on public.match_runs;
create trigger match_runs_enforce_scope before insert or update on public.match_runs for each row execute function public.enforce_database_project_scope();
drop trigger if exists match_candidates_enforce_scope on public.match_candidates;
create trigger match_candidates_enforce_scope before insert or update on public.match_candidates for each row execute function public.enforce_database_project_scope();
drop trigger if exists commercial_scenarios_enforce_scope on public.commercial_scenarios;
create trigger commercial_scenarios_enforce_scope before insert or update on public.commercial_scenarios for each row execute function public.enforce_database_project_scope();
drop trigger if exists material_list_versions_enforce_scope on public.material_list_versions;
create trigger material_list_versions_enforce_scope before insert or update on public.material_list_versions for each row execute function public.enforce_database_project_scope();
drop trigger if exists reference_projects_enforce_scope on public.reference_projects;
create trigger reference_projects_enforce_scope before insert or update on public.reference_projects for each row execute function public.enforce_database_project_scope();
drop trigger if exists material_list_items_validate_selection on public.material_list_items;
create trigger material_list_items_validate_selection before insert or update on public.material_list_items for each row execute function public.validate_material_list_item_selection();

do $$
declare t text;
begin
  foreach t in array array['extraction_runs','requirement_sets','requirement_candidates','commercial_scenarios','material_list_versions','exports','reference_projects'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_database_change()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS: tenant tables, global catalog reads, and private offers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'document_pages','extraction_runs','requirement_sets','requirement_candidates','requirement_evidence',
    'product_attribute_values','supplier_offers','catalog_imports','catalog_import_errors',
    'compatibility_evaluations','match_runs','match_candidates','requirement_evaluations',
    'commercial_scenarios','material_list_versions','material_list_item_alternatives','exports',
    'reference_projects','reference_project_products'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- project-scoped read/write policies
drop policy if exists document_pages_select on public.document_pages;
create policy document_pages_select on public.document_pages for select to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, 'document.view'));
drop policy if exists document_pages_insert on public.document_pages;
create policy document_pages_insert on public.document_pages for insert to authenticated with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'document.upload'));
drop policy if exists extraction_runs_select on public.extraction_runs;
create policy extraction_runs_select on public.extraction_runs for select to authenticated using ((project_id is null and public.is_organization_member(organization_id)) or (project_id is not null and public.can_access_project(project_id)));
drop policy if exists extraction_runs_insert on public.extraction_runs;
create policy extraction_runs_insert on public.extraction_runs for insert to authenticated with check ((created_by = auth.uid() or created_by is null) and (project_id is null or public.can_access_project(project_id)) and public.has_permission(organization_id, 'analysis.create'));
drop policy if exists extraction_runs_update on public.extraction_runs;
create policy extraction_runs_update on public.extraction_runs for update to authenticated using (public.is_organization_member(organization_id) and public.has_permission(organization_id, 'analysis.update')) with check (public.is_organization_member(organization_id) and public.has_permission(organization_id, 'analysis.update'));

drop policy if exists requirement_sets_select on public.requirement_sets;
create policy requirement_sets_select on public.requirement_sets for select to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.view'));
drop policy if exists requirement_sets_insert on public.requirement_sets;
create policy requirement_sets_insert on public.requirement_sets for insert to authenticated with check ((created_by = auth.uid() or created_by is null) and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.create'));
drop policy if exists requirement_sets_update on public.requirement_sets;
create policy requirement_sets_update on public.requirement_sets for update to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.update')) with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.update'));

drop policy if exists requirement_candidates_select on public.requirement_candidates;
create policy requirement_candidates_select on public.requirement_candidates for select to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.view'));
drop policy if exists requirement_candidates_insert on public.requirement_candidates;
create policy requirement_candidates_insert on public.requirement_candidates for insert to authenticated with check ((created_by = auth.uid() or created_by is null) and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.create'));
drop policy if exists requirement_candidates_update on public.requirement_candidates;
create policy requirement_candidates_update on public.requirement_candidates for update to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.update')) with check (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.update'));

drop policy if exists requirement_evidence_select on public.requirement_evidence;
create policy requirement_evidence_select on public.requirement_evidence for select to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.view'));
drop policy if exists requirement_evidence_insert on public.requirement_evidence;
create policy requirement_evidence_insert on public.requirement_evidence for insert to authenticated with check ((created_by = auth.uid() or created_by is null) and public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.create'));

do $$
declare spec record;
begin
  for spec in select * from (values
    ('compatibility_evaluations','project.product_suggestion.view','project.product_suggestion.create'),
    ('match_runs','project.product_suggestion.view','project.product_suggestion.create'),
    ('match_candidates','project.product_suggestion.view','project.product_suggestion.create'),
    ('requirement_evaluations','project.product_suggestion.view','project.product_suggestion.create'),
    ('commercial_scenarios','project.settings.view','project.settings.update'),
    ('exports','material_list.view','material_list.create')
  ) as x(table_name, read_permission, write_permission) loop
    execute format('drop policy if exists %I_select on public.%I', spec.table_name, spec.table_name);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, %L))', spec.table_name, spec.table_name, spec.read_permission);
    execute format('drop policy if exists %I_insert on public.%I', spec.table_name, spec.table_name);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check ((created_by = auth.uid() or created_by is null) and public.can_access_project(project_id) and public.has_permission(organization_id, %L))', spec.table_name, spec.table_name, spec.write_permission);
  end loop;
end $$;

drop policy if exists material_list_versions_select on public.material_list_versions;
create policy material_list_versions_select on public.material_list_versions for select to authenticated
using (exists (select 1 from public.material_lists ml where ml.id = material_list_id and public.can_access_project(ml.project_id) and public.has_permission(public.material_list_versions.organization_id, 'material_list.view')));
drop policy if exists material_list_versions_insert on public.material_list_versions;
create policy material_list_versions_insert on public.material_list_versions for insert to authenticated
with check ((created_by = auth.uid() or created_by is null) and exists (select 1 from public.material_lists ml where ml.id = material_list_id and public.can_access_project(ml.project_id) and public.has_permission(public.material_list_versions.organization_id, 'material_list.create')));
drop policy if exists material_list_versions_update on public.material_list_versions;
create policy material_list_versions_update on public.material_list_versions for update to authenticated
using (exists (select 1 from public.material_lists ml where ml.id = material_list_id and public.can_access_project(ml.project_id) and public.has_permission(public.material_list_versions.organization_id, 'material_list.update')))
with check (exists (select 1 from public.material_lists ml where ml.id = material_list_id and public.can_access_project(ml.project_id) and public.has_permission(public.material_list_versions.organization_id, 'material_list.update')));

drop policy if exists material_list_item_alternatives_select on public.material_list_item_alternatives;
create policy material_list_item_alternatives_select on public.material_list_item_alternatives for select to authenticated
using (exists (select 1 from public.material_list_items i join public.material_lists ml on ml.id = i.material_list_id where i.id = material_list_item_id and public.can_access_project(ml.project_id) and public.has_permission(public.material_list_item_alternatives.organization_id, 'material_list.view')));
drop policy if exists material_list_item_alternatives_insert on public.material_list_item_alternatives;
create policy material_list_item_alternatives_insert on public.material_list_item_alternatives for insert to authenticated
with check ((created_by = auth.uid() or created_by is null) and exists (select 1 from public.material_list_items i join public.material_lists ml on ml.id = i.material_list_id where i.id = material_list_item_id and public.can_access_project(ml.project_id) and public.has_permission(public.material_list_item_alternatives.organization_id, 'material_list.update')));

drop policy if exists product_attribute_values_select on public.product_attribute_values;
create policy product_attribute_values_select on public.product_attribute_values for select to authenticated using (true);
drop policy if exists supplier_offers_select on public.supplier_offers;
create policy supplier_offers_select on public.supplier_offers for select to authenticated using (public.is_organization_member(organization_id));
drop policy if exists supplier_offers_insert on public.supplier_offers;
create policy supplier_offers_insert on public.supplier_offers for insert to authenticated with check (public.has_permission(organization_id, 'product.import'));
drop policy if exists supplier_offers_update on public.supplier_offers;
create policy supplier_offers_update on public.supplier_offers for update to authenticated using (public.has_permission(organization_id, 'product.import')) with check (public.has_permission(organization_id, 'product.import'));

drop policy if exists catalog_imports_select on public.catalog_imports;
create policy catalog_imports_select on public.catalog_imports for select to authenticated using (organization_id is null or public.is_organization_member(organization_id));
drop policy if exists catalog_imports_insert on public.catalog_imports;
create policy catalog_imports_insert on public.catalog_imports for insert to authenticated with check ((organization_id is null or public.has_permission(organization_id, 'product.import')) and (created_by = auth.uid() or created_by is null));
drop policy if exists catalog_import_errors_select on public.catalog_import_errors;
create policy catalog_import_errors_select on public.catalog_import_errors for select to authenticated using (exists (select 1 from public.catalog_imports i where i.id = import_id and (i.organization_id is null or public.is_organization_member(i.organization_id))));

drop policy if exists reference_projects_select on public.reference_projects;
create policy reference_projects_select on public.reference_projects for select to authenticated using (public.is_organization_member(organization_id) and deleted_at is null);
drop policy if exists reference_projects_insert on public.reference_projects;
create policy reference_projects_insert on public.reference_projects for insert to authenticated with check ((created_by = auth.uid() or created_by is null) and public.has_permission(organization_id, 'project.create'));
drop policy if exists reference_projects_update on public.reference_projects;
create policy reference_projects_update on public.reference_projects for update to authenticated using (public.has_permission(organization_id, 'project.update')) with check (public.has_permission(organization_id, 'project.update'));
drop policy if exists reference_project_products_select on public.reference_project_products;
create policy reference_project_products_select on public.reference_project_products for select to authenticated using (exists (select 1 from public.reference_projects r where r.id = reference_project_id and public.is_organization_member(r.organization_id)));
drop policy if exists reference_project_products_insert on public.reference_project_products;
create policy reference_project_products_insert on public.reference_project_products for insert to authenticated with check (exists (select 1 from public.reference_projects r where r.id = reference_project_id and public.has_permission(r.organization_id, 'project.update')));

-- Restrict catalog writes to the backend/service role. Authenticated users may
-- only see approved/active global technical products.
alter table public.products enable row level security;
drop policy if exists products_authenticated_select on public.products;
create policy products_authenticated_select on public.products for select to authenticated using (status::text in ('approved','active') and deleted_at is null);
alter table public.product_variants enable row level security;
drop policy if exists product_variants_authenticated_select on public.product_variants;
create policy product_variants_authenticated_select on public.product_variants for select to authenticated using (technical_status::text in ('verified','approved','active') and deleted_at is null);
alter table public.categories enable row level security;
drop policy if exists categories_authenticated_select on public.categories;
create policy categories_authenticated_select on public.categories for select to authenticated using (is_active);
alter table public.manufacturers enable row level security;
drop policy if exists manufacturers_authenticated_select on public.manufacturers;
create policy manufacturers_authenticated_select on public.manufacturers for select to authenticated using (is_active);
alter table public.standards enable row level security;
drop policy if exists standards_authenticated_select on public.standards;
create policy standards_authenticated_select on public.standards for select to authenticated using (valid_to is null or valid_to >= current_date);
alter table public.certifications enable row level security;
drop policy if exists certifications_authenticated_select on public.certifications;
create policy certifications_authenticated_select on public.certifications for select to authenticated using (true);
alter table public.product_documents enable row level security;
drop policy if exists product_documents_authenticated_select on public.product_documents;
create policy product_documents_authenticated_select on public.product_documents for select to authenticated using (is_current);

grant select on public.document_pages, public.extraction_runs, public.requirement_sets, public.requirement_candidates, public.requirement_evidence, public.product_attribute_values, public.supplier_offers, public.catalog_imports, public.catalog_import_errors, public.compatibility_evaluations, public.match_runs, public.match_candidates, public.requirement_evaluations, public.commercial_scenarios, public.material_list_versions, public.material_list_item_alternatives, public.exports, public.reference_projects, public.reference_project_products to authenticated;
grant insert, update on public.document_pages, public.extraction_runs, public.requirement_sets, public.requirement_candidates, public.requirement_evidence, public.product_attribute_values, public.supplier_offers, public.catalog_imports, public.compatibility_evaluations, public.match_runs, public.match_candidates, public.requirement_evaluations, public.commercial_scenarios, public.material_list_versions, public.material_list_item_alternatives, public.exports, public.reference_projects, public.reference_project_products to authenticated;
revoke insert, update, delete on public.products, public.product_variants, public.categories, public.manufacturers, public.standards, public.certifications, public.product_documents, public.product_attribute_values from authenticated;

-- Storage is private and uses organization/project/document path segments.
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do update set public = false;

drop policy if exists project_files_select on storage.objects;
create policy project_files_select on storage.objects for select to authenticated
using (bucket_id = 'project-files' and (storage.foldername(name))[1] is not null and public.is_organization_member(((storage.foldername(name))[1])::uuid));
drop policy if exists project_files_insert on storage.objects;
create policy project_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'project-files' and (storage.foldername(name))[1] is not null and public.is_organization_member(((storage.foldername(name))[1])::uuid));
drop policy if exists project_files_update on storage.objects;
create policy project_files_update on storage.objects for update to authenticated
using (bucket_id = 'project-files' and public.is_organization_member(((storage.foldername(name))[1])::uuid))
with check (bucket_id = 'project-files' and public.is_organization_member(((storage.foldername(name))[1])::uuid));
drop policy if exists project_files_delete on storage.objects;
create policy project_files_delete on storage.objects for delete to authenticated
using (bucket_id = 'project-files' and public.is_organization_member(((storage.foldername(name))[1])::uuid) and public.has_permission(((storage.foldername(name))[1])::uuid, 'document.delete'));

-- SECURITY DEFINER helpers are callable only from trusted database paths.
revoke all on function public.enforce_database_project_scope() from public, anon, authenticated;
revoke all on function public.audit_database_change() from public, anon, authenticated;
revoke all on function public.validate_material_list_item_selection() from public, anon, authenticated;

comment on table public.project_documents is 'Project-owned document metadata. Global product source documents remain in public.documents.';
comment on table public.project_requirements is 'Confirmed/reviewed project requirements. AI candidates are stored separately in requirement_candidates.';
comment on table public.products is 'Global technical product catalog; organization-specific commercial data belongs in supplier_offers.';
comment on table public.supplier_offers is 'Organization-scoped supplier prices and availability; never expose cross-tenant.';
