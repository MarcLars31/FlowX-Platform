-- Reproducible baseline for the product schema that originally lived in the
-- standalone PDF Extractor repository. This migration intentionally contains
-- schema only; demo/reference rows belong in supabase/seed.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_review_status') then
    create type public.product_review_status as enum (
      'needs_review',
      'approved',
      'rejected',
      'duplicate'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'extraction_job_status') then
    create type public.extraction_job_status as enum (
      'pending',
      'processing',
      'completed',
      'failed'
    );
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  supplier text,
  status public.extraction_job_status not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  constraint extraction_jobs_completion_consistent check (
    completed_at is null or status in ('completed', 'failed')
  )
);

create table if not exists public.extraction_raw_lines (
  id uuid primary key default gen_random_uuid(),
  extraction_job_id uuid not null references public.extraction_jobs(id) on delete cascade,
  page_number integer not null,
  raw_text text not null,
  created_at timestamptz not null default now(),
  constraint extraction_raw_lines_page_number_positive check (page_number > 0)
);

create table if not exists public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  country text,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manufacturers_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.categories(id) on delete set null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (btrim(name) <> ''),
  constraint categories_name_parent_unique unique nulls not distinct (name, parent_id),
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null,
  product_no text not null,
  product_name text not null,
  category text,
  sub_category text,
  connection_type text,
  material text,
  available_sizes text,
  source_document text,
  source_page integer,
  status public.product_review_status not null default 'needs_review',
  raw_text text,
  extraction_job_id uuid references public.extraction_jobs(id) on delete set null,
  confidence_score numeric(5, 4),
  reviewed_by text,
  reviewed_at timestamptz,
  duplicate_of_product_id uuid references public.products(id) on delete set null,
  review_notes text,
  manufacturer_id uuid references public.manufacturers(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_source_page_positive check (source_page is null or source_page > 0),
  constraint products_confidence_score_range check (
    confidence_score is null or confidence_score between 0 and 1
  ),
  constraint products_manufacturer_not_blank check (btrim(manufacturer) <> ''),
  constraint products_product_no_not_blank check (btrim(product_no) <> ''),
  constraint products_product_name_not_blank check (btrim(product_name) <> ''),
  constraint products_not_own_duplicate check (
    duplicate_of_product_id is null or duplicate_of_product_id <> id
  ),
  constraint products_manufacturer_product_no_unique unique (manufacturer, product_no)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  nominal_size text,
  dn_size text,
  outside_diameter_mm numeric(10, 2),
  c_to_e_mm numeric(10, 2),
  weight_kg numeric(10, 3),
  raw_text text,
  source_document text,
  source_page integer,
  extraction_job_id uuid references public.extraction_jobs(id) on delete set null,
  confidence_score numeric(5, 4),
  status public.product_review_status not null default 'needs_review',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_source_page_positive check (source_page is null or source_page > 0),
  constraint product_variants_confidence_score_range check (
    confidence_score is null or confidence_score between 0 and 1
  ),
  constraint product_variants_measurements_non_negative check (
    (outside_diameter_mm is null or outside_diameter_mm >= 0)
    and (c_to_e_mm is null or c_to_e_mm >= 0)
    and (weight_kg is null or weight_kg >= 0)
  )
);

create table if not exists public.certifications (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certifications_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.product_certifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  certification_id uuid not null references public.certifications(id) on delete restrict,
  approval_text text,
  source_document text,
  source_page integer,
  raw_text text,
  extraction_job_id uuid references public.extraction_jobs(id) on delete set null,
  confidence_score numeric(5, 4),
  status public.product_review_status not null default 'needs_review',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_certifications_source_page_positive check (
    source_page is null or source_page > 0
  ),
  constraint product_certifications_confidence_score_range check (
    confidence_score is null or confidence_score between 0 and 1
  ),
  constraint product_certifications_unique unique (product_id, certification_id)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid references public.manufacturers(id) on delete set null,
  document_number text,
  title text not null,
  document_type text,
  version text,
  published_date date,
  revision_date date,
  source_url text,
  file_path text,
  status public.product_review_status not null default 'needs_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_title_not_blank check (btrim(title) <> ''),
  constraint documents_number_manufacturer_unique
    unique nulls not distinct (manufacturer_id, document_number)
);

