begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth, pg_catalog;
select plan(92);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'product-reviewer@flowx.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

select has_table('public', 'product_document_error_codes', 'error-code taxonomy is present');
select has_table('public', 'product_extraction_field_rules', 'configurable extraction rules are present');
select has_table('public', 'product_document_processing_attempts', 'processing attempt history is present');
select has_table('public', 'product_document_pages', 'page extraction results are present');
select has_table('public', 'product_field_provenance', 'field provenance is present');
select has_table('public', 'product_field_locks', 'manual field locks are present');
select has_table('public', 'product_change_proposals', 'change proposals are present');
select has_table('public', 'product_field_change_history', 'reversible field history is present');
select has_table('public', 'product_document_review_items', 'product document review queue is present');
select has_table('public', 'product_ingestion_audit_events', 'global ingestion audit log is present');

select has_view('public', 'published_product_documents', 'sanitized product document view is present');
select has_view('public', 'published_product_field_sources', 'sanitized provenance view is present');
select has_view('public', 'failed_product_documents_admin', 'failed document administration view is present');
select has_view('public', 'product_document_processing_stats_admin', 'processing statistics view is present');

select has_column('public', 'documents', 'current_processing_status', 'documents expose current reader status');
select has_column('public', 'documents', 'current_processing_attempt_id', 'documents link to their current attempt');
select has_column('public', 'documents', 'pdf_sha256', 'documents store a PDF hash');
select has_column('public', 'documents', 'manual_review_status', 'documents expose manual review state');
select has_column('public', 'documents', 'max_automatic_retries', 'automatic retries have a bounded per-document limit');
select has_column('public', 'product_documents', 'product_variant_id', 'product links may identify a variant');
select has_column('public', 'product_documents', 'processing_attempt_id', 'product links retain the source attempt');
select has_column('public', 'product_documents', 'page_numbers', 'product links retain every matching PDF page');
select has_column('public', 'product_documents', 'match_method', 'product links retain their matching method');
select has_column('public', 'product_documents', 'match_score', 'product links retain their matching score');
select has_column('public', 'product_documents', 'verification_status', 'product links have an independent verification state');

select has_function(
  'public',
  'begin_product_document_processing',
  array['uuid', 'text', 'text', 'text', 'uuid'],
  'idempotent begin-processing RPC is present'
);
select has_function(
  'public',
  'complete_product_document_processing',
  array[
    'uuid', 'text', 'text', 'text', 'text', 'text', 'integer', 'integer',
    'integer', 'integer', 'integer[]', 'text[]', 'integer', 'jsonb', 'jsonb',
    'timestamp with time zone'
  ],
  'complete-processing RPC is present'
);
select has_function(
  'public',
  'stage_product_document_extraction',
  array['uuid', 'uuid', 'jsonb', 'jsonb'],
  'atomic review-first staging RPC is present'
);
select has_function(
  'public',
  'stage_product_document_pages',
  array['uuid', 'uuid', 'jsonb'],
  'idempotent page staging RPC is present'
);
select has_function(
  'public',
  'review_product_change_proposal',
  array['uuid', 'text', 'text'],
  'proposal review RPC is present'
);
select has_function(
  'public',
  'record_product_change_application',
  array['uuid', 'text', 'jsonb', 'jsonb', 'uuid', 'jsonb'],
  'change application history RPC is present'
);
select has_function(
  'public',
  'approve_and_apply_product_change',
  array['uuid', 'text'],
  'atomic technical-field approval RPC is present'
);
select has_function(
  'public',
  'revert_applied_product_change',
  array['uuid', 'text'],
  'atomic technical-field revert RPC is present'
);
select has_function(
  'public',
  'review_product_document_item',
  array['uuid', 'text', 'text'],
  'product-level document review RPC is present'
);
select has_function('public', 'can_manage_product_ingestion', array[]::text[], 'ingestion authorization helper is present');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.documents'::regclass),
  'documents have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.product_document_processing_attempts'::regclass),
  'processing attempts have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.product_change_proposals'::regclass),
  'change proposals have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.product_ingestion_audit_events'::regclass),
  'ingestion audit events have RLS enabled'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'documents'
      and policyname = 'documents_ingestion_admin_select'
  ),
  'documents have an explicit ingestion-admin policy'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'product_documents'
      and policyname = 'product_documents_ingestion_admin_select'
  ),
  'product document relations have an explicit ingestion-admin policy'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'product_document_review_items'
      and policyname = 'product_document_review_items_admin_select'
  ),
  'review items have an explicit ingestion-admin policy'
);

