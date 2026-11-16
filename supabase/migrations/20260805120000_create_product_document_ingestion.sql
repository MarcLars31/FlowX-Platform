-- Product-datasheet ingestion and review foundation.
--
-- The existing global catalog remains canonical:
--   documents         = public supplier/manufacturer source documents
--   product_documents = many-to-many relation between products and documents
--   products / product_variants / product_attribute_values = approved catalog
--
-- This migration is deliberately additive. Raw extraction, internal errors and
-- review state remain service/admin-only; customers consume the sanitized views.

-- ---------------------------------------------------------------------------
-- Error taxonomy and configurable extraction vocabulary
-- ---------------------------------------------------------------------------

create table if not exists public.product_document_error_codes (
  code text primary key,
  admin_message text not null,
  is_retryable boolean not null default false,
  is_permanent boolean not null default false,
  created_at timestamptz not null default now(),
  check (not (is_retryable and is_permanent))
);

insert into public.product_document_error_codes (
  code,
  admin_message,
  is_retryable,
  is_permanent
)
values
  ('encrypted_pdf', 'PDF-filen är krypterad.', false, true),
  ('password_protected', 'PDF-filen kräver ett lösenord.', false, true),
  ('corrupt_file', 'PDF-filen är skadad.', false, true),
  ('invalid_pdf', 'Filen är inte en giltig PDF.', false, true),
  ('empty_document', 'Dokumentet saknar läsbart innehåll.', false, true),
  ('image_only_pdf', 'Dokumentet innehåller endast bilder och behöver OCR.', true, false),
  ('ocr_failed', 'OCR-tolkningen misslyckades.', true, false),
  ('text_extraction_failed', 'Texten kunde inte extraheras.', true, false),
  ('table_extraction_failed', 'En eller flera tabeller kunde inte extraheras.', true, false),
  ('unsupported_encoding', 'Dokumentets teckenkodning stöds inte.', false, true),
  ('timeout', 'Bearbetningen tog för lång tid.', true, false),
  ('out_of_memory', 'Bearbetningen fick slut på minne.', true, false),
  ('no_product_identifiers', 'Inga säkra produktidentifierare hittades.', false, true),
  ('no_products_found', 'Dokumentet kunde läsas men inga produkter hittades.', false, true),
  ('extractor_unavailable', 'PDF-läsaren är tillfälligt otillgänglig.', true, false),
  ('unknown_error', 'Ett okänt tekniskt fel inträffade.', true, false)
on conflict (code) do update
set admin_message = excluded.admin_message,
    is_retryable = excluded.is_retryable,
    is_permanent = excluded.is_permanent;

create table if not exists public.product_extraction_field_rules (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete cascade,
  manufacturer_id uuid references public.manufacturers(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  attribute_definition_id uuid references public.attribute_definitions(id) on delete set null,
  field_key text not null,
  target_scope text not null check (target_scope in ('product', 'variant', 'attribute')),
  terms text[] not null default '{}'::text[],
  matcher_config jsonb not null default '{}'::jsonb,
  normalization_config jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(field_key) <> ''),
  check (jsonb_typeof(matcher_config) = 'object'),
  check (jsonb_typeof(normalization_config) = 'object')
);

create unique index if not exists product_extraction_field_rules_scope_uidx
  on public.product_extraction_field_rules (
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(manufacturer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    field_key,
    target_scope
  );

-- Variant-specific fields that do not have a dedicated catalog column are
-- preserved here after an administrator approves them. Product-level dynamic
-- fields use the existing products.technical_data object.
alter table public.product_variants
  add column if not exists technical_data jsonb not null default '{}'::jsonb;

alter table public.product_variants
  drop constraint if exists product_variants_technical_data_object_check;
alter table public.product_variants
  add constraint product_variants_technical_data_object_check
  check (jsonb_typeof(technical_data) = 'object') not valid;
alter table public.product_variants
  validate constraint product_variants_technical_data_object_check;

-- ---------------------------------------------------------------------------
-- Canonical document metadata and current processing state
-- ---------------------------------------------------------------------------

alter table public.documents
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists supplier_name text,
  add column if not exists file_name text,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists canonical_url text,
  add column if not exists original_pdf_url text,
  add column if not exists source_page_url text,
  add column if not exists pdf_sha256 text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text,
  add column if not exists page_count integer,
  add column if not exists language_code text,
  add column if not exists etag text,
  add column if not exists source_last_modified text,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz,
  add column if not exists downloaded_at timestamptz,
  add column if not exists current_processing_status text not null default 'pending',
  add column if not exists current_error_code text references public.product_document_error_codes(code) on delete restrict,
  add column if not exists current_error_message text,
  add column if not exists failed_page_numbers integer[] not null default '{}'::integer[],
  add column if not exists identified_product_count integer not null default 0,
  add column if not exists updated_product_count integer not null default 0,
  add column if not exists failed_product_count integer not null default 0,
  add column if not exists processing_attempt_count integer not null default 0,
  add column if not exists max_automatic_retries integer not null default 3,
  add column if not exists last_processing_at timestamptz,
  add column if not exists reader_version text,
  add column if not exists manual_review_status text not null default 'not_required',
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

update public.documents
set file_name = coalesce(file_name, nullif(regexp_replace(coalesce(file_path, source_url, title), '^.*/', ''), '')),
    canonical_url = coalesce(canonical_url, source_url),
    original_pdf_url = coalesce(original_pdf_url, source_url),
    file_size_bytes = greatest(coalesce(file_size_bytes, 0), 0),
    page_count = greatest(coalesce(page_count, 0), 0),
    identified_product_count = greatest(coalesce(identified_product_count, 0), 0),
    updated_product_count = greatest(coalesce(updated_product_count, 0), 0),
    failed_product_count = greatest(coalesce(failed_product_count, 0), 0),
    processing_attempt_count = greatest(coalesce(processing_attempt_count, 0), 0)
where file_name is null
   or canonical_url is null
   or original_pdf_url is null
   or file_size_bytes < 0
   or page_count < 0
   or identified_product_count < 0
   or updated_product_count < 0
   or failed_product_count < 0
   or processing_attempt_count < 0;

alter table public.documents drop constraint if exists documents_processing_status_check;
alter table public.documents add constraint documents_processing_status_check
  check (current_processing_status in (
    'pending', 'processing', 'success', 'partial', 'no_products_found',
    'unreadable', 'failed'
  )) not valid;
alter table public.documents validate constraint documents_processing_status_check;

alter table public.documents drop constraint if exists documents_manual_review_status_check;
alter table public.documents add constraint documents_manual_review_status_check
  check (manual_review_status in ('not_required', 'required', 'in_review', 'resolved')) not valid;
alter table public.documents validate constraint documents_manual_review_status_check;

alter table public.documents drop constraint if exists documents_ingestion_counts_check;
alter table public.documents add constraint documents_ingestion_counts_check
  check (
    coalesce(file_size_bytes, 0) >= 0
    and coalesce(page_count, 0) >= 0
    and identified_product_count >= 0
    and updated_product_count >= 0
    and failed_product_count >= 0
    and processing_attempt_count >= 0
    and max_automatic_retries between 0 and 10
  ) not valid;
alter table public.documents validate constraint documents_ingestion_counts_check;

alter table public.documents drop constraint if exists documents_pdf_sha256_check;
alter table public.documents add constraint documents_pdf_sha256_check
  check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-fA-F]{64}$') not valid;
alter table public.documents validate constraint documents_pdf_sha256_check;

create unique index if not exists documents_pdf_sha256_uidx
  on public.documents (lower(pdf_sha256))
  where pdf_sha256 is not null and deleted_at is null;

create unique index if not exists documents_canonical_url_uidx
  on public.documents (lower(canonical_url))
  where canonical_url is not null and deleted_at is null;

create index if not exists documents_processing_queue_idx
  on public.documents (current_processing_status, last_processing_at desc, id)
  where deleted_at is null;

create index if not exists documents_failed_review_idx
  on public.documents (manual_review_status, current_error_code, last_processing_at desc)
  where current_processing_status in ('partial', 'no_products_found', 'unreadable', 'failed')
    and deleted_at is null;

-- Product datasheets use a dedicated private bucket. Files are opened through a
-- trusted backend that issues a short-lived signed URL; no client storage policy
-- is added here.
insert into storage.buckets (id, name, public)
values ('product-documents', 'product-documents', false)
on conflict (id) do update set public = false;

-- ---------------------------------------------------------------------------
-- Immutable attempt history and page-level extraction results
-- ---------------------------------------------------------------------------

create table if not exists public.product_document_processing_attempts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  attempt_number integer not null,
  idempotency_key text not null,
  trigger_type text not null default 'initial'
    check (trigger_type in ('initial', 'automatic_retry', 'manual_retry', 'reader_upgrade')),
  file_name text,
  supplier_name text,
  local_file_path text,
  original_pdf_url text,
  source_page_url text,
  pdf_sha256 text,
  file_size_bytes bigint,
  page_count integer,
  status text not null default 'pending'
    check (status in (
      'pending', 'processing', 'success', 'partial', 'no_products_found',
      'unreadable', 'failed'
    )),
  identified_product_count integer not null default 0,
  updated_product_count integer not null default 0,
  failed_product_count integer not null default 0,
  failed_row_count integer not null default 0,
  error_code text references public.product_document_error_codes(code) on delete restrict,
  admin_error_message text,
  technical_error_detail text,
  technical_stack_trace text,
  failed_page_numbers integer[] not null default '{}'::integer[],
  extraction_methods text[] not null default '{}'::text[],
  reader_version text not null,
  extraction_config_version text,
  raw_result jsonb,
  staged_result jsonb,
  staged_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  retry_after timestamptz,
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, attempt_number),
  unique (document_id, idempotency_key),
  check (attempt_number > 0),
  check (btrim(idempotency_key) <> ''),
  check (file_size_bytes is null or file_size_bytes >= 0),
  check (page_count is null or page_count >= 0),
  check (
    identified_product_count >= 0
    and updated_product_count >= 0
    and failed_product_count >= 0
    and failed_row_count >= 0
  ),
  check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-fA-F]{64}$'),
  check (jsonb_typeof(metrics) = 'object'),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index if not exists product_document_attempts_document_idx
  on public.product_document_processing_attempts (document_id, attempt_number desc);

create index if not exists product_document_attempts_failure_idx
  on public.product_document_processing_attempts (status, error_code, completed_at desc)
  where status in ('partial', 'no_products_found', 'unreadable', 'failed');

alter table public.product_document_processing_attempts
  drop constraint if exists product_document_attempts_result_consistency_check;
alter table public.product_document_processing_attempts
  add constraint product_document_attempts_result_consistency_check check (
    (
      status <> 'success'
      or (
        identified_product_count > 0
        and failed_product_count = 0
        and failed_row_count = 0
        and error_code is null
      )
    )
    and (status <> 'no_products_found' or identified_product_count = 0)
    and updated_product_count <= identified_product_count
  ) not valid;
alter table public.product_document_processing_attempts
  validate constraint product_document_attempts_result_consistency_check;

alter table public.documents
  add column if not exists current_processing_attempt_id uuid
    references public.product_document_processing_attempts(id) on delete set null;

create table if not exists public.product_document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  processing_attempt_id uuid not null references public.product_document_processing_attempts(id) on delete cascade,
  page_number integer not null,
  status text not null default 'success' check (status in ('success', 'partial', 'failed')),
  extraction_method text not null check (extraction_method in ('text', 'ocr', 'table', 'mixed', 'manual')),
  detected_language_code text,
  extracted_text text,
  extracted_tables jsonb not null default '[]'::jsonb,
  source_coordinates jsonb not null default '[]'::jsonb,
  error_code text references public.product_document_error_codes(code) on delete restrict,
  admin_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (processing_attempt_id, page_number),
  check (page_number > 0),
  check (jsonb_typeof(extracted_tables) = 'array'),
  check (jsonb_typeof(source_coordinates) = 'array')
);

create index if not exists product_document_pages_document_idx
  on public.product_document_pages (document_id, page_number, processing_attempt_id);

-- ---------------------------------------------------------------------------
-- Product/document many-to-many matching and field-level provenance
-- ---------------------------------------------------------------------------

alter table public.product_documents
  add column if not exists product_variant_id uuid references public.product_variants(id) on delete cascade,
  add column if not exists processing_attempt_id uuid references public.product_document_processing_attempts(id) on delete set null,
  add column if not exists page_numbers integer[] not null default '{}'::integer[],
  add column if not exists extracted_product_number text,
  add column if not exists match_method text,
  add column if not exists match_score numeric,
  add column if not exists verification_status text not null default 'needs_review',
  add column if not exists source_excerpt text,
  add column if not exists source_table_row jsonb,
  add column if not exists idempotency_key text,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.product_documents
set page_numbers = case
      when cardinality(page_numbers) > 0 then page_numbers
      when source_page is not null then array[source_page]
      else '{}'::integer[]
    end,
    match_score = coalesce(match_score, confidence_score),
    source_excerpt = coalesce(source_excerpt, source_text),
    verification_status = case
      when status::text in ('approved', 'verified', 'active') then 'verified'
      when status::text in ('rejected', 'deleted') then 'rejected'
      else coalesce(verification_status, 'needs_review')
    end,
    verified_by = coalesce(
      verified_by,
      case
        when reviewed_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then reviewed_by::uuid
        else null
      end
    ),
    verified_at = coalesce(verified_at, reviewed_at)