create table if not exists public.standards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  region text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint standards_code_not_blank check (btrim(code) <> '')
);

create table if not exists public.product_synonyms (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  synonym text not null,
  language text,
  source text,
  raw_text text,
  source_page integer,
  source_document text,
  extraction_job_id uuid references public.extraction_jobs(id) on delete set null,
  confidence_score numeric(5, 4),
  status public.product_review_status not null default 'needs_review',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_synonyms_not_blank check (btrim(synonym) <> ''),
  constraint product_synonyms_source_page_positive check (source_page is null or source_page > 0),
  constraint product_synonyms_confidence_score_range check (
    confidence_score is null or confidence_score between 0 and 1
  ),
  constraint product_synonyms_unique unique nulls not distinct (product_id, synonym, language)
);

create table if not exists public.product_relationships (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  related_product_id uuid not null references public.products(id) on delete cascade,
  relationship_type text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint product_relationships_not_self check (product_id <> related_product_id),
  constraint product_relationships_type_not_blank check (btrim(relationship_type) <> ''),
  constraint product_relationships_unique unique (
    product_id,
    related_product_id,
    relationship_type
  )
);

create table if not exists public.product_documents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  source_page integer,
  source_text text,
  raw_text text,
  extraction_job_id uuid references public.extraction_jobs(id) on delete set null,
  confidence_score numeric(5, 4),
  status public.product_review_status not null default 'needs_review',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_documents_source_page_positive check (source_page is null or source_page > 0),
  constraint product_documents_confidence_score_range check (
    confidence_score is null or confidence_score between 0 and 1
  ),
  constraint product_documents_unique unique nulls not distinct (
    product_id,
    document_id,
    source_page
  )
);

create table if not exists public.product_standards (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  standard_id uuid not null references public.standards(id) on delete restrict,
  approval_text text,
  source_document text,
  source_page integer,
  raw_text text,
  extraction_job_id uuid references public.extraction_jobs(id) on delete set null,
  confidence_score numeric(5, 4),
  status public.product_review_status not null default 'needs_review',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_standards_source_page_positive check (source_page is null or source_page > 0),
  constraint product_standards_confidence_score_range check (
    confidence_score is null or confidence_score between 0 and 1
  ),
  constraint product_standards_unique unique (product_id, standard_id)
);