select has_index('public', 'product_document_processing_attempts', 'product_document_attempts_document_idx', 'attempt history is indexed by document');
select has_index('public', 'product_documents', 'product_documents_current_relation_uidx', 'current many-to-many links are unique');
select has_index('public', 'product_field_provenance', 'product_field_provenance_document_idx', 'provenance is indexed by source document');
select has_index('public', 'documents', 'documents_failed_review_idx', 'failed documents have a review-list index');

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.product_field_change_history'::regclass
      and tgname = 'product_field_change_history_prevent_update'
      and not tgisinternal
  ),
  'field change history is append-only'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.product_ingestion_audit_events'::regclass
      and tgname = 'product_ingestion_audit_events_prevent_delete'
      and not tgisinternal
  ),
  'ingestion audit events cannot be deleted'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.begin_product_document_processing(uuid,text,text,text,uuid)',
    'execute'
  ),
  'anonymous users cannot start document processing'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.begin_product_document_processing(uuid,text,text,text,uuid)',
    'execute'
  ),
  'authenticated clients cannot start the service reader directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.begin_product_document_processing(uuid,text,text,text,uuid)',
    'execute'
  ),
  'the service role can start document processing'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.stage_product_document_extraction(uuid,uuid,jsonb,jsonb)',
    'execute'
  ),
  'the service role can atomically stage extractor output'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.stage_product_document_pages(uuid,uuid,jsonb)',
    'execute'
  ),
  'the service role can stage page-level parser and OCR output'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.review_product_change_proposal(uuid,text,text)',
    'execute'
  ),
  'authenticated reviewers can call the permission-checked review RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.approve_and_apply_product_change(uuid,text)',
    'execute'
  ),
  'authenticated reviewers can call the permission-checked atomic apply RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.review_product_document_item(uuid,text,text)',
    'execute'
  ),
  'authenticated reviewers can call the permission-checked product review RPC'
);

select is(
  (select count(*)::integer from public.product_document_error_codes),
  16,
  'the documented error taxonomy is seeded'
);
select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'product-documents'
      and public = false
  ),
  'product datasheets are stored in a private bucket'
);

insert into public.documents (
  id,
  title,
  status,
  source_url,
  canonical_url,
  original_pdf_url,
  file_name,
  current_processing_status
)
values (
  'd1000000-0000-4000-8000-000000000001',
  'pgTAP product datasheet',
  'needs_review',
  'https://example.invalid/datasheet.pdf',
  'https://example.invalid/datasheet.pdf',
  'https://example.invalid/datasheet.pdf',
  'datasheet.pdf',
  'pending'
);

create temporary table ingestion_test_attempts as
select (public.begin_product_document_processing(
  'd1000000-0000-4000-8000-000000000001',
  'initial',
  'pgtap-initial-v1',
  'pgtap-reader-1'
)).id as initial_attempt_id;