where cardinality(page_numbers) = 0
   or match_score is null
   or source_excerpt is null
   or verification_status = 'needs_review'
   or verified_by is null
   or verified_at is null;

alter table public.product_documents drop constraint if exists product_documents_match_score_check;
alter table public.product_documents add constraint product_documents_match_score_check
  check (match_score is null or (match_score >= 0 and match_score <= 1)) not valid;
alter table public.product_documents validate constraint product_documents_match_score_check;

alter table public.product_documents drop constraint if exists product_documents_verification_status_check;
alter table public.product_documents add constraint product_documents_verification_status_check
  check (verification_status in ('needs_review', 'verified', 'rejected', 'superseded')) not valid;
alter table public.product_documents validate constraint product_documents_verification_status_check;

create unique index if not exists product_documents_idempotency_uidx
  on public.product_documents (idempotency_key)
  where idempotency_key is not null;

with ranked_relations as (
  select id,
         row_number() over (
           partition by document_id, product_id,
             coalesce(product_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
           order by verified_at desc nulls last, reviewed_at desc nulls last, created_at desc, id desc
         ) as relation_rank
  from public.product_documents
  where is_current
)
update public.product_documents relation
set is_current = false,
    verification_status = case
      when relation.verification_status = 'verified' then 'superseded'
      else relation.verification_status
    end,
    updated_at = now()
from ranked_relations ranked
where relation.id = ranked.id
  and ranked.relation_rank > 1;

create unique index if not exists product_documents_current_relation_uidx
  on public.product_documents (
    document_id,
    product_id,
    coalesce(product_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where is_current;

create index if not exists product_documents_document_review_idx
  on public.product_documents (document_id, verification_status, match_score desc);

create table if not exists public.product_field_provenance (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  product_attribute_value_id uuid references public.product_attribute_values(id) on delete set null,
  document_id uuid not null references public.documents(id) on delete restrict,
  product_document_id uuid references public.product_documents(id) on delete set null,
  processing_attempt_id uuid references public.product_document_processing_attempts(id) on delete set null,
  field_key text not null,
  page_number integer,
  original_value text,
  normalized_value jsonb,
  extraction_method text not null check (extraction_method in ('text', 'ocr', 'table', 'mixed', 'manual')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  source_excerpt text,
  source_table_row jsonb,
  source_coordinates jsonb not null default '[]'::jsonb,
  source_priority integer not null default 100,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'rejected', 'disputed', 'superseded')),
  idempotency_key text not null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  extracted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (idempotency_key),
  check (btrim(field_key) <> ''),
  check (page_number is null or page_number > 0),
  check (jsonb_typeof(source_coordinates) = 'array')
);

create index if not exists product_field_provenance_product_idx
  on public.product_field_provenance (product_id, field_key, verification_status, source_priority, confidence desc)
  where product_id is not null;

create index if not exists product_field_provenance_variant_idx
  on public.product_field_provenance (product_variant_id, field_key, verification_status, source_priority, confidence desc)
  where product_variant_id is not null;

create index if not exists product_field_provenance_document_idx
  on public.product_field_provenance (document_id, page_number, created_at);

-- Manual locks are authoritative. Ingestion workers must check this table before
-- proposing or applying any update to a technical field.
create table if not exists public.product_field_locks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  field_key text not null,
  reason text,
  locked_by uuid not null references auth.users(id) on delete restrict,
  locked_at timestamptz not null default now(),
  unlocked_by uuid references auth.users(id) on delete set null,
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(product_id, product_variant_id) = 1),
  check (btrim(field_key) <> ''),
  check (unlocked_at is null or unlocked_at >= locked_at)
);

create unique index if not exists product_field_locks_active_product_uidx
  on public.product_field_locks (product_id, field_key)
  where product_id is not null and unlocked_at is null;

create unique index if not exists product_field_locks_active_variant_uidx
  on public.product_field_locks (product_variant_id, field_key)
  where product_variant_id is not null and unlocked_at is null;

create table if not exists public.product_change_proposals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  product_document_id uuid references public.product_documents(id) on delete set null,
  processing_attempt_id uuid references public.product_document_processing_attempts(id) on delete set null,
  provenance_id uuid references public.product_field_provenance(id) on delete set null,
  product_id uuid references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  proposal_kind text not null
    check (proposal_kind in ('create_product', 'link_document', 'update_field', 'add_attribute')),
  field_key text,
  existing_value jsonb,
  proposed_value jsonb not null,
  conflict_type text not null default 'none'
    check (conflict_type in (
      'none', 'value_changed', 'manual_lock', 'identifier_collision',
      'ambiguous_match', 'significant_change'
    )),
  significance text not null default 'normal'
    check (significance in ('low', 'normal', 'high', 'critical')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  source_priority integer not null default 100,
  auto_apply_eligible boolean not null default false,
  blocked_by_lock boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'applied', 'reverted', 'superseded')),
  idempotency_key text not null,
  review_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  applied_at timestamptz,
  reverted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  check (
    (proposal_kind = 'create_product' and num_nonnulls(product_id, product_variant_id) = 0)
    or
    (proposal_kind <> 'create_product' and num_nonnulls(product_id, product_variant_id) = 1)
  ),
  check (proposal_kind in ('create_product', 'link_document') or nullif(btrim(field_key), '') is not null),
  check (not blocked_by_lock or not auto_apply_eligible),
  check (jsonb_typeof(proposed_value) is not null),
  check (decided_at is null or decided_by is not null)
);

create index if not exists product_change_proposals_review_idx
  on public.product_change_proposals (status, significance desc, created_at, id);

create index if not exists product_change_proposals_product_idx
  on public.product_change_proposals (product_id, field_key, status, created_at desc)
  where product_id is not null;

create index if not exists product_change_proposals_variant_idx
  on public.product_change_proposals (product_variant_id, field_key, status, created_at desc)
  where product_variant_id is not null;

-- Append-only record of applied and reverted changes. The before/after snapshots
-- make rollback possible without relying on mutable product rows.
create table if not exists public.product_field_change_history (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.product_change_proposals(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  product_variant_id uuid references public.product_variants(id) on delete restrict,
  field_key text not null,
  action text not null check (action in ('applied', 'reverted')),
  before_value jsonb,
  after_value jsonb,
  provenance_id uuid references public.product_field_provenance(id) on delete set null,
  performed_by uuid references auth.users(id) on delete set null,
  performed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (num_nonnulls(product_id, product_variant_id) = 1),
  check (btrim(field_key) <> ''),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists product_field_change_history_action_uidx
  on public.product_field_change_history (proposal_id, action);

create index if not exists product_field_change_history_target_idx
  on public.product_field_change_history (
    coalesce(product_id, product_variant_id),
    field_key,
    performed_at desc
  );

create table if not exists public.product_document_review_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  processing_attempt_id uuid references public.product_document_processing_attempts(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  product_variant_id uuid references public.product_variants(id) on delete set null,
  product_document_id uuid references public.product_documents(id) on delete set null,
  change_proposal_id uuid references public.product_change_proposals(id) on delete set null,
  review_type text not null check (review_type in (
    'document_failure', 'partial_extraction', 'no_products', 'new_product',
    'product_match', 'field_change', 'conflict', 'locked_field'
  )),
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'approved', 'rejected', 'resolved')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  title text not null,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  candidate_payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  check (btrim(title) <> ''),
  check (jsonb_typeof(evidence) = 'object'),
  check (jsonb_typeof(candidate_payload) = 'object'),
  check (reviewed_at is null or reviewed_by is not null)
);

create index if not exists product_document_review_queue_idx
  on public.product_document_review_items (status, priority desc, created_at, id);

create index if not exists product_document_review_document_idx
  on public.product_document_review_items (document_id, status, created_at desc);

-- Global catalog ingestion cannot use organization-bound audit_logs. This
-- append-only log is intentionally separate and contains no customer tenant data.
create table if not exists public.product_ingestion_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'system'
    check (actor_type in ('user', 'platform_admin', 'service', 'system')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  processing_attempt_id uuid references public.product_document_processing_attempts(id) on delete set null,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (btrim(action) <> ''),
  check (btrim(entity_type) <> ''),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists product_ingestion_audit_entity_idx
  on public.product_ingestion_audit_events (entity_type, entity_id, created_at desc);

create index if not exists product_ingestion_audit_attempt_idx
  on public.product_ingestion_audit_events (processing_attempt_id, created_at)
  where processing_attempt_id is not null;

-- ---------------------------------------------------------------------------
-- Integrity, idempotency and lifecycle functions
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_product_ingestion()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_members member
      join public.roles role on role.id = member.role_id
      join public.role_permissions role_permission on role_permission.role_id = role.id
      join public.permissions permission on permission.id = role_permission.permission_id
      where member.user_id = auth.uid()
        and member.status = 'active'
        and permission.key = 'product.manage'
        and (role.organization_id is null or role.organization_id = member.organization_id)
    ),
    false
  );
$$;

create or replace function public.enforce_product_document_relation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  variant_product_id uuid;
begin
  if new.product_variant_id is not null then
    select variant.product_id
    into variant_product_id
    from public.product_variants variant
    where variant.id = new.product_variant_id;

    if variant_product_id is distinct from new.product_id then
      raise exception 'Product variant must belong to the linked product.';
    end if;
  end if;

  if exists (
    select 1
    from unnest(new.page_numbers) page_number
    where page_number <= 0
  ) then
    raise exception 'Product document page numbers must be positive.';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.product_id is distinct from old.product_id
      or new.document_id is distinct from old.document_id
      or new.product_variant_id is distinct from old.product_variant_id
    ) then
    raise exception 'Product document identity is immutable; supersede the relation instead.';
  end if;

  return new;
end;
$$;

create or replace function public.prepare_product_document_attempt()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  source_document public.documents%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.document_id::text, 0));

  select *
  into source_document
  from public.documents document
  where document.id = new.document_id
  for update;

  if not found or source_document.deleted_at is not null then
    raise exception 'Product document does not exist or has been deleted.';
  end if;

  if new.attempt_number is null or new.attempt_number <= 0 then
    select coalesce(max(attempt.attempt_number), 0) + 1
    into new.attempt_number
    from public.product_document_processing_attempts attempt
    where attempt.document_id = new.document_id;
  end if;

  new.file_name := coalesce(new.file_name, source_document.file_name);
  new.supplier_name := coalesce(new.supplier_name, source_document.supplier_name);
  new.local_file_path := coalesce(new.local_file_path, source_document.file_path);
  new.original_pdf_url := coalesce(new.original_pdf_url, source_document.original_pdf_url, source_document.source_url);
  new.source_page_url := coalesce(new.source_page_url, source_document.source_page_url);
  new.pdf_sha256 := coalesce(new.pdf_sha256, source_document.pdf_sha256);
  new.file_size_bytes := coalesce(new.file_size_bytes, source_document.file_size_bytes);
  new.page_count := coalesce(new.page_count, source_document.page_count);
  new.started_at := coalesce(new.started_at, case when new.status = 'processing' then now() else null end);
  new.updated_at := now();

  return new;
end;
$$;

create or replace function public.protect_product_document_attempt_history()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.status in ('success', 'partial', 'no_products_found', 'unreadable', 'failed') then
    raise exception 'Completed product document attempts are immutable; create a retry attempt.';
  end if;

  if new.document_id is distinct from old.document_id
    or new.attempt_number is distinct from old.attempt_number
    or new.idempotency_key is distinct from old.idempotency_key
    or new.reader_version is distinct from old.reader_version then
    raise exception 'Product document attempt identity is immutable.';
  end if;

  if old.status = 'processing' and new.status = 'pending' then
    raise exception 'A processing attempt cannot return to pending.';
  end if;

  new.updated_at := now();
  if new.status = 'processing' then
    new.started_at := coalesce(new.started_at, old.started_at, now());
  elsif new.status in ('success', 'partial', 'no_products_found', 'unreadable', 'failed') then
    new.started_at := coalesce(new.started_at, old.started_at, now());
    new.completed_at := coalesce(new.completed_at, now());
  end if;

  return new;
end;
$$;

create or replace function public.sync_product_document_processing_summary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_attempt_number integer;
begin
  select attempt.attempt_number
  into current_attempt_number
  from public.documents document
  left join public.product_document_processing_attempts attempt
    on attempt.id = document.current_processing_attempt_id
  where document.id = new.document_id;

  if current_attempt_number is null or new.attempt_number >= current_attempt_number then
    update public.documents
    set current_processing_attempt_id = new.id,
        current_processing_status = new.status,
        current_error_code = new.error_code,
        current_error_message = new.admin_error_message,
        failed_page_numbers = new.failed_page_numbers,
        identified_product_count = new.identified_product_count,
        updated_product_count = new.updated_product_count,
        failed_product_count = new.failed_product_count + new.failed_row_count,
        processing_attempt_count = greatest(processing_attempt_count, new.attempt_number),
        page_count = coalesce(new.page_count, page_count),
        file_size_bytes = coalesce(new.file_size_bytes, file_size_bytes),
        pdf_sha256 = coalesce(new.pdf_sha256, pdf_sha256),
        last_processing_at = coalesce(new.completed_at, new.started_at, new.created_at),
        reader_version = new.reader_version,
        manual_review_status = case
          when new.status in ('partial', 'no_products_found', 'unreadable', 'failed') then 'required'
          when new.status = 'success' then 'not_required'
          else manual_review_status
        end,
        updated_at = now()
    where id = new.document_id;
  end if;

  return new;