create table if not exists public.product_datasheet_imports (
  id uuid primary key default gen_random_uuid(),
  extraction_job_id uuid references public.extraction_jobs(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  schema_version text not null default '1.0',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint product_datasheet_imports_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint product_datasheet_imports_required_sections check (
    payload ?& array['products', 'accessories', 'documentInfo']
    and jsonb_typeof(payload -> 'products') = 'array'
    and jsonb_typeof(payload -> 'accessories') = 'array'
    and jsonb_typeof(payload -> 'documentInfo') = 'object'
  )
);

create table if not exists public.accessories (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  extraction_job_id uuid references public.extraction_jobs(id) on delete set null,
  name text not null,
  part_number text,
  status public.product_review_status not null default 'needs_review',
  confidence_score numeric(5, 4),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accessories_name_not_blank check (btrim(name) <> ''),
  constraint accessories_confidence_score_range check (
    confidence_score is null or confidence_score between 0 and 1
  ),
  constraint accessories_document_name_part_unique
    unique nulls not distinct (document_id, name, part_number)
);

create table if not exists public.accessory_product_compatibility (
  accessory_id uuid not null references public.accessories(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  compatible_sin text not null,
  created_at timestamptz not null default now(),
  primary key (accessory_id, compatible_sin),
  constraint accessory_compatibility_sin_not_blank check (btrim(compatible_sin) <> '')
);

-- Older production installations already contain some of the legacy tables,
-- but not every lifecycle column from this reproducible baseline. CREATE TABLE
-- IF NOT EXISTS does not align an existing table, so add the non-destructive
-- columns required by the indexes and updated_at triggers explicitly.
alter table public.certifications
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.product_certifications
  add column if not exists updated_at timestamptz not null default now();
alter table public.product_documents
  add column if not exists updated_at timestamptz not null default now();
alter table public.product_relationships
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;
alter table public.product_standards
  add column if not exists updated_at timestamptz not null default now();
alter table public.product_synonyms
  add column if not exists updated_at timestamptz not null default now();
alter table public.product_variants
  add column if not exists updated_at timestamptz not null default now();

create index if not exists products_status_idx on public.products(status);
create index if not exists products_category_idx on public.products(category, sub_category);
create index if not exists products_manufacturer_id_idx on public.products(manufacturer_id);
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_extraction_job_id_idx on public.products(extraction_job_id);
create index if not exists product_variants_product_id_idx on public.product_variants(product_id);
create index if not exists product_variants_status_idx on public.product_variants(status);
create index if not exists product_certifications_product_id_idx on public.product_certifications(product_id);
create index if not exists product_certifications_status_idx on public.product_certifications(status);
create index if not exists extraction_jobs_supplier_idx on public.extraction_jobs(supplier);
create index if not exists extraction_raw_lines_job_page_idx on public.extraction_raw_lines(extraction_job_id, page_number);
create index if not exists documents_manufacturer_id_idx on public.documents(manufacturer_id);
create index if not exists documents_status_idx on public.documents(status);
create index if not exists categories_parent_id_idx on public.categories(parent_id);
create index if not exists product_synonyms_product_id_idx on public.product_synonyms(product_id);
create index if not exists product_relationships_product_id_idx on public.product_relationships(product_id) where deleted_at is null;
create index if not exists product_relationships_related_product_id_idx on public.product_relationships(related_product_id) where deleted_at is null;
create index if not exists product_documents_product_id_idx on public.product_documents(product_id);
create index if not exists product_documents_document_id_idx on public.product_documents(document_id);
create index if not exists product_standards_product_id_idx on public.product_standards(product_id);
create index if not exists product_standards_standard_id_idx on public.product_standards(standard_id);
create index if not exists product_datasheet_imports_job_idx on public.product_datasheet_imports(extraction_job_id);
create index if not exists product_datasheet_imports_document_idx on public.product_datasheet_imports(document_id);
create index if not exists accessories_document_idx on public.accessories(document_id);
create index if not exists accessories_job_idx on public.accessories(extraction_job_id);
create index if not exists accessories_status_idx on public.accessories(status);
create index if not exists accessory_compatibility_product_idx on public.accessory_product_compatibility(product_id);
create index if not exists accessory_compatibility_sin_idx on public.accessory_product_compatibility(compatible_sin);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'manufacturers',
    'categories',
    'products',
    'product_variants',
    'certifications',
    'product_certifications',
    'documents',
    'standards',
    'product_synonyms',
    'product_relationships',
    'product_documents',
    'product_standards',
    'accessories'
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

-- Preserve richer views in existing installations. PostgreSQL cannot use
-- CREATE OR REPLACE VIEW when the deployed view has additional columns.
do $$
begin
  if to_regclass('public.approved_products') is null then
    execute $view$
      create view public.approved_products
      with (security_invoker = true)
      as
      select
        product.id,
        product.manufacturer,
        manufacturer.name as manufacturer_name,
        product.product_no,
        product.product_name,
        product.category,
        product.sub_category,
        category.name as category_name,
        product.connection_type,
        product.material,
        product.available_sizes,
        product.source_document,
        product.source_page,
        product.created_at,
        product.updated_at
      from public.products product
      left join public.manufacturers manufacturer on manufacturer.id = product.manufacturer_id
      left join public.categories category on category.id = product.category_id
      where product.status = 'approved'
    $view$;
  end if;

  if to_regclass('public.pkms_review_queue') is null then
    execute $view$
      create view public.pkms_review_queue
      with (security_invoker = true)
      as
      select
        product.id,
        product.manufacturer,
        coalesce(manufacturer.name, product.manufacturer) as manufacturer_name,
        product.product_no,
        product.product_name,
        product.category,
        product.sub_category,
        product.connection_type,
        product.status,
        product.confidence_score,
        product.source_document,
        product.source_page,
        product.created_at
      from public.products product
      left join public.manufacturers manufacturer on manufacturer.id = product.manufacturer_id
      where product.status = 'needs_review'
    $view$;
  end if;
end
$$;

comment on table public.products is
  'Legacy-compatible canonical product table restored from the standalone PDF Extractor schema.';
comment on table public.product_datasheet_imports is
  'Lossless source payloads; normalized data is stored in product tables.';