select ok(
  (select initial_attempt_id is not null from ingestion_test_attempts),
  'begin RPC creates a processing attempt'
);
select is(
  (
    select (public.begin_product_document_processing(
      'd1000000-0000-4000-8000-000000000001',
      'initial',
      'pgtap-initial-v1',
      'pgtap-reader-1'
    )).id
  ),
  (select initial_attempt_id from ingestion_test_attempts),
  'begin RPC returns the existing attempt for the same idempotency key'
);
select is(
  (
    select count(*)::integer
    from public.product_document_processing_attempts
    where document_id = 'd1000000-0000-4000-8000-000000000001'
  ),
  1,
  'idempotent begin does not duplicate attempt history'
);
select throws_ok(
  $$
    select public.begin_product_document_processing(
      'd1000000-0000-4000-8000-000000000001',
      'manual_retry',
      'pgtap-overlapping-attempt',
      'pgtap-reader-1'
    )
  $$,
  'a second active attempt is rejected even with a new idempotency key'
);

select lives_ok(
  format(
    'select public.complete_product_document_processing(%L::uuid, %L, null, null, null, null, 1, 1, 0, 0, %L::integer[], %L::text[], 1, %L::jsonb, %L::jsonb, null)',
    (select initial_attempt_id from ingestion_test_attempts),
    'success',
    '{}',
    '{text,table}',
    '{"products":1}',
    '{"duration_ms":10}'
  ),
  'a valid successful result completes the attempt'
);
select is(
  (
    select current_processing_status
    from public.documents
    where id = 'd1000000-0000-4000-8000-000000000001'
  ),
  'success',
  'successful completion updates the document current status'
);
select throws_ok(
  format(
    'select public.complete_product_document_processing(%L::uuid, %L, null, null, null, null, 1, 1)',
    (select initial_attempt_id from ingestion_test_attempts),
    'success'
  ),
  'a completed attempt cannot be completed again'
);

alter table ingestion_test_attempts add column retry_attempt_id uuid;
update ingestion_test_attempts
set retry_attempt_id = (
  select (public.begin_product_document_processing(
    'd1000000-0000-4000-8000-000000000001',
    'manual_retry',
    'pgtap-manual-retry-v1',
    'pgtap-reader-2'
  )).id
);

select ok(
  (select retry_attempt_id is not null from ingestion_test_attempts),
  'a manual retry creates a separate attempt'
);
select lives_ok(
  format(
    'select public.complete_product_document_processing(%L::uuid, %L, %L, %L)',
    (select retry_attempt_id from ingestion_test_attempts),
    'failed',
    'corrupt_file',
    'PDF-filen är skadad.'
  ),
  'a permanent document failure is recorded without deleting prior history'
);
select is(
  (
    select current_processing_status
    from public.documents
    where id = 'd1000000-0000-4000-8000-000000000001'
  ),
  'failed',
  'the newest failed attempt becomes the document current status'
);
select is(
  (
    select count(*)::integer
    from public.product_document_processing_attempts
    where document_id = 'd1000000-0000-4000-8000-000000000001'
  ),
  2,
  'successful and failed attempts remain in history'
);
select is(
  (
    select status
    from public.product_document_processing_attempts
    where id = (select initial_attempt_id from ingestion_test_attempts)
  ),
  'success',
  'a later retry does not mutate the previous successful attempt'
);
select ok(
  exists (
    select 1
    from public.product_ingestion_audit_events
    where entity_type = 'product_document_processing_attempts'
      and entity_id in (
        select initial_attempt_id from ingestion_test_attempts
        union all
        select retry_attempt_id from ingestion_test_attempts
      )
  ),
  'attempt lifecycle changes create ingestion audit events'
);
select throws_ok(
  $$
    select public.begin_product_document_processing(
      'd1000000-0000-4000-8000-000000000001',
      'automatic_retry',
      'pgtap-auto-after-permanent',
      'pgtap-reader-2'
    )
  $$,
  'permanent failures are not retried automatically'
);

insert into public.documents (
  id,
  title,
  status,
  source_url,
  canonical_url,
  original_pdf_url,
  file_name,
  current_processing_status
)
values (
  'd1000000-0000-4000-8000-000000000002',
  'pgTAP variant datasheet',
  'needs_review',
  'https://example.invalid/variants.pdf',
  'https://example.invalid/variants.pdf',
  'https://example.invalid/variants.pdf',
  'variants.pdf',
  'pending'
);