end;
$$;

create or replace function public.write_product_ingestion_audit_event(
  audited_action text,
  audited_entity_type text,
  audited_entity_id uuid,
  audited_processing_attempt_id uuid default null,
  audited_old_values jsonb default null,
  audited_new_values jsonb default null,
  audited_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  audit_id uuid := gen_random_uuid();
  audit_actor_type text := case
    when coalesce(auth.jwt() ->> 'role', '') = 'service_role' then 'service'
    when auth.uid() is null then 'system'
    when public.is_platform_admin() then 'platform_admin'
    else 'user'
  end;
begin
  if nullif(btrim(audited_action), '') is null
    or nullif(btrim(audited_entity_type), '') is null then
    raise exception 'Product ingestion audit action and entity type are required.';
  end if;

  insert into public.product_ingestion_audit_events (
    id,
    actor_user_id,
    actor_type,
    action,
    entity_type,
    entity_id,
    processing_attempt_id,
    old_values,
    new_values,
    metadata
  )
  values (
    audit_id,
    auth.uid(),
    audit_actor_type,
    audited_action,
    audited_entity_type,
    audited_entity_id,
    audited_processing_attempt_id,
    audited_old_values,
    audited_new_values,
    coalesce(audited_metadata, '{}'::jsonb)
  );

  return audit_id;
end;
$$;

create or replace function public.audit_product_ingestion_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  effective_row jsonb := coalesce(new_row, old_row);
  entity_id uuid;
  attempt_id uuid;
  possible_uuid text;
begin
  possible_uuid := effective_row ->> 'id';
  if possible_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    entity_id := possible_uuid::uuid;
  end if;

  possible_uuid := coalesce(
    effective_row ->> 'processing_attempt_id',
    case when tg_table_name = 'product_document_processing_attempts' then effective_row ->> 'id' end
  );
  if possible_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    attempt_id := possible_uuid::uuid;
  end if;

  perform public.write_product_ingestion_audit_event(
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    entity_id,
    attempt_id,
    old_row,
    new_row,
    jsonb_build_object('schema', tg_table_schema)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_product_ingestion_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Product ingestion history is append-only.';
end;
$$;

create or replace function public.enforce_product_document_page_scope()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  attempt_document_id uuid;
begin
  select attempt.document_id
  into attempt_document_id
  from public.product_document_processing_attempts attempt
  where attempt.id = new.processing_attempt_id;

  if attempt_document_id is distinct from new.document_id then
    raise exception 'Product document page and attempt must reference the same document.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_product_field_provenance_scope()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  relation_record record;
  attempt_document_id uuid;
  attribute_product_id uuid;
  attribute_variant_id uuid;
begin
  if new.product_document_id is not null then
    select relation.document_id, relation.product_id, relation.product_variant_id
    into relation_record
    from public.product_documents relation
    where relation.id = new.product_document_id;

    if relation_record.document_id is distinct from new.document_id
      or relation_record.product_id is distinct from new.product_id
      or (
        new.product_variant_id is not null
        and relation_record.product_variant_id is distinct from new.product_variant_id
      ) then
      raise exception 'Field provenance does not match its product-document relation.';
    end if;
  end if;

  if new.processing_attempt_id is not null then
    select attempt.document_id
    into attempt_document_id
    from public.product_document_processing_attempts attempt
    where attempt.id = new.processing_attempt_id;

    if attempt_document_id is distinct from new.document_id then
      raise exception 'Field provenance attempt must belong to the same document.';
    end if;
  end if;

  if new.product_attribute_value_id is not null then
    select value.product_id, value.product_variant_id
    into attribute_product_id, attribute_variant_id
    from public.product_attribute_values value
    where value.id = new.product_attribute_value_id;

    if (
      attribute_variant_id is not null
      and (
        attribute_variant_id is distinct from new.product_variant_id
        or not exists (
          select 1
          from public.product_variants variant
          where variant.id = attribute_variant_id
            and variant.product_id = new.product_id
        )
      )
    ) or (
      attribute_variant_id is null
      and (
        attribute_product_id is distinct from new.product_id
        or new.product_variant_id is not null
      )
    ) then
      raise exception 'Field provenance target does not match its attribute value.';
    end if;
  end if;

  if new.product_variant_id is not null and not exists (
    select 1
    from public.product_variants variant
    where variant.id = new.product_variant_id
      and variant.product_id = new.product_id
  ) then
    raise exception 'Field provenance variant must belong to its product.';
  end if;

  return new;
end;
$$;

create or replace function public.guard_product_change_proposal()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  has_active_lock boolean := false;
begin
  if lower(coalesce(new.field_key, '')) = any (array[
    'price', 'unit_price', 'purchase_price', 'sales_price', 'cost',
    'currency', 'currency_code', 'stock', 'stock_quantity', 'inventory',
    'inventory_quantity', 'lead_time', 'lead_time_days'
  ]) then
    raise exception 'Commercial price, stock and inventory fields cannot be updated from a datasheet.';
  end if;

  if new.field_key is not null and new.proposal_kind in ('update_field', 'add_attribute') then
    select exists (
      select 1
      from public.product_field_locks field_lock
      where field_lock.unlocked_at is null
        and field_lock.field_key = new.field_key
        and (
          (new.product_id is not null and field_lock.product_id = new.product_id)
          or
          (new.product_variant_id is not null and field_lock.product_variant_id = new.product_variant_id)
        )
    )
    into has_active_lock;

    if has_active_lock then
      new.blocked_by_lock := true;
      new.auto_apply_eligible := false;
      new.conflict_type := 'manual_lock';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and (
      new.document_id is distinct from old.document_id
      or new.product_id is distinct from old.product_id
      or new.product_variant_id is distinct from old.product_variant_id
      or new.proposal_kind is distinct from old.proposal_kind
      or new.field_key is distinct from old.field_key
      or new.idempotency_key is distinct from old.idempotency_key
    ) then
    raise exception 'Product change proposal identity is immutable.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Atomic and idempotent beginning of a reader attempt. Only the service role is
-- allowed to execute this RPC; the caller may preserve the requesting user ID.
create or replace function public.begin_product_document_processing(
  p_document_id uuid,
  p_trigger_type text,
  p_idempotency_key text,
  p_reader_version text,
  p_requested_by uuid default null
)
returns public.product_document_processing_attempts
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_attempt public.product_document_processing_attempts%rowtype;
  created_attempt public.product_document_processing_attempts%rowtype;
  latest_attempt public.product_document_processing_attempts%rowtype;
  permanent_failure boolean := false;
  automatic_retry_count integer := 0;
  allowed_automatic_retries integer := 0;
begin
  if nullif(btrim(p_idempotency_key), '') is null
    or nullif(btrim(p_reader_version), '') is null then
    raise exception 'Idempotency key and reader version are required.';
  end if;

  if p_trigger_type not in ('initial', 'automatic_retry', 'manual_retry', 'reader_upgrade') then
    raise exception 'Unsupported product document processing trigger type.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_document_id::text, 0));

  select attempt.*
  into existing_attempt
  from public.product_document_processing_attempts attempt
  where attempt.document_id = p_document_id
    and attempt.idempotency_key = p_idempotency_key;

  if found then
    return existing_attempt;
  end if;

  select attempt.*
  into latest_attempt
  from public.product_document_processing_attempts attempt
  where attempt.document_id = p_document_id
  order by attempt.attempt_number desc
  limit 1;

  if p_trigger_type = 'automatic_retry' and latest_attempt.id is not null then
    select document.max_automatic_retries,
           (
             select count(*)::integer
             from public.product_document_processing_attempts prior_attempt
             where prior_attempt.document_id = p_document_id
               and prior_attempt.trigger_type = 'automatic_retry'
           )
    into allowed_automatic_retries, automatic_retry_count
    from public.documents document
    where document.id = p_document_id
      and document.deleted_at is null;

    if automatic_retry_count >= allowed_automatic_retries then
      raise exception 'The maximum number of automatic retries has been reached.';
    end if;

    select coalesce(error_code.is_permanent, false)
    into permanent_failure
    from public.product_document_error_codes error_code
    where error_code.code = latest_attempt.error_code;

    if permanent_failure then
      raise exception 'Permanent PDF failures require a manual retry.';
    end if;

    if latest_attempt.retry_after is not null and latest_attempt.retry_after > now() then
      raise exception 'The automatic retry backoff period has not elapsed.';
    end if;
  end if;

  if latest_attempt.status in ('pending', 'processing') then
    raise exception 'The product document already has an active processing attempt.';
  end if;

  insert into public.product_document_processing_attempts (
    document_id,
    attempt_number,
    idempotency_key,
    trigger_type,
    status,
    reader_version,
    requested_by,
    started_at
  )
  values (
    p_document_id,
    0,
    p_idempotency_key,
    p_trigger_type,
    'processing',
    p_reader_version,
    p_requested_by,
    now()
  )
  returning * into created_attempt;

  return created_attempt;
end;
$$;

-- Atomically stages extractor output for review. Expected p_products shape:
-- [
--   {
--     "source_key": "stable-row-key",
--     "manufacturer": "Victaulic",
--     "product_no": "ABC-123",
--     "manufacturer_product_number": "ABC-123",
--     "gtin": "...",
--     "sku": "...",
--     "product_name": "...",
--     "variant_name": "...",
--     "confidence": 0.98,
--     "identifier_observed_in_source": true,
--     "page_numbers": [2, 3],
--     "source_excerpt": "...",
--     "fields": {
--       "k_factor": {
--         "original_value": "5.6",
--         "normalized_value": 56,
--         "page_number": 3,
--         "extraction_method": "table",
--         "confidence": 0.99
--       }
--     }
--   }
-- ]
--
-- Exact identifiers are matched in the mandated order. A new needs_review
-- product is created only with manufacturer + a strong unique identifier at
-- confidence >= 0.90. Technical changes remain proposals; commercial fields
-- are rejected and manual locks are honored by the proposal trigger.
create or replace function public.stage_product_document_extraction(
  p_attempt_id uuid,
  p_document_id uuid,
  p_products jsonb,
  p_document_info jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attempt public.product_document_processing_attempts%rowtype;
  candidate jsonb;
  field_entry record;
  field_payload jsonb;
  candidate_key text;
  candidate_manufacturer text;
  candidate_product_no text;
  candidate_model_no text;
  candidate_gtin text;
  candidate_sku text;
  candidate_product_name text;
  candidate_variant_name text;
  candidate_excerpt text;
  candidate_confidence numeric;
  candidate_identifier_observed boolean;
  candidate_page_numbers integer[];
  candidate_first_page integer;
  matched_product_id uuid;
  matched_variant_id uuid;
  matched_product public.products%rowtype;
  matched_variant public.product_variants%rowtype;
  matched_product_json jsonb;
  matched_variant_json jsonb;
  match_method text;
  match_count integer;
  candidate_product_created boolean;
  candidate_variant_created boolean;
  relation_id uuid;
  relation_key text;
  provenance_id uuid;
  proposal_id uuid;
  field_key text;
  original_value text;
  normalized_value jsonb;
  existing_value jsonb;
  field_confidence numeric;
  field_page_number integer;
  field_method text;
  field_target_variant_id uuid;
  identified_count integer := 0;
  matched_count integer := 0;
  created_count integer := 0;
  staged_count integer := 0;
  proposed_change_count integer := 0;
  failed_count integer := 0;
  stage_result jsonb;
begin
  if jsonb_typeof(p_products) <> 'array' then
    raise exception 'Product extractor payload must be a JSON array.';
  end if;

  if p_document_info is null or jsonb_typeof(p_document_info) <> 'object' then
    raise exception 'Product document information must be a JSON object.';
  end if;

  select processing_attempt.*
  into attempt
  from public.product_document_processing_attempts processing_attempt
  where processing_attempt.id = p_attempt_id
  for update;

  if attempt.id is null
    or attempt.document_id is distinct from p_document_id
    or attempt.status <> 'processing' then
    raise exception 'A matching active product document processing attempt is required.';
  end if;

  if attempt.staged_at is not null then
    return coalesce(attempt.staged_result, '{}'::jsonb);
  end if;

  update public.documents
  set title = coalesce(nullif(btrim(p_document_info ->> 'title'), ''), title),
      document_type = coalesce(nullif(btrim(p_document_info ->> 'document_type'), ''), document_type),
      language_code = coalesce(nullif(btrim(p_document_info ->> 'language_code'), ''), language_code),
      page_count = coalesce(
        case
          when p_document_info ->> 'page_count' ~ '^[0-9]+$'
            then (p_document_info ->> 'page_count')::integer
          else null
        end,
        page_count
      ),
      updated_at = now()
  where id = p_document_id
    and deleted_at is null;

  if not found then
    raise exception 'Product document not found.';
  end if;

  for candidate in
    select value from jsonb_array_elements(p_products)
  loop
    begin
      candidate_key := null;
      matched_product_id := null;
      matched_variant_id := null;
      candidate_product_created := false;
      candidate_variant_created := false;
      relation_id := null;
      provenance_id := null;
      proposal_id := null;

      if jsonb_typeof(candidate) <> 'object' then
        raise exception 'Product candidate must be a JSON object.';
      end if;

      candidate_manufacturer := nullif(btrim(candidate ->> 'manufacturer'), '');
      candidate_product_no := nullif(btrim(candidate ->> 'product_no'), '');
      candidate_model_no := coalesce(
        nullif(btrim(candidate ->> 'manufacturer_product_number'), ''),
        nullif(btrim(candidate ->> 'model_number'), '')
      );
      candidate_gtin := nullif(regexp_replace(coalesce(candidate ->> 'gtin', ''), '[^0-9]', '', 'g'), '');
      candidate_sku := coalesce(
        nullif(btrim(candidate ->> 'sku'), ''),
        nullif(btrim(candidate ->> 'manufacturer_sku'), '')
      );
      candidate_product_name := nullif(btrim(candidate ->> 'product_name'), '');
      candidate_variant_name := nullif(btrim(candidate ->> 'variant_name'), '');
      candidate_excerpt := nullif(candidate ->> 'source_excerpt', '');
      candidate_confidence := case
        when candidate ->> 'confidence' ~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
          then (candidate ->> 'confidence')::numeric
        else 0
      end;
      candidate_identifier_observed := coalesce(
        case
          when candidate ->> 'identifier_observed_in_source' in ('true', 'false')
            then (candidate ->> 'identifier_observed_in_source')::boolean
          else false
        end,
        false
      );
      candidate_key := coalesce(
        nullif(btrim(candidate ->> 'source_key'), ''),
        candidate_product_no,
        candidate_model_no,
        candidate_gtin,
        md5(candidate::text)
      );

      select coalesce(array_agg(page_number order by page_number), '{}'::integer[])
      into candidate_page_numbers
      from (
        select distinct value::integer as page_number
        from jsonb_array_elements_text(coalesce(candidate -> 'page_numbers', '[]'::jsonb)) page
        where value ~ '^[1-9][0-9]*$'
      ) pages;
      candidate_first_page := candidate_page_numbers[1];

      if candidate_manufacturer is null then
        raise exception 'A manufacturer is required for product matching.';
      end if;

      -- Serialize all candidates with the same supplier identifiers, including
      -- candidates arriving from different documents at the same time.
      perform pg_advisory_xact_lock(hashtextextended(
        lower(candidate_manufacturer) || '|' ||
        coalesce(lower(candidate_product_no), '') || '|' ||
        coalesce(lower(candidate_model_no), '') || '|' ||
        coalesce(candidate_gtin, '') || '|' ||
        coalesce(lower(candidate_sku), ''),
        1
      ));

      select count(distinct product.id)::integer
      into match_count
      from public.products product
      left join public.product_variants variant on variant.product_id = product.id
      where product.deleted_at is null
        and lower(btrim(product.manufacturer)) = lower(candidate_manufacturer)
        and (
          (candidate_product_no is not null and lower(btrim(product.product_no)) = lower(candidate_product_no))
          or
          (candidate_model_no is not null and lower(btrim(product.manufacturer_product_number)) = lower(candidate_model_no))
          or
          (candidate_gtin is not null and regexp_replace(coalesce(variant.gtin, ''), '[^0-9]', '', 'g') = candidate_gtin)
          or
          (candidate_sku is not null and lower(coalesce(variant.sku, variant.manufacturer_sku, '')) = lower(candidate_sku))
        );

      if match_count > 1 then
        insert into public.product_document_review_items (
          document_id,
          processing_attempt_id,
          review_type,
          priority,
          title,
          reason,
          evidence,
          candidate_payload,
          idempotency_key
        )
        values (
          p_document_id,
          p_attempt_id,
          'product_match',
          'high',
          'Flera produkter matchar samma identifierare',
          'Exakt matchning gav mer än en produkt och måste granskas manuellt.',
          jsonb_build_object('match_count', match_count, 'candidate_key', candidate_key),
          candidate,
          p_attempt_id::text || ':ambiguous:' || candidate_key
        )
        on conflict (idempotency_key) do nothing;

        failed_count := failed_count + 1;
        continue;
      end if;

      matched_product_id := null;
      matched_variant_id := null;
      match_method := null;

      select product.id,
             case
               when candidate_gtin is not null
                 and regexp_replace(coalesce(variant.gtin, ''), '[^0-9]', '', 'g') = candidate_gtin
                 then variant.id
               when candidate_sku is not null
                 and lower(coalesce(variant.sku, variant.manufacturer_sku, '')) = lower(candidate_sku)
                 then variant.id
               else null
             end,
             case
               when candidate_product_no is not null
                 and lower(btrim(product.product_no)) = lower(candidate_product_no)
                 then 'exact_manufacturer_product_number'
               when candidate_sku is not null
                 and lower(coalesce(variant.sku, variant.manufacturer_sku, '')) = lower(candidate_sku)
                 then 'exact_manufacturer_sku'
               when candidate_model_no is not null
                 and lower(btrim(product.manufacturer_product_number)) = lower(candidate_model_no)
                 then 'exact_manufacturer_model_number'
               when candidate_gtin is not null
                 and regexp_replace(coalesce(variant.gtin, ''), '[^0-9]', '', 'g') = candidate_gtin
                 then 'exact_gtin'
             end
      into matched_product_id, matched_variant_id, match_method
      from public.products product
      left join public.product_variants variant on variant.product_id = product.id
      where product.deleted_at is null
        and lower(btrim(product.manufacturer)) = lower(candidate_manufacturer)
        and (
          (candidate_product_no is not null and lower(btrim(product.product_no)) = lower(candidate_product_no))
          or
          (candidate_model_no is not null and lower(btrim(product.manufacturer_product_number)) = lower(candidate_model_no))
          or
          (candidate_gtin is not null and regexp_replace(coalesce(variant.gtin, ''), '[^0-9]', '', 'g') = candidate_gtin)
          or
          (candidate_sku is not null and lower(coalesce(variant.sku, variant.manufacturer_sku, '')) = lower(candidate_sku))
        )
      order by case
        when candidate_product_no is not null
          and lower(btrim(product.product_no)) = lower(candidate_product_no) then 1
        when candidate_sku is not null
          and lower(coalesce(variant.sku, variant.manufacturer_sku, '')) = lower(candidate_sku) then 2
        when candidate_model_no is not null
          and lower(btrim(product.manufacturer_product_number)) = lower(candidate_model_no) then 3
        else 4
      end,
      product.created_at,
      variant.created_at nulls first
      limit 1;

      -- Exact normalized product name + manufacturer (+ variant when supplied)
      -- is the final deterministic match. Any ambiguity is review-only.
      if matched_product_id is null and candidate_product_name is not null then
        select count(distinct product.id)::integer
        into match_count
        from public.products product
        left join public.product_variants variant on variant.product_id = product.id
        where product.deleted_at is null
          and lower(btrim(product.manufacturer)) = lower(candidate_manufacturer)
          and lower(regexp_replace(btrim(product.product_name), '\s+', ' ', 'g'))
            = lower(regexp_replace(candidate_product_name, '\s+', ' ', 'g'))
          and (
            candidate_variant_name is null
            or lower(regexp_replace(btrim(coalesce(variant.variant_name, '')), '\s+', ' ', 'g'))
              = lower(regexp_replace(candidate_variant_name, '\s+', ' ', 'g'))
          );

        if match_count = 1 then
          select product.id,
                 case when candidate_variant_name is null then null else variant.id end
          into matched_product_id, matched_variant_id
          from public.products product
          left join public.product_variants variant on variant.product_id = product.id
          where product.deleted_at is null
            and lower(btrim(product.manufacturer)) = lower(candidate_manufacturer)
            and lower(regexp_replace(btrim(product.product_name), '\s+', ' ', 'g'))
              = lower(regexp_replace(candidate_product_name, '\s+', ' ', 'g'))
            and (
              candidate_variant_name is null
              or lower(regexp_replace(btrim(coalesce(variant.variant_name, '')), '\s+', ' ', 'g'))
                = lower(regexp_replace(candidate_variant_name, '\s+', ' ', 'g'))
            )
          order by product.created_at, variant.created_at nulls first
          limit 1;
          match_method := 'exact_normalized_name_variant';
        elsif match_count > 1 then
          insert into public.product_document_review_items (
            document_id,
            processing_attempt_id,
            review_type,
            priority,
            title,
            reason,
            evidence,
            candidate_payload,
            idempotency_key
          )
          values (
            p_document_id,
            p_attempt_id,
            'product_match',
            'high',
            'Produktnamnet matchar flera produkter',
            'Namnbaserad matchning är tvetydig och får inte skapa eller uppdatera en produkt automatiskt.',
            jsonb_build_object('match_count', match_count, 'candidate_key', candidate_key),
            candidate,
            p_attempt_id::text || ':ambiguous-name:' || candidate_key
          )
          on conflict (idempotency_key) do nothing;

          failed_count := failed_count + 1;
          continue;
        end if;
      end if;

      if matched_product_id is null then
        if candidate_confidence < 0.90
          or not candidate_identifier_observed
          or coalesce(candidate_product_no, candidate_sku, candidate_model_no, candidate_gtin) is null then
          insert into public.product_document_review_items (
            document_id,
            processing_attempt_id,
            review_type,
            priority,
            title,
            reason,
            evidence,
            candidate_payload,
            idempotency_key
          )
          values (
            p_document_id,
            p_attempt_id,
            'new_product',
            'normal',
            'Produktkandidat saknar säker unik identifiering',
            'Produkten skapades inte automatiskt eftersom identifiering eller konfidens är otillräcklig.',
            jsonb_build_object('confidence', candidate_confidence, 'candidate_key', candidate_key),
            candidate,
            p_attempt_id::text || ':unidentified:' || candidate_key
          )
          on conflict (idempotency_key) do nothing;

          failed_count := failed_count + 1;
          continue;
        end if;

        insert into public.products (
          manufacturer,
          product_no,
          product_name,
          status,
          manufacturer_product_number,
          source_type,
          source_document,
          source_page,
          confidence_score,
          raw_text,
          raw_data
        )
        values (
          candidate_manufacturer,
          coalesce(candidate_product_no, candidate_sku, candidate_model_no, candidate_gtin),
          coalesce(candidate_product_name, candidate_model_no, candidate_product_no, candidate_sku, candidate_gtin),
          'needs_review',
          candidate_model_no,
          'pdf_datasheet',
          p_document_id::text,
          candidate_first_page,
          candidate_confidence,
          candidate_excerpt,
          candidate
        )
        returning id into matched_product_id;

        match_method := 'created_unique_identifier';
        candidate_product_created := true;
        created_count := created_count + 1;

        perform public.write_product_ingestion_audit_event(
          'product.created_from_document',
          'products',
          matched_product_id,
          p_attempt_id,
          null,
          jsonb_build_object(
            'manufacturer', candidate_manufacturer,
            'product_no', coalesce(candidate_product_no, candidate_sku, candidate_model_no, candidate_gtin),
            'status', 'needs_review'
          ),
          jsonb_build_object('document_id', p_document_id, 'candidate_key', candidate_key)
        );

        insert into public.product_document_review_items (
          document_id,
          processing_attempt_id,
          product_id,
          review_type,
          priority,
          title,
          reason,
          evidence,
          candidate_payload,
          idempotency_key
        )
        values (
          p_document_id,
          p_attempt_id,
          matched_product_id,
          'new_product',
          'high',
          'Ny produkt från datablad',
          'Produkten skapades som needs_review med en säker identifierare.',
          jsonb_build_object('match_method', match_method, 'confidence', candidate_confidence),
          candidate,
          p_attempt_id::text || ':new-product:' || candidate_key
        )
        on conflict (idempotency_key) do nothing;
      else
        matched_count := matched_count + 1;
      end if;

      select * into matched_product
      from public.products product
      where product.id = matched_product_id;
      matched_product_json := to_jsonb(matched_product);

      if matched_variant_id is null and coalesce(candidate_gtin, candidate_sku) is not null then
        select variant.id
        into matched_variant_id
        from public.product_variants variant
        where variant.product_id = matched_product_id
          and variant.deleted_at is null
          and (
            (candidate_gtin is not null and regexp_replace(coalesce(variant.gtin, ''), '[^0-9]', '', 'g') = candidate_gtin)
            or
            (candidate_sku is not null and lower(coalesce(variant.sku, variant.manufacturer_sku, '')) = lower(candidate_sku))
          )
        order by variant.created_at
        limit 1;

        if matched_variant_id is null
          and candidate_confidence >= 0.90
          and candidate_identifier_observed then
          insert into public.product_variants (
            product_id,
            sku,
            manufacturer_sku,
            gtin,
            variant_name,
            status,
            technical_status,
            source_document,
            source_page,
            confidence_score,
            raw_text
          )
          values (
            matched_product_id,
            candidate_sku,
            candidate_sku,
            candidate_gtin,
            candidate_variant_name,
            'needs_review',
            'unverified',
            p_document_id::text,
            candidate_first_page,
            candidate_confidence,
            candidate_excerpt
          )
          returning id into matched_variant_id;

          candidate_variant_created := true;

          perform public.write_product_ingestion_audit_event(
            'product_variant.created_from_document',
            'product_variants',
            matched_variant_id,
            p_attempt_id,
            null,
            jsonb_build_object(
              'product_id', matched_product_id,
              'sku', candidate_sku,
              'gtin', candidate_gtin,
              'status', 'needs_review'
            ),
            jsonb_build_object('document_id', p_document_id, 'candidate_key', candidate_key)
          );
        end if;
      end if;

      if matched_variant_id is not null then
        select * into matched_variant
        from public.product_variants variant
        where variant.id = matched_variant_id;
        matched_variant_json := to_jsonb(matched_variant);
      else
        matched_variant_json := null;
      end if;

      identified_count := identified_count + 1;
      relation_key := p_attempt_id::text || ':relation:' || candidate_key;

      select relation.id
      into relation_id
      from public.product_documents relation
      where relation.document_id = p_document_id
        and relation.product_id = matched_product_id
        and relation.product_variant_id is not distinct from matched_variant_id
        and relation.is_current
      for update;

      if relation_id is null then
        insert into public.product_documents (
          product_id,
          document_id,
          product_variant_id,
          processing_attempt_id,
          source_page,
          page_numbers,
          extracted_product_number,
          match_method,
          match_score,
          verification_status,
          source_text,
          source_excerpt,
          source_table_row,
          raw_text,
          status,
          idempotency_key,
          is_current
        )
        values (
          matched_product_id,
          p_document_id,
          matched_variant_id,
          p_attempt_id,
          candidate_first_page,
          candidate_page_numbers,
          coalesce(candidate_sku, candidate_product_no, candidate_model_no, candidate_gtin),
          match_method,
          candidate_confidence,
          'needs_review',
          candidate_excerpt,
          candidate_excerpt,
          candidate -> 'source_table_row',
          candidate::text,
          'needs_review',
          relation_key,
          true
        )
        returning id into relation_id;
      else
        update public.product_documents relation
        set processing_attempt_id = p_attempt_id,
            page_numbers = array(
              select distinct page_number
              from unnest(relation.page_numbers || candidate_page_numbers) page_number
              order by page_number
            ),
            source_page = coalesce(relation.source_page, candidate_first_page),
            source_excerpt = coalesce(relation.source_excerpt, candidate_excerpt),
            source_text = coalesce(relation.source_text, candidate_excerpt),
            updated_at = now()
        where relation.id = relation_id;
      end if;

      staged_count := staged_count + 1;

      -- The new-product review row is created before the optional variant and
      -- product-document relation exist. Attach them now so approval can cover
      -- the complete candidate rather than only the parent product.
      update public.product_document_review_items review_item
      set product_variant_id = coalesce(review_item.product_variant_id, matched_variant_id),
          product_document_id = coalesce(review_item.product_document_id, relation_id),
          updated_at = now()
      where review_item.document_id = p_document_id
        and review_item.processing_attempt_id = p_attempt_id
        and review_item.product_id = matched_product_id
        and review_item.review_type = 'new_product'
        and review_item.status in ('pending', 'in_review');

      -- A later row in the same datasheet can add another independently
      -- identified variant to the parent that was just created by an earlier
      -- row. Give that variant its own actionable review item; otherwise its
      -- product-document relation would remain needs_review without a queue
      -- item that an administrator could resolve.
      if candidate_variant_created and not candidate_product_created then
        insert into public.product_document_review_items (
          document_id,
          processing_attempt_id,
          product_id,
          product_variant_id,
          product_document_id,
          review_type,
          priority,
          title,
          reason,
          evidence,
          candidate_payload,
          idempotency_key
        )
        values (
          p_document_id,
          p_attempt_id,
          matched_product_id,
          matched_variant_id,
          relation_id,
          'new_product',
          'high',
          'Ny produktvariant från datablad',
          'Varianten skapades som needs_review med en säker identifierare.',
          jsonb_build_object('match_method', match_method, 'confidence', candidate_confidence),
          candidate,
          p_attempt_id::text || ':new-variant:' || candidate_key
        )
        on conflict (idempotency_key) do nothing;
      end if;

      if jsonb_typeof(coalesce(candidate -> 'fields', '{}'::jsonb)) <> 'object' then
        raise exception 'Product candidate fields must be a JSON object.';
      end if;

      for field_entry in
        select key, value from jsonb_each(coalesce(candidate -> 'fields', '{}'::jsonb))
      loop
        field_key := field_entry.key;
        field_payload := case
          when jsonb_typeof(field_entry.value) = 'object' then field_entry.value
          else jsonb_build_object('normalized_value', field_entry.value)
        end;

        if lower(field_key) = any (array[
          'price', 'unit_price', 'purchase_price', 'sales_price', 'cost',
          'currency', 'currency_code', 'stock', 'stock_quantity', 'inventory',
          'inventory_quantity', 'lead_time', 'lead_time_days'
        ]) then
          continue;
        end if;

        original_value := coalesce(field_payload ->> 'original_value', field_payload ->> 'raw_value');
        normalized_value := coalesce(field_payload -> 'normalized_value', to_jsonb(original_value));
        if normalized_value is null then
          continue;
        end if;

        field_confidence := case
          when field_payload ->> 'confidence' ~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
            then (field_payload ->> 'confidence')::numeric
          else candidate_confidence
        end;
        field_page_number := case
          when field_payload ->> 'page_number' ~ '^[1-9][0-9]*$'
            then (field_payload ->> 'page_number')::integer
          else candidate_first_page
        end;
        field_method := coalesce(nullif(field_payload ->> 'extraction_method', ''), 'text');
        if field_method not in ('text', 'ocr', 'table', 'mixed', 'manual') then
          field_method := 'text';
        end if;

        field_target_variant_id := case
          when field_payload ->> 'target_scope' = 'product' then null
          when field_payload ->> 'target_scope' = 'variant' then matched_variant_id
          when field_key = any (array[
            'nominal_size', 'dn_size', 'sku', 'manufacturer_sku', 'gtin',
            'variant_name', 'unit_of_measure', 'outside_diameter_mm', 'c_to_e_mm',
            'weight_kg', 'package_quantity'
          ]) then matched_variant_id
          else null
        end;

        insert into public.product_field_provenance (
          product_id,
          product_variant_id,
          document_id,
          product_document_id,
          processing_attempt_id,
          field_key,
          page_number,
          original_value,
          normalized_value,
          extraction_method,
          confidence,
          source_excerpt,
          source_table_row,
          source_coordinates,
          verification_status,
          idempotency_key
        )
        values (
          matched_product_id,
          field_target_variant_id,
          p_document_id,
          relation_id,
          p_attempt_id,
          field_key,
          field_page_number,
          original_value,
          normalized_value,
          field_method,
          field_confidence,
          coalesce(field_payload ->> 'source_excerpt', candidate_excerpt),
          coalesce(field_payload -> 'source_table_row', candidate -> 'source_table_row'),
          coalesce(field_payload -> 'source_coordinates', '[]'::jsonb),
          'unverified',
          relation_key || ':field:' || field_key
        )
        on conflict (idempotency_key) do update
        set confidence = greatest(public.product_field_provenance.confidence, excluded.confidence)
        returning id into provenance_id;

        existing_value := case
          when field_target_variant_id is not null then coalesce(
            matched_variant_json -> field_key,
            matched_variant_json -> 'technical_data' -> field_key
          )
          else coalesce(
            matched_product_json -> field_key,
            matched_product_json -> 'technical_data' -> field_key
          )
        end;

        if existing_value is distinct from normalized_value then
          insert into public.product_change_proposals (
            document_id,
            product_document_id,
            processing_attempt_id,
            provenance_id,
            product_id,
            product_variant_id,
            proposal_kind,
            field_key,
            existing_value,
            proposed_value,
            conflict_type,
            significance,
            confidence,
            auto_apply_eligible,
            status,
            idempotency_key
          )
          values (
            p_document_id,
            relation_id,
            p_attempt_id,
            provenance_id,
            case when field_target_variant_id is null then matched_product_id else null end,
            field_target_variant_id,
            'update_field',
            field_key,
            existing_value,
            normalized_value,
            case when existing_value is null then 'none' else 'value_changed' end,
            case when existing_value is null then 'normal' else 'high' end,
            field_confidence,
            false,
            'pending',
            relation_key || ':proposal:' || field_key
          )
          on conflict (idempotency_key) do update
          set confidence = greatest(public.product_change_proposals.confidence, excluded.confidence),
              updated_at = now()
          returning id into proposal_id;

          insert into public.product_document_review_items (
            document_id,
            processing_attempt_id,
            product_id,
            product_variant_id,
            product_document_id,
            change_proposal_id,
            review_type,
            priority,
            title,
            reason,
            evidence,
            candidate_payload,
            idempotency_key
          )
          values (
            p_document_id,
            p_attempt_id,
            matched_product_id,
            matched_variant_id,
            relation_id,
            proposal_id,
            case when existing_value is null then 'field_change' else 'conflict' end,
            case when existing_value is null then 'normal' else 'high' end,
            'Tekniskt produktfält behöver granskas',
            case
              when existing_value is null then 'Databladet innehåller ett nytt tekniskt fält.'
              else 'Databladets värde skiljer sig från det nuvarande värdet.'
            end,
            jsonb_build_object(
              'field_key', field_key,
              'existing_value', existing_value,
              'proposed_value', normalized_value,
              'page_number', field_page_number,
              'confidence', field_confidence
            ),
            '{}'::jsonb,
            relation_key || ':review:' || field_key
          )
          on conflict (idempotency_key) do nothing;

          proposed_change_count := proposed_change_count + 1;
        end if;
      end loop;
    exception when others then
      failed_count := failed_count + 1;

      insert into public.product_document_review_items (
        document_id,
        processing_attempt_id,
        review_type,
        priority,
        title,
        reason,
        evidence,
        candidate_payload,
        idempotency_key
      )
      values (
        p_document_id,
        p_attempt_id,
        'partial_extraction',
        'high',
        'Produktrad kunde inte sparas',
        'En produktrad misslyckades men övriga rader fortsatte att bearbetas.',
        jsonb_build_object('sqlstate', sqlstate, 'technical_message', sqlerrm),
        coalesce(candidate, '{}'::jsonb),
        p_attempt_id::text || ':failed-candidate:' || coalesce(candidate_key, md5(coalesce(candidate, '{}'::jsonb)::text))
      )
      on conflict (idempotency_key) do nothing;
    end;
  end loop;

  stage_result := jsonb_build_object(
    'identified_product_count', identified_count,
    'matched_product_count', matched_count,
    'created_product_count', created_count,
    'staged_product_count', staged_count,
    'proposed_change_count', proposed_change_count,
    'failed_product_count', failed_count
  );

  update public.product_document_processing_attempts
  set staged_result = stage_result,
      staged_at = now(),
      identified_product_count = identified_count,
      failed_product_count = failed_count,
      updated_at = now()
  where id = p_attempt_id;

  return stage_result;
end;
$$;

-- Idempotently persists the output of the existing text/OCR page preprocessor.
-- A bad page is isolated from the remaining pages and is returned in the
-- failure list; the caller decides whether the final document is partial/failed.
create or replace function public.stage_product_document_pages(
  p_attempt_id uuid,
  p_document_id uuid,
  p_pages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attempt public.product_document_processing_attempts%rowtype;
  page_payload jsonb;
  staged_page_count integer := 0;
  failed_page_count integer := 0;
  current_page_number integer;
  max_page_number integer := 0;
  page_status text;
  page_method text;
  page_error_code text;
  staged_methods text[] := '{}'::text[];
  failed_pages integer[] := '{}'::integer[];
begin
  if jsonb_typeof(p_pages) <> 'array' then
    raise exception 'Product document pages must be a JSON array.';
  end if;

  select processing_attempt.*
  into attempt
  from public.product_document_processing_attempts processing_attempt
  where processing_attempt.id = p_attempt_id
  for update;

  if attempt.id is null
    or attempt.document_id is distinct from p_document_id
    or attempt.status <> 'processing' then
    raise exception 'A matching active product document processing attempt is required.';
  end if;

  for page_payload in
    select value from jsonb_array_elements(p_pages)
  loop
    begin
      if jsonb_typeof(page_payload) <> 'object'
        or page_payload ->> 'page_number' !~ '^[1-9][0-9]*$' then
        raise exception 'Every page requires a positive page_number.';
      end if;

      current_page_number := (page_payload ->> 'page_number')::integer;
      page_status := coalesce(nullif(page_payload ->> 'status', ''), 'success');
      page_method := coalesce(nullif(page_payload ->> 'extraction_method', ''), 'text');
      page_error_code := nullif(page_payload ->> 'error_code', '');

      if page_status not in ('success', 'partial', 'failed') then
        raise exception 'Unsupported page extraction status.';
      end if;
      if page_method not in ('text', 'ocr', 'table', 'mixed', 'manual') then
        raise exception 'Unsupported page extraction method.';
      end if;
      if jsonb_typeof(coalesce(page_payload -> 'extracted_tables', '[]'::jsonb)) <> 'array'
        or jsonb_typeof(coalesce(page_payload -> 'source_coordinates', '[]'::jsonb)) <> 'array' then
        raise exception 'Page tables and source coordinates must be JSON arrays.';
      end if;

      if page_status = 'failed' and page_error_code is null then
        page_error_code := case
          when page_method = 'ocr' then 'ocr_failed'
          else 'text_extraction_failed'
        end;
      end if;

      insert into public.product_document_pages (
        document_id,
        processing_attempt_id,
        page_number,
        status,
        extraction_method,
        detected_language_code,
        extracted_text,
        extracted_tables,
        source_coordinates,
        error_code,
        admin_error_message
      )
      values (
        p_document_id,
        p_attempt_id,
        current_page_number,
        page_status,
        page_method,
        nullif(page_payload ->> 'language_code', ''),
        coalesce(page_payload ->> 'extracted_text', page_payload ->> 'text'),
        coalesce(page_payload -> 'extracted_tables', '[]'::jsonb),
        coalesce(page_payload -> 'source_coordinates', '[]'::jsonb),
        page_error_code,
        nullif(page_payload ->> 'error_message', '')
      )
      on conflict (processing_attempt_id, page_number) do update
      set status = excluded.status,
          extraction_method = excluded.extraction_method,
          detected_language_code = excluded.detected_language_code,
          extracted_text = excluded.extracted_text,
          extracted_tables = excluded.extracted_tables,
          source_coordinates = excluded.source_coordinates,
          error_code = excluded.error_code,
          admin_error_message = excluded.admin_error_message,
          updated_at = now();

      staged_page_count := staged_page_count + 1;
      max_page_number := greatest(max_page_number, current_page_number);
      staged_methods := array_append(staged_methods, page_method);
      if page_status in ('partial', 'failed') then
        failed_page_count := failed_page_count + 1;
        failed_pages := array_append(failed_pages, current_page_number);
      end if;
    exception when others then
      failed_page_count := failed_page_count + 1;
      if page_payload ->> 'page_number' ~ '^[1-9][0-9]*$' then
        failed_pages := array_append(failed_pages, (page_payload ->> 'page_number')::integer);
      end if;
    end;
  end loop;

  update public.product_document_processing_attempts processing_attempt
  set failed_page_numbers = array(
        select distinct failed_page
        from unnest(processing_attempt.failed_page_numbers || failed_pages) failed_page
        order by failed_page
      ),
      extraction_methods = array(
        select distinct extraction_method
        from unnest(processing_attempt.extraction_methods || staged_methods) extraction_method
        order by extraction_method
      ),
      page_count = greatest(coalesce(processing_attempt.page_count, 0), max_page_number),
      updated_at = now()
  where processing_attempt.id = p_attempt_id;

  return jsonb_build_object(
    'staged_page_count', staged_page_count,
    'failed_page_count', failed_page_count,
    'failed_page_numbers', to_jsonb(failed_pages)
  );
end;
$$;

create or replace function public.complete_product_document_processing(
  p_attempt_id uuid,
  p_status text,
  p_error_code text default null,
  p_admin_error_message text default null,
  p_technical_error_detail text default null,
  p_technical_stack_trace text default null,
  p_identified_product_count integer default null,
  p_updated_product_count integer default null,
  p_failed_product_count integer default null,
  p_failed_row_count integer default null,
  p_failed_page_numbers integer[] default null,
  p_extraction_methods text[] default null,
  p_page_count integer default null,
  p_raw_result jsonb default null,
  p_metrics jsonb default '{}'::jsonb,
  p_retry_after timestamptz default null
)
returns public.product_document_processing_attempts
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  active_attempt public.product_document_processing_attempts%rowtype;
  completed_attempt public.product_document_processing_attempts%rowtype;
  normalized_error_code text := p_error_code;
  normalized_identified_count integer;
  normalized_updated_count integer;
  normalized_failed_count integer;
  normalized_failed_row_count integer;
begin
  if p_status not in ('success', 'partial', 'no_products_found', 'unreadable', 'failed') then
    raise exception 'A completed attempt must use a terminal processing status.';
  end if;

  select attempt.*
  into active_attempt
  from public.product_document_processing_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.status in ('pending', 'processing')
  for update;

  if active_attempt.id is null then
    raise exception 'The processing attempt does not exist or is already complete.';
  end if;

  normalized_identified_count := coalesce(p_identified_product_count, active_attempt.identified_product_count);
  normalized_updated_count := coalesce(p_updated_product_count, active_attempt.updated_product_count);
  normalized_failed_count := coalesce(p_failed_product_count, active_attempt.failed_product_count);
  normalized_failed_row_count := coalesce(p_failed_row_count, active_attempt.failed_row_count);

  if least(
    normalized_identified_count,
    normalized_updated_count,
    normalized_failed_count,
    normalized_failed_row_count
  ) < 0 then
    raise exception 'Processing counts cannot be negative.';
  end if;

  if normalized_updated_count > normalized_identified_count then
    raise exception 'Updated product count cannot exceed identified product count.';
  end if;

  if p_status = 'success'
    and (
      normalized_identified_count = 0
      or normalized_failed_count > 0
      or normalized_failed_row_count > 0
    ) then
    raise exception 'Success requires at least one identified product and no failed products or rows.';
  end if;

  if p_status = 'no_products_found' and normalized_identified_count <> 0 then
    raise exception 'no_products_found cannot contain identified products.';
  end if;

  if p_status = 'no_products_found' and normalized_error_code is null then
    normalized_error_code := 'no_products_found';
  elsif p_status in ('unreadable', 'failed') and normalized_error_code is null then
    normalized_error_code := 'unknown_error';
  elsif p_status = 'success' then
    normalized_error_code := null;
  end if;

  update public.product_document_processing_attempts attempt
  set status = p_status,
      error_code = normalized_error_code,
      admin_error_message = case when p_status = 'success' then null else p_admin_error_message end,
      technical_error_detail = case when p_status = 'success' then null else p_technical_error_detail end,
      technical_stack_trace = case when p_status = 'success' then null else p_technical_stack_trace end,
      identified_product_count = normalized_identified_count,
      updated_product_count = normalized_updated_count,
      failed_product_count = normalized_failed_count,
      failed_row_count = normalized_failed_row_count,
      failed_page_numbers = coalesce(p_failed_page_numbers, attempt.failed_page_numbers),
      extraction_methods = coalesce(p_extraction_methods, attempt.extraction_methods),
      page_count = coalesce(p_page_count, attempt.page_count),
      raw_result = p_raw_result,
      metrics = coalesce(p_metrics, '{}'::jsonb),
      retry_after = p_retry_after,
      completed_at = now(),
      updated_at = now()
  where attempt.id = p_attempt_id
    and attempt.status in ('pending', 'processing')
  returning * into completed_attempt;

  return completed_attempt;
end;
$$;

create or replace function public.review_product_change_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_review_note text default null
)
returns public.product_change_proposals
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  reviewed_proposal public.product_change_proposals%rowtype;
begin
  if not public.can_manage_product_ingestion() then
    raise exception 'Product ingestion review permission is required.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Review decision must be approved or rejected.';
  end if;

  if p_decision = 'approved' and exists (
    select 1
    from public.product_change_proposals proposal
    where proposal.id = p_proposal_id
      and proposal.proposal_kind in ('update_field', 'add_attribute')
  ) then
    raise exception 'Technical field approvals must use approve_and_apply_product_change.';
  end if;

  update public.product_change_proposals proposal
  set status = p_decision,
      review_note = p_review_note,
      decided_by = auth.uid(),
      decided_at = now(),
      updated_at = now()
  where proposal.id = p_proposal_id
    and proposal.status = 'pending'
  returning * into reviewed_proposal;

  if reviewed_proposal.id is null then
    raise exception 'The product change proposal does not exist or has already been reviewed.';
  end if;

  update public.product_document_review_items review_item
  set status = case when p_decision = 'approved' then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = p_review_note,
      updated_at = now()
  where review_item.change_proposal_id = p_proposal_id
    and review_item.status in ('pending', 'in_review');

  return reviewed_proposal;
end;
$$;

-- Internal whitelist-based setter used only by the atomic approval/revert RPCs.
-- It deliberately excludes status, prices, stock, costs and other business data.
create or replace function public.set_product_technical_field_value(
  p_product_id uuid,
  p_product_variant_id uuid,
  p_field_key text,
  p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  previous_value jsonb;
begin
  if num_nonnulls(p_product_id, p_product_variant_id) <> 1 then
    raise exception 'Exactly one product or product variant target is required.';
  end if;

  if p_product_id is not null then
    select coalesce(to_jsonb(product) -> p_field_key, product.technical_data -> p_field_key)
    into previous_value
    from public.products product
    where product.id = p_product_id
      and product.deleted_at is null
    for update;

    if not found then
      raise exception 'Product target not found.';
    end if;

    if p_field_key = any (array[
      'product_name', 'category', 'sub_category', 'connection_type', 'material',
      'available_sizes', 'bulb_size', 'response_type', 'adjustment', 'color',
      'product_series', 'product_type', 'gasket_material'
    ]) then
      execute format(
        'update public.products set %I = case when $1 is null or $1 = ''null''::jsonb then null else $1 #>> ''{}'' end, updated_at = now() where id = $2',
        p_field_key
      ) using p_value, p_product_id;
    elsif p_field_key = any (array[
      'max_working_pressure_psi', 'max_working_pressure_kpa', 'minimum_temperature_c'
    ]) then
      execute format(
        'update public.products set %I = case when $1 is null or $1 = ''null''::jsonb then null else ($1 #>> ''{}'')::numeric end, updated_at = now() where id = $2',
        p_field_key
      ) using p_value, p_product_id;
    elsif p_field_key = any (array[
      'k_factor', 'approvals', 'max_working_pressure', 'temperature_ratings',
      'part_numbers', 'physical_characteristics', 'coating_options', 'standards',
      'dimension_data', 'technical_data'
    ]) then
      execute format(
        'update public.products set %I = $1, updated_at = now() where id = $2',
        p_field_key
      ) using p_value, p_product_id;
    elsif p_field_key ~ '^[a-z][a-z0-9_]{0,119}$'
      and p_field_key <> all (array[
        'price', 'unit_price', 'purchase_price', 'sales_price', 'cost',
        'currency', 'currency_code', 'stock', 'stock_quantity', 'inventory',
        'inventory_quantity', 'lead_time', 'lead_time_days', 'status'
      ]) then
      update public.products
      set technical_data = case
            when p_value is null
              then coalesce(technical_data, '{}'::jsonb) - p_field_key
            else jsonb_set(
              coalesce(technical_data, '{}'::jsonb),
              array[p_field_key],
              p_value,
              true
            )
          end,
          updated_at = now()
      where id = p_product_id;
    else
      raise exception 'The product field is not a safe datasheet technical field.';
    end if;
  else
    select coalesce(to_jsonb(variant) -> p_field_key, variant.technical_data -> p_field_key)
    into previous_value
    from public.product_variants variant
    where variant.id = p_product_variant_id
      and variant.deleted_at is null
    for update;

    if not found then
      raise exception 'Product variant target not found.';
    end if;

    if p_field_key = any (array[
      'nominal_size', 'dn_size', 'sku', 'manufacturer_sku', 'gtin',
      'variant_name', 'unit_of_measure'
    ]) then
      execute format(
        'update public.product_variants set %I = case when $1 is null or $1 = ''null''::jsonb then null else $1 #>> ''{}'' end, updated_at = now() where id = $2',
        p_field_key
      ) using p_value, p_product_variant_id;
    elsif p_field_key = any (array[
      'outside_diameter_mm', 'c_to_e_mm', 'weight_kg', 'package_quantity'
    ]) then
      execute format(
        'update public.product_variants set %I = case when $1 is null or $1 = ''null''::jsonb then null else ($1 #>> ''{}'')::numeric end, updated_at = now() where id = $2',
        p_field_key
      ) using p_value, p_product_variant_id;
    elsif p_field_key ~ '^[a-z][a-z0-9_]{0,119}$'
      and p_field_key <> all (array[
        'price', 'unit_price', 'purchase_price', 'sales_price', 'cost',
        'currency', 'currency_code', 'stock', 'stock_quantity', 'inventory',
        'inventory_quantity', 'lead_time', 'lead_time_days', 'status'
      ]) then
      update public.product_variants
      set technical_data = case
            when p_value is null
              then coalesce(technical_data, '{}'::jsonb) - p_field_key
            else jsonb_set(
              coalesce(technical_data, '{}'::jsonb),
              array[p_field_key],
              p_value,
              true
            )
          end,
          updated_at = now()
      where id = p_product_variant_id;
    else
      raise exception 'The product variant field is not a safe datasheet technical field.';
    end if;
  end if;

  return previous_value;
end;
$$;

-- Review + apply is one transaction. If the catalog value changed after the
-- proposal was created, or a manual lock exists, the entire operation rolls back.
create or replace function public.approve_and_apply_product_change(
  p_proposal_id uuid,
  p_review_note text default null
)
returns public.product_change_proposals
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  proposal public.product_change_proposals%rowtype;
  applied_proposal public.product_change_proposals%rowtype;
  actual_before_value jsonb;
  has_active_lock boolean;
begin
  if not public.can_manage_product_ingestion() then
    raise exception 'Product ingestion review permission is required.';
  end if;

  select change_proposal.*
  into proposal
  from public.product_change_proposals change_proposal
  where change_proposal.id = p_proposal_id
  for update;

  if proposal.id is null or proposal.status <> 'pending' then
    raise exception 'The product change proposal does not exist or is not pending.';
  end if;

  if proposal.proposal_kind not in ('update_field', 'add_attribute')
    or proposal.field_key is null then
    raise exception 'Only technical field proposals can be applied by this RPC.';
  end if;

  select exists (
    select 1
    from public.product_field_locks field_lock
    where field_lock.unlocked_at is null
      and field_lock.field_key = proposal.field_key
      and (
        (proposal.product_id is not null and field_lock.product_id = proposal.product_id)
        or
        (proposal.product_variant_id is not null and field_lock.product_variant_id = proposal.product_variant_id)
      )
  ) into has_active_lock;

  if proposal.blocked_by_lock or has_active_lock then
    raise exception 'The product field is manually locked and cannot be updated from a datasheet.';
  end if;

  actual_before_value := public.set_product_technical_field_value(
    proposal.product_id,
    proposal.product_variant_id,
    proposal.field_key,
    proposal.proposed_value
  );

  if actual_before_value is distinct from proposal.existing_value then
    raise exception 'The catalog value changed after this proposal was created; create a new proposal.';
  end if;

  insert into public.product_field_change_history (
    proposal_id,
    product_id,
    product_variant_id,
    field_key,
    action,
    before_value,
    after_value,
    provenance_id,
    performed_by,
    metadata
  )
  values (
    proposal.id,
    proposal.product_id,
    proposal.product_variant_id,
    proposal.field_key,
    'applied',
    actual_before_value,
    proposal.proposed_value,
    proposal.provenance_id,
    auth.uid(),
    jsonb_build_object('review_note', p_review_note)
  );

  update public.product_change_proposals
  set status = 'applied',
      review_note = p_review_note,
      decided_by = auth.uid(),
      decided_at = now(),
      applied_at = now(),
      updated_at = now()
  where id = proposal.id
  returning * into applied_proposal;

  update public.product_field_provenance
  set verification_status = 'verified',
      verified_by = auth.uid(),
      verified_at = now()
  where id = proposal.provenance_id;

  update public.product_document_review_items
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = p_review_note,
      updated_at = now()
  where change_proposal_id = proposal.id
    and status in ('pending', 'in_review');

  -- A single accepted field does not verify the entire document relation while
  -- other product, match or field reviews remain unresolved.
  update public.product_documents relation
  set verification_status = 'verified',
      verified_by = auth.uid(),
      verified_at = now(),
      updated_at = now()
  where relation.id = proposal.product_document_id
    and not exists (
      select 1
      from public.product_change_proposals pending_proposal
      where pending_proposal.product_document_id = relation.id
        and pending_proposal.status = 'pending'
    )
    and not exists (
      select 1
      from public.product_document_review_items pending_review
      where pending_review.product_document_id = relation.id
        and pending_review.status in ('pending', 'in_review')
    );

  return applied_proposal;
end;
$$;

create or replace function public.revert_applied_product_change(
  p_proposal_id uuid,
  p_review_note text default null
)
returns public.product_change_proposals
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  proposal public.product_change_proposals%rowtype;
  application public.product_field_change_history%rowtype;
  reverted_proposal public.product_change_proposals%rowtype;
  actual_before_revert jsonb;
begin
  if not public.can_manage_product_ingestion() then
    raise exception 'Product ingestion review permission is required.';
  end if;

  select change_proposal.*
  into proposal
  from public.product_change_proposals change_proposal
  where change_proposal.id = p_proposal_id
  for update;

  if proposal.id is null or proposal.status <> 'applied' then
    raise exception 'Only an applied product change can be reverted.';
  end if;

  select history.*
  into application
  from public.product_field_change_history history
  where history.proposal_id = proposal.id
    and history.action = 'applied';

  if application.id is null then
    raise exception 'Applied product change history is missing.';
  end if;

  actual_before_revert := public.set_product_technical_field_value(
    proposal.product_id,
    proposal.product_variant_id,
    proposal.field_key,
    application.before_value
  );

  if actual_before_revert is distinct from application.after_value then
    raise exception 'The catalog value changed after this proposal was applied; automatic revert was cancelled.';
  end if;

  insert into public.product_field_change_history (
    proposal_id,
    product_id,
    product_variant_id,
    field_key,
    action,
    before_value,
    after_value,
    provenance_id,
    performed_by,
    metadata
  )
  values (
    proposal.id,
    proposal.product_id,
    proposal.product_variant_id,
    proposal.field_key,
    'reverted',
    actual_before_revert,
    application.before_value,
    proposal.provenance_id,
    auth.uid(),
    jsonb_build_object('review_note', p_review_note)
  );

  update public.product_change_proposals
  set status = 'reverted',
      review_note = p_review_note,
      reverted_at = now(),
      updated_at = now()
  where id = proposal.id
  returning * into reverted_proposal;

  update public.product_field_provenance
  set verification_status = 'disputed',
      verified_by = auth.uid(),
      verified_at = now()
  where id = proposal.provenance_id;

  update public.product_document_review_items
  set status = 'resolved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = p_review_note,
      updated_at = now()
  where change_proposal_id = proposal.id;

  return reverted_proposal;
end;
$$;

-- Product-level queue items are reviewed separately from field proposals. A
-- candidate without a resolved product identity can be rejected here, but must
-- be manually matched before it can be approved.
create or replace function public.review_product_document_item(
  p_review_item_id uuid,
  p_decision text,
  p_review_note text default null
)
returns public.product_document_review_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  review_item public.product_document_review_items%rowtype;
  reviewed_item public.product_document_review_items%rowtype;
begin
  if not public.can_manage_product_ingestion() then
    raise exception 'Product ingestion review permission is required.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Review decision must be approved or rejected.';
  end if;

  select item.*
  into review_item
  from public.product_document_review_items item
  where item.id = p_review_item_id
  for update;

  if review_item.id is null or review_item.status not in ('pending', 'in_review') then
    raise exception 'The product review item does not exist or has already been reviewed.';
  end if;

  if review_item.change_proposal_id is not null then
    raise exception 'Field-change review items must use the product change proposal RPC.';
  end if;

  if p_decision = 'approved'
    and review_item.review_type in ('new_product', 'product_match')
    and review_item.product_id is null then
    raise exception 'Resolve the product identity before approving this review item.';
  end if;

  if p_decision = 'approved' and review_item.product_id is not null then
    update public.products product
    set status = case
          when product.status::text = 'needs_review' then 'approved'
          else product.status
        end,
        reviewed_at = coalesce(product.reviewed_at, now()),
        updated_at = now()
    where product.id = review_item.product_id
      and product.deleted_at is null;

    update public.product_variants variant
    set technical_status = case
          when variant.technical_status::text = 'unverified' then 'verified'
          else variant.technical_status
        end,
        updated_at = now()
    where variant.product_id = review_item.product_id
      and variant.deleted_at is null
      and (
        variant.id = review_item.product_variant_id
        or exists (
          select 1
          from public.product_documents relation
          where relation.id = review_item.product_document_id
            and relation.product_variant_id = variant.id
        )
      );
  end if;

  update public.product_document_review_items item
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = p_review_note,
      updated_at = now()
  where item.id = review_item.id
  returning * into reviewed_item;

  if review_item.product_document_id is not null then
    if p_decision = 'rejected' then
      update public.product_documents relation
      set verification_status = 'rejected',
          verified_by = auth.uid(),
          verified_at = now(),
          updated_at = now()
      where relation.id = review_item.product_document_id;

      update public.product_field_provenance provenance
      set verification_status = 'rejected',
          verified_by = auth.uid(),
          verified_at = now()
      where provenance.product_document_id = review_item.product_document_id
        and provenance.verification_status = 'unverified';
    else
      update public.product_documents relation
      set verification_status = 'verified',
          verified_by = auth.uid(),
          verified_at = now(),
          updated_at = now()
      where relation.id = review_item.product_document_id
        and not exists (
          select 1
          from public.product_change_proposals pending_proposal
          where pending_proposal.product_document_id = relation.id
            and pending_proposal.status = 'pending'
        )
        and not exists (
          select 1
          from public.product_document_review_items pending_review
          where pending_review.product_document_id = relation.id
            and pending_review.status in ('pending', 'in_review')
        );
    end if;
  end if;

  perform public.write_product_ingestion_audit_event(
    'product_document_review.' || p_decision,
    'product_document_review_items',
    review_item.id,
    review_item.processing_attempt_id,
    to_jsonb(review_item),
    to_jsonb(reviewed_item),
    jsonb_build_object('review_note', p_review_note)
  );

  return reviewed_item;
end;
$$;

-- Records the reversible before/after snapshot after the worker has applied or
-- reverted the product update in the same database transaction.
create or replace function public.record_product_change_application(
  p_proposal_id uuid,
  p_action text,
  p_before_value jsonb,
  p_after_value jsonb,
  p_performed_by uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.product_field_change_history
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  proposal public.product_change_proposals%rowtype;
  history_row public.product_field_change_history%rowtype;
begin
  if p_action not in ('applied', 'reverted') then
    raise exception 'Product change application action must be applied or reverted.';
  end if;

  select history.*
  into history_row
  from public.product_field_change_history history
  where history.proposal_id = p_proposal_id
    and history.action = p_action;

  if history_row.id is not null then
    return history_row;
  end if;

  select change_proposal.*
  into proposal
  from public.product_change_proposals change_proposal
  where change_proposal.id = p_proposal_id
  for update;

  if proposal.id is null then
    raise exception 'Product change proposal not found.';
  end if;

  if p_action = 'applied' and proposal.status <> 'approved' then
    raise exception 'Only an approved proposal can be marked as applied.';
  elsif p_action = 'reverted' and proposal.status <> 'applied' then
    raise exception 'Only an applied proposal can be marked as reverted.';
  end if;

  if proposal.field_key is null or num_nonnulls(proposal.product_id, proposal.product_variant_id) <> 1 then
    raise exception 'Only field-level proposals can create field change history.';
  end if;

  insert into public.product_field_change_history (
    proposal_id,
    product_id,
    product_variant_id,
    field_key,
    action,
    before_value,
    after_value,
    provenance_id,
    performed_by,
    metadata
  )
  values (
    proposal.id,
    proposal.product_id,
    proposal.product_variant_id,
    proposal.field_key,
    p_action,
    p_before_value,
    p_after_value,
    proposal.provenance_id,
    coalesce(p_performed_by, auth.uid()),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (proposal_id, action) do nothing
  returning * into history_row;

  if history_row.id is null then
    select history.*
    into history_row
    from public.product_field_change_history history
    where history.proposal_id = p_proposal_id
      and history.action = p_action;
    return history_row;
  end if;

  update public.product_change_proposals
  set status = case when p_action = 'applied' then 'applied' else 'reverted' end,
      applied_at = case when p_action = 'applied' then now() else applied_at end,
      reverted_at = case when p_action = 'reverted' then now() else reverted_at end,
      updated_at = now()
  where id = proposal.id;

  return history_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists product_extraction_field_rules_set_updated_at
  on public.product_extraction_field_rules;
create trigger product_extraction_field_rules_set_updated_at
before update on public.product_extraction_field_rules
for each row execute function public.set_updated_at();

drop trigger if exists product_document_attempts_prepare
  on public.product_document_processing_attempts;
create trigger product_document_attempts_prepare
before insert on public.product_document_processing_attempts
for each row execute function public.prepare_product_document_attempt();

drop trigger if exists product_document_attempts_protect_history
  on public.product_document_processing_attempts;
create trigger product_document_attempts_protect_history
before update on public.product_document_processing_attempts
for each row execute function public.protect_product_document_attempt_history();

drop trigger if exists product_document_attempts_sync_summary
  on public.product_document_processing_attempts;
create trigger product_document_attempts_sync_summary
after insert or update on public.product_document_processing_attempts
for each row execute function public.sync_product_document_processing_summary();

drop trigger if exists product_document_pages_enforce_scope
  on public.product_document_pages;
create trigger product_document_pages_enforce_scope
before insert or update on public.product_document_pages
for each row execute function public.enforce_product_document_page_scope();

drop trigger if exists product_document_pages_set_updated_at
  on public.product_document_pages;
create trigger product_document_pages_set_updated_at
before update on public.product_document_pages
for each row execute function public.set_updated_at();

drop trigger if exists product_documents_enforce_ingestion_relation
  on public.product_documents;
create trigger product_documents_enforce_ingestion_relation
before insert or update on public.product_documents
for each row execute function public.enforce_product_document_relation();

drop trigger if exists product_documents_set_ingestion_updated_at
  on public.product_documents;
create trigger product_documents_set_ingestion_updated_at
before update on public.product_documents
for each row execute function public.set_updated_at();

drop trigger if exists product_field_provenance_enforce_scope
  on public.product_field_provenance;
create trigger product_field_provenance_enforce_scope
before insert or update on public.product_field_provenance
for each row execute function public.enforce_product_field_provenance_scope();

drop trigger if exists product_change_proposals_guard
  on public.product_change_proposals;
create trigger product_change_proposals_guard
before insert or update on public.product_change_proposals
for each row execute function public.guard_product_change_proposal();

drop trigger if exists product_document_review_items_set_updated_at
  on public.product_document_review_items;
create trigger product_document_review_items_set_updated_at
before update on public.product_document_review_items
for each row execute function public.set_updated_at();

drop trigger if exists product_field_change_history_prevent_update
  on public.product_field_change_history;
create trigger product_field_change_history_prevent_update
before update on public.product_field_change_history
for each row execute function public.prevent_product_ingestion_history_mutation();

drop trigger if exists product_field_change_history_prevent_delete
  on public.product_field_change_history;
create trigger product_field_change_history_prevent_delete
before delete on public.product_field_change_history
for each row execute function public.prevent_product_ingestion_history_mutation();

drop trigger if exists product_ingestion_audit_events_prevent_update
  on public.product_ingestion_audit_events;
create trigger product_ingestion_audit_events_prevent_update
before update on public.product_ingestion_audit_events
for each row execute function public.prevent_product_ingestion_history_mutation();

drop trigger if exists product_ingestion_audit_events_prevent_delete
  on public.product_ingestion_audit_events;
create trigger product_ingestion_audit_events_prevent_delete
before delete on public.product_ingestion_audit_events
for each row execute function public.prevent_product_ingestion_history_mutation();

do $$
declare
  audited_table text;
begin
  foreach audited_table in array array[
    'documents',
    'product_document_processing_attempts',
    'product_documents',
    'product_field_locks',
    'product_change_proposals',
    'product_field_change_history',
    'product_document_review_items'
  ] loop
    execute format(
      'drop trigger if exists %I_ingestion_audit on public.%I',
      audited_table,
      audited_table
    );
    execute format(
      'create trigger %I_ingestion_audit after insert or update or delete on public.%I for each row execute function public.audit_product_ingestion_change()',
      audited_table,
      audited_table
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Sanitized customer/catalog views and internal administration views
-- ---------------------------------------------------------------------------

create or replace view public.published_product_documents
with (security_barrier = true)
as
select
  relation.id as product_document_id,
  relation.product_id,
  relation.product_variant_id,
  document.id as document_id,
  document.title,
  coalesce(relation.document_type, document.document_type) as document_type,
  coalesce(relation.language_code, document.language_code) as language_code,
  coalesce(relation.version, document.version) as document_version,
  coalesce(relation.publication_date, document.published_date) as publication_date,
  document.source_page_url,
  document.original_pdf_url,
  relation.page_numbers,
  relation.source_page,
  relation.source_excerpt,
  relation.match_method,
  relation.match_score,
  relation.verified_at,
  document.updated_at as document_updated_at
from public.product_documents relation
join public.documents document on document.id = relation.document_id
join public.products product on product.id = relation.product_id
left join public.product_variants variant on variant.id = relation.product_variant_id
where relation.is_current
  and relation.verification_status = 'verified'
  and document.deleted_at is null
  and document.current_processing_status in ('success', 'partial')
  and product.deleted_at is null
  and product.status::text in ('approved', 'active')
  and (
    variant.id is null
    or (variant.deleted_at is null and variant.technical_status::text in ('verified', 'approved', 'active'))
  );

create or replace view public.published_product_field_sources
with (security_barrier = true)
as
select
  provenance.id,
  provenance.product_id,
  provenance.product_variant_id,
  provenance.product_attribute_value_id,
  provenance.document_id,
  provenance.product_document_id,
  provenance.field_key,
  provenance.page_number,
  provenance.normalized_value,
  provenance.extraction_method,
  provenance.confidence,
  provenance.source_excerpt,
  provenance.source_table_row,
  provenance.source_coordinates,
  provenance.verified_at,
  provenance.extracted_at
from public.product_field_provenance provenance
join public.documents document on document.id = provenance.document_id
join public.products product on product.id = provenance.product_id
left join public.product_variants variant on variant.id = provenance.product_variant_id
where provenance.verification_status = 'verified'
  and document.deleted_at is null
  and document.current_processing_status in ('success', 'partial')
  and product.deleted_at is null
  and product.status::text in ('approved', 'active')
  and (
    variant.id is null
    or (variant.deleted_at is null and variant.technical_status::text in ('verified', 'approved', 'active'))
  );

create or replace view public.failed_product_documents_admin
with (security_invoker = true, security_barrier = true)
as
select
  document.id as document_id,
  document.supplier_id,
  document.supplier_name,
  document.title,
  document.file_name,
  document.current_processing_status as status,
  document.current_error_code as error_code,
  document.current_error_message as error_message,
  document.page_count,
  document.identified_product_count,
  document.failed_product_count,
  document.failed_page_numbers,
  document.processing_attempt_count,
  document.last_processing_at,
  document.manual_review_status,
  document.original_pdf_url,
  document.source_page_url,
  document.reader_version
from public.documents document
where document.deleted_at is null
  and document.current_processing_status in ('partial', 'no_products_found', 'unreadable', 'failed');

create or replace view public.product_document_processing_stats_admin
with (security_invoker = true, security_barrier = true)
as
select
  document.current_processing_status as status,
  document.current_error_code as error_code,
  count(*)::bigint as document_count,
  max(document.last_processing_at) as latest_processing_at
from public.documents document
where document.deleted_at is null
group by document.current_processing_status, document.current_error_code;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.documents enable row level security;
alter table public.product_documents enable row level security;
alter table public.product_document_error_codes enable row level security;
alter table public.product_extraction_field_rules enable row level security;
alter table public.product_document_processing_attempts enable row level security;
alter table public.product_document_pages enable row level security;
alter table public.product_field_provenance enable row level security;
alter table public.product_field_locks enable row level security;
alter table public.product_change_proposals enable row level security;
alter table public.product_field_change_history enable row level security;
alter table public.product_document_review_items enable row level security;
alter table public.product_ingestion_audit_events enable row level security;

drop policy if exists documents_ingestion_admin_select on public.documents;
create policy documents_ingestion_admin_select
on public.documents for select to authenticated
using (public.can_manage_product_ingestion());

drop policy if exists product_documents_authenticated_select on public.product_documents;
drop policy if exists product_documents_ingestion_admin_select on public.product_documents;
create policy product_documents_ingestion_admin_select
on public.product_documents for select to authenticated
using (public.can_manage_product_ingestion());

drop policy if exists product_document_error_codes_authenticated_select
  on public.product_document_error_codes;
create policy product_document_error_codes_authenticated_select
on public.product_document_error_codes for select to authenticated
using (true);

do $$
declare
  managed_table text;
  policy_name text;
begin
  foreach managed_table in array array[
    'product_extraction_field_rules',
    'product_document_processing_attempts',
    'product_document_pages',
    'product_field_provenance',
    'product_field_locks',
    'product_change_proposals',
    'product_field_change_history',
    'product_document_review_items',
    'product_ingestion_audit_events'
  ] loop
    policy_name := managed_table || '_admin_select';
    execute format('drop policy if exists %I on public.%I', policy_name, managed_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_manage_product_ingestion())',
      policy_name,
      managed_table
    );
  end loop;
end $$;

revoke all on table public.documents from anon, authenticated;
revoke all on table public.product_documents from anon, authenticated;
revoke all on table public.product_document_error_codes from anon, authenticated;
revoke all on table public.product_extraction_field_rules from anon, authenticated;
revoke all on table public.product_document_processing_attempts from anon, authenticated;
revoke all on table public.product_document_pages from anon, authenticated;
revoke all on table public.product_field_provenance from anon, authenticated;
revoke all on table public.product_field_locks from anon, authenticated;
revoke all on table public.product_change_proposals from anon, authenticated;
revoke all on table public.product_field_change_history from anon, authenticated;
revoke all on table public.product_document_review_items from anon, authenticated;
revoke all on table public.product_ingestion_audit_events from anon, authenticated;

grant select on table public.documents to authenticated;
grant select on table public.product_documents to authenticated;
grant select on table public.product_document_error_codes to authenticated;
grant select on table public.product_extraction_field_rules to authenticated;
grant select on table public.product_document_processing_attempts to authenticated;
grant select on table public.product_document_pages to authenticated;
grant select on table public.product_field_provenance to authenticated;
grant select on table public.product_field_locks to authenticated;
grant select on table public.product_change_proposals to authenticated;
grant select on table public.product_field_change_history to authenticated;
grant select on table public.product_document_review_items to authenticated;
grant select on table public.product_ingestion_audit_events to authenticated;

revoke all on table public.published_product_documents from public, anon;
revoke all on table public.published_product_field_sources from public, anon;
revoke all on table public.failed_product_documents_admin from public, anon;
revoke all on table public.product_document_processing_stats_admin from public, anon;
grant select on table public.published_product_documents to authenticated;
grant select on table public.published_product_field_sources to authenticated;
grant select on table public.failed_product_documents_admin to authenticated;
grant select on table public.product_document_processing_stats_admin to authenticated;

grant all on table public.documents to service_role;
grant all on table public.product_documents to service_role;
grant all on table public.product_document_error_codes to service_role;
grant all on table public.product_extraction_field_rules to service_role;
grant all on table public.product_document_processing_attempts to service_role;
grant all on table public.product_document_pages to service_role;
grant all on table public.product_field_provenance to service_role;
grant all on table public.product_field_locks to service_role;
grant all on table public.product_change_proposals to service_role;
grant all on table public.product_field_change_history to service_role;
grant all on table public.product_document_review_items to service_role;
grant all on table public.product_ingestion_audit_events to service_role;
grant select on table public.published_product_documents to service_role;
grant select on table public.published_product_field_sources to service_role;
grant select on table public.failed_product_documents_admin to service_role;
grant select on table public.product_document_processing_stats_admin to service_role;

revoke all on function public.can_manage_product_ingestion() from public, anon;
grant execute on function public.can_manage_product_ingestion() to authenticated, service_role;

revoke all on function public.begin_product_document_processing(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_product_document_processing(uuid, text, text, text, uuid)
  to service_role;

revoke all on function public.stage_product_document_extraction(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.stage_product_document_extraction(uuid, uuid, jsonb, jsonb)
  to service_role;

revoke all on function public.stage_product_document_pages(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.stage_product_document_pages(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.complete_product_document_processing(
  uuid, text, text, text, text, text, integer, integer, integer, integer,
  integer[], text[], integer, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_product_document_processing(
  uuid, text, text, text, text, text, integer, integer, integer, integer,
  integer[], text[], integer, jsonb, jsonb, timestamptz
) to service_role;

revoke all on function public.review_product_change_proposal(uuid, text, text)
  from public, anon;
grant execute on function public.review_product_change_proposal(uuid, text, text)
  to authenticated;

revoke all on function public.approve_and_apply_product_change(uuid, text)
  from public, anon;
grant execute on function public.approve_and_apply_product_change(uuid, text)
  to authenticated;

revoke all on function public.revert_applied_product_change(uuid, text)
  from public, anon;
grant execute on function public.revert_applied_product_change(uuid, text)
  to authenticated;

revoke all on function public.review_product_document_item(uuid, text, text)
  from public, anon;
grant execute on function public.review_product_document_item(uuid, text, text)
  to authenticated;

revoke all on function public.record_product_change_application(uuid, text, jsonb, jsonb, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_product_change_application(uuid, text, jsonb, jsonb, uuid, jsonb)
  to service_role;

revoke all on function public.write_product_ingestion_audit_event(text, text, uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.audit_product_ingestion_change() from public, anon, authenticated;
revoke all on function public.prevent_product_ingestion_history_mutation() from public, anon, authenticated;
revoke all on function public.enforce_product_document_relation() from public, anon, authenticated;
revoke all on function public.prepare_product_document_attempt() from public, anon, authenticated;
revoke all on function public.protect_product_document_attempt_history() from public, anon, authenticated;
revoke all on function public.sync_product_document_processing_summary() from public, anon, authenticated;
revoke all on function public.enforce_product_document_page_scope() from public, anon, authenticated;
revoke all on function public.enforce_product_field_provenance_scope() from public, anon, authenticated;
revoke all on function public.guard_product_change_proposal() from public, anon, authenticated;
revoke all on function public.set_product_technical_field_value(uuid, uuid, text, jsonb)
  from public, anon, authenticated;

comment on table public.product_document_processing_attempts is
  'Immutable attempt history for the existing PDF reader. Internal errors and stack traces are service/admin-only.';
comment on table public.product_document_pages is
  'Per-page text, OCR and table extraction results for global product datasheets.';
comment on table public.product_field_provenance is
  'Source evidence for every extracted product or variant field, including PDF page and confidence.';
comment on table public.product_change_proposals is
  'Reviewable differences between current catalog values and newly extracted values; never stores price or stock updates.';
comment on table public.product_field_change_history is
  'Append-only before/after snapshots for applied and reverted technical-field changes.';
comment on table public.product_document_review_items is
  'Administrative review queue for failed documents, uncertain matches, new products and field conflicts.';
comment on view public.published_product_documents is
  'Sanitized customer-facing product/document links. Internal paths and processing errors are intentionally omitted.';
comment on view public.failed_product_documents_admin is
  'Admin list source for partial, unreadable and failed product datasheets. Access is constrained by base-table RLS.';
comment on function public.stage_product_document_extraction(uuid, uuid, jsonb, jsonb) is
  'Atomically matches or creates needs_review products, stages document links, provenance, proposals and review items without updating commercial data.';
comment on function public.stage_product_document_pages(uuid, uuid, jsonb) is
  'Idempotently stores text/OCR/table output per PDF page while isolating page-level failures.';
comment on function public.approve_and_apply_product_change(uuid, text) is
  'Atomically approves and applies a whitelisted technical field, verifies its provenance and records a reversible before/after snapshot.';
comment on function public.revert_applied_product_change(uuid, text) is
  'Atomically restores the before-value of an applied technical change when the catalog value has not changed again.';
comment on function public.review_product_document_item(uuid, text, text) is
  'Permission-checked approval or rejection for product-level datasheet review items; ambiguous identities must be resolved before approval.';