create temporary table variant_test_attempt as
select (public.begin_product_document_processing(
  'd1000000-0000-4000-8000-000000000002',
  'initial',
  'pgtap-variant-attempt',
  'pgtap-reader-variants'
)).id as attempt_id;

create temporary table variant_stage_result as
select public.stage_product_document_extraction(
  (select attempt_id from variant_test_attempt),
  'd1000000-0000-4000-8000-000000000002',
  '[
    {
      "source_key":"variant-a",
      "manufacturer":"pgTAP Variant Supplier",
      "product_no":"SIN-200",
      "sku":"PART-A",
      "product_name":"Shared sprinkler parent",
      "variant_name":"DN 15",
      "confidence":0.99,
      "identifier_observed_in_source":true,
      "page_numbers":[1],
      "fields":{"color":{"normalized_value":"red","confidence":0.99,"page_number":1}}
    },
    {
      "source_key":"variant-b",
      "manufacturer":"pgTAP Variant Supplier",
      "product_no":"SIN-200",
      "sku":"PART-B",
      "product_name":"Shared sprinkler parent",
      "variant_name":"DN 20",
      "confidence":0.99,
      "identifier_observed_in_source":true,
      "page_numbers":[1]
    }
  ]'::jsonb,
  '{"language_code":"en","page_count":1}'::jsonb
) as result;

select is(
  (select (result ->> 'identified_product_count')::integer from variant_stage_result),
  2,
  'two SKU rows are identified'
);
select is(
  (
    select count(*)::integer
    from public.products
    where manufacturer = 'pgTAP Variant Supplier'
      and product_no = 'SIN-200'
  ),
  1,
  'SKU rows share one parent product'
);
select is(
  (
    select count(*)::integer
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where product.manufacturer = 'pgTAP Variant Supplier'
      and variant.sku in ('PART-A', 'PART-B')
  ),
  2,
  'separate part numbers become separate variants'
);
select is(
  (
    select count(*)::integer
    from public.product_documents relation
    join public.products product on product.id = relation.product_id
    where relation.document_id = 'd1000000-0000-4000-8000-000000000002'
      and product.manufacturer = 'pgTAP Variant Supplier'
  ),
  2,
  'the datasheet has a separate current relation for each variant'
);
select is(
  (
    select array_agg(relation.extracted_product_number order by relation.extracted_product_number)
    from public.product_documents relation
    where relation.document_id = 'd1000000-0000-4000-8000-000000000002'
  ),
  array['PART-A', 'PART-B']::text[],
  'product-document relations retain the SKU rather than only the parent SIN'
);
select is(
  (
    select public.stage_product_document_extraction(
      (select attempt_id from variant_test_attempt),
      'd1000000-0000-4000-8000-000000000002',
      '[]'::jsonb,
      '{}'::jsonb
    )
  ),
  (select result from variant_stage_result),
  'repeating a staged attempt returns its original idempotent result'
);
select is(
  (
    select count(*)::integer
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where product.manufacturer = 'pgTAP Variant Supplier'
  ),
  2,
  'idempotent staging does not duplicate variants'
);

create temporary table page_stage_result as
select public.stage_product_document_pages(
  (select attempt_id from variant_test_attempt),
  'd1000000-0000-4000-8000-000000000002',
  '[
    {"page_number":1,"status":"success","extraction_method":"text","language_code":"en","extracted_text":"Page one"},
    {"page_number":2,"status":"failed","extraction_method":"ocr","error_code":"ocr_failed","error_message":"OCR failed"}
  ]'::jsonb
) as result;

select is(
  (select (result ->> 'staged_page_count')::integer from page_stage_result),
  2,
  'page staging accepts successful and failed pages in one call'
);
select is(
  (
    select count(*)::integer
    from public.product_document_pages
    where processing_attempt_id = (select attempt_id from variant_test_attempt)
  ),
  2,
  'page staging stores one row per attempt and page number'
);
select is(
  (
    select failed_page_numbers
    from public.product_document_processing_attempts
    where id = (select attempt_id from variant_test_attempt)
  ),
  array[2]::integer[],
  'failed page numbers are summarized on the current attempt'
);
select is(
  (
    with repeated_stage as materialized (
      select public.stage_product_document_pages(
        (select attempt_id from variant_test_attempt),
        'd1000000-0000-4000-8000-000000000002',
        '[
          {"page_number":1,"status":"success","extraction_method":"text","language_code":"en","extracted_text":"Page one"},
          {"page_number":2,"status":"failed","extraction_method":"ocr","error_code":"ocr_failed","error_message":"OCR failed"}
        ]'::jsonb
      )
    )
    select count(page.id)::integer
    from public.product_document_pages page
    cross join repeated_stage
    where page.processing_attempt_id = (select attempt_id from variant_test_attempt)
  ),
  2,
  'the unique attempt/page key keeps page staging idempotent'
);

set local request.jwt.claims =
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"platform_admin"}}';

select lives_ok(
  $$
    select public.review_product_document_item(
      review_item.id,
      'approved',
      'Approved product candidate by pgTAP'
    )
    from public.product_document_review_items review_item
    where review_item.processing_attempt_id = (select attempt_id from variant_test_attempt)
      and review_item.review_type = 'new_product'
    order by review_item.created_at, review_item.id
  $$,
  'a platform reviewer can approve every identified product and variant candidate'
);
select is(
  (
    select product.status::text
    from public.products product
    where product.manufacturer = 'pgTAP Variant Supplier'
  ),
  'approved',
  'approving the product review publishes the parent product'
);
select is(
  (
    select relation.verification_status
    from public.product_documents relation
    join public.product_change_proposals proposal
      on proposal.product_document_id = relation.id
    where proposal.processing_attempt_id = (select attempt_id from variant_test_attempt)
      and proposal.field_key = 'color'
  ),
  'needs_review',
  'the document relation stays unverified while a field proposal is pending'
);

select lives_ok(
  $$
    select public.approve_and_apply_product_change(
      (
        select proposal.id
        from public.product_change_proposals proposal
        where proposal.processing_attempt_id = (select attempt_id from variant_test_attempt)
          and proposal.field_key = 'color'
      ),
      'Approved by pgTAP'
    )
  $$,
  'a platform reviewer atomically approves and applies a whitelisted technical field'
);
select is(
  (
    select product.color
    from public.products product
    where product.manufacturer = 'pgTAP Variant Supplier'
  ),
  'red',
  'the approved technical value is applied to the parent product'
);
select is(
  (
    select proposal.status
    from public.product_change_proposals proposal
    where proposal.processing_attempt_id = (select attempt_id from variant_test_attempt)
      and proposal.field_key = 'color'
  ),
  'applied',
  'the approved proposal is marked applied in the same transaction'
);
select is(
  (
    select count(*)::integer
    from public.product_field_change_history history
    join public.product_change_proposals proposal on proposal.id = history.proposal_id
    where proposal.processing_attempt_id = (select attempt_id from variant_test_attempt)
      and history.action = 'applied'
  ),
  1,
  'approval stores one reversible before/after snapshot'
);
select lives_ok(
  $$
    select public.revert_applied_product_change(
      (
        select proposal.id
        from public.product_change_proposals proposal
        where proposal.processing_attempt_id = (select attempt_id from variant_test_attempt)
          and proposal.field_key = 'color'
      ),
      'Reverted by pgTAP'
    )
  $$,
  'an applied technical change can be reverted atomically'
);
select is(
  (
    select product.color
    from public.products product
    where product.manufacturer = 'pgTAP Variant Supplier'
  ),
  null::text,
  'revert restores the original technical value'
);

select * from finish();
rollback;
