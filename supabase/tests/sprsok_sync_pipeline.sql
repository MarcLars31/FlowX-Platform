begin;

select plan(38);

select has_table('public', 'sprsok_products', 'Sprsok products table exists');
select has_table('public', 'sprsok_sync_runs', 'Sprsok sync runs table exists');
select has_table('public', 'sprsok_sync_page_logs', 'Sprsok page log exists');
select has_table('public', 'sprsok_sync_errors', 'Sprsok error log exists');
select has_table('public', 'sprsok_review_queue', 'Sprsok review queue exists');
select has_table('public', 'sprsok_datasheet_discovery_queue', 'Datasheet queue exists');
select has_table('public', 'sprsok_product_search_index', 'Search index exists');
select has_view('public', 'sprsok_product_search', 'Customer search view exists');
select has_view('public', 'sprsok_reconciliation_issues', 'Reconciliation view exists');

select is(
  public.normalize_sprsok_article(' 00-12 3.4 '),
  '001234',
  'Article normalization preserves leading zeroes'
);
select is(
  (select count(*) from public.sprsok_products),
  (select count(distinct source || ':' || source_record_key) from public.sprsok_products),
  'Backfill produces unique stable source keys'
);
select is(
  (select count(*) from public.sprsok_products where external_product_id is null),
  0::bigint,
  'Legacy products receive an external id during backfill'
);

create temporary table test_sprsok_state as
select ((public.begin_sprsok_sync(false, false) ->> 'runId')::uuid) as run_id;

select ok((select run_id is not null from test_sprsok_state), 'Sync run starts');

select is(
  (public.upsert_sprsok_product(
    (select run_id from test_sprsok_state),
    '{"source_record_key":"id:__test_created","external_product_id":"__test_created","supplier":"Test Supplier","manufacturer_article_number":"T-001","product_name":"Test head","variant":"Standard","source_status":"active","sin":"T-001","leverandor":"Test Supplier","type":"Test head","utforelse":"Standard","validation_errors":[],"source_data":{"revision":1}}'::jsonb,
    false
  ) ->> 'outcome'),
  'created',
  'First stable source key is created'
);
select is(
  (public.upsert_sprsok_product(
    (select run_id from test_sprsok_state),
    '{"source_record_key":"id:__test_created","external_product_id":"__test_created","supplier":"Test Supplier","manufacturer_article_number":"T-001","product_name":"Test head","variant":"Standard","source_status":"active","sin":"T-001","leverandor":"Test Supplier","type":"Test head","utforelse":"Standard","validation_errors":[],"source_data":{"revision":1}}'::jsonb,
    false
  ) ->> 'outcome'),
  'unchanged',
  'Repeating the same payload is idempotent'
);
select is(
  (public.upsert_sprsok_product(
    (select run_id from test_sprsok_state),
    '{"source_record_key":"id:__test_created","external_product_id":"__test_created","supplier":"Test Supplier","manufacturer_article_number":"T-001","product_name":"Updated head","variant":"Standard","source_status":"active","sin":"T-001","leverandor":"Test Supplier","type":"Updated head","utforelse":"Standard","validation_errors":[],"source_data":{"revision":2}}'::jsonb,
    false
  ) ->> 'outcome'),
  'updated',
  'Changed source payload updates the stable product'
);
select is(
  (select type from public.sprsok_products where source_record_key = 'id:__test_created'),
  'Updated head',
  'Updated display data is stored'
);

select is(
  (public.upsert_sprsok_product(
    (select run_id from test_sprsok_state),
    '{"source_record_key":"article:test:T002:qr","supplier":"Test","manufacturer_article_number":"T-002","product_name":"Head","variant":"QR","sin":"T-002","leverandor":"Test","type":"Head","utforelse":"QR","validation_errors":[],"source_data":{"variant":"QR"}}'::jsonb,
    false
  ) ->> 'outcome'),
  'created',
  'First fallback variant is created'
);
select is(
  (public.upsert_sprsok_product(
    (select run_id from test_sprsok_state),
    '{"source_record_key":"article:test:T002:standard","supplier":"Test","manufacturer_article_number":"T-002","product_name":"Head","variant":"Standard","sin":"T-002","leverandor":"Test","type":"Head","utforelse":"Standard","validation_errors":[],"source_data":{"variant":"Standard"}}'::jsonb,
    false
  ) ->> 'outcome'),
  'created',
  'Second fallback variant is created separately'
);
select is(
  (select count(*) from public.sprsok_products where sin = 'T-002' and supplier = 'Test'),
  2::bigint,
  'Similar product names and SIN values do not merge variants'
);

select is(
  (public.upsert_sprsok_product(
    (select run_id from test_sprsok_state),
    '{"source_record_key":"id:__test_incomplete","external_product_id":"__test_incomplete","product_name":"Incomplete","type":"Incomplete","validation_errors":["missing_supplier","missing_article_number"],"source_data":{"incomplete":true}}'::jsonb,
    false
  ) ->> 'outcome'),
  'review',
  'Incomplete stable product is sent to review'
);
select ok(
  exists(select 1 from public.sprsok_review_queue where source_record_key = 'id:__test_incomplete' and status = 'pending'),
  'Incomplete product remains visible in the review queue'
);
select is(
  (public.upsert_sprsok_product(
    (select run_id from test_sprsok_state),
    '{"source_record_key":"","product_name":"No identity","validation_errors":["missing_supplier","missing_article_number"],"source_data":{"no_identity":true}}'::jsonb,
    false
  ) ->> 'outcome'),
  'review',
  'Row without a stable identity is retained for review'
);
select is(
  (select count(*) from public.sprsok_products where product_name = 'No identity'),
  0::bigint,
  'Row without identity cannot become a product'
);

update public.sprsok_products
set manual_locked_fields = array['type']::text[]
where source_record_key = 'id:__test_created';
select lives_ok(
  format(
    'select public.upsert_sprsok_product(%L::uuid, %L::jsonb, false)',
    (select run_id from test_sprsok_state),
    '{"source_record_key":"id:__test_created","external_product_id":"__test_created","supplier":"Test Supplier","manufacturer_article_number":"T-001","product_name":"Blocked overwrite","variant":"Standard","sin":"T-001","leverandor":"Test Supplier","type":"Blocked overwrite","utforelse":"Standard","validation_errors":[],"source_data":{"revision":3}}'
  ),
  'Upsert with a manually locked field succeeds'
);
select is(
  (select type from public.sprsok_products where source_record_key = 'id:__test_created'),
  'Updated head',
  'Manual lock prevents source overwrite'
);

select is(
  (public.reindex_sprsok_products(array['id:__test_created'], true) ->> 'indexed')::integer,
  0,
  'Reindex dry-run does not write'
);
select ok(
  (public.reindex_sprsok_products(array['id:__test_created'], false) ->> 'indexed')::integer >= 1,
  'Explicit reindex writes selected products'
);
select ok(
  exists(select 1 from public.sprsok_product_search where source_record_key = 'id:__test_created'),
  'Valid product is visible in customer search view'
);

select lives_ok(
  format(
    'select public.queue_sprsok_datasheet(%L::uuid, %L)',
    (select run_id from test_sprsok_state),
    'id:__test_created'
  ),
  'Datasheet discovery can be queued separately'
);
select ok(
  exists(select 1 from public.sprsok_datasheet_discovery_queue where source_record_key = 'id:__test_created'),
  'Datasheet queue contains imported product'
);

select lives_ok(
  format(
    'select public.record_sprsok_sync_page(%L::uuid, %L::jsonb, 3, %L::jsonb, 3)',
    (select run_id from test_sprsok_state),
    '{"cursor":null,"offset":0,"pageNumber":1}',
    'null'
  ),
  'Page progress can be recorded'
);
select is(
  (select count(*) from public.sprsok_sync_page_logs where run_id = (select run_id from test_sprsok_state)),
  1::bigint,
  'Page log contains one page'
);
select lives_ok(
  format(
    'select public.record_sprsok_sync_error(%L::uuid, %L, null, %L::jsonb, %L)',
    (select run_id from test_sprsok_state),
    'product',
    '{}',
    'test failure'
  ),
  'A product error does not abort the run'
);
select is(
  (select count(*) from public.sprsok_sync_errors where run_id = (select run_id from test_sprsok_state)),
  1::bigint,
  'Structured error is retained'
);
select lives_ok(
  format(
    'select public.finish_sprsok_sync(%L::uuid, %L, %L::jsonb, %L::jsonb)',
    (select run_id from test_sprsok_state),
    'completed',
    '{"cursor":null,"offset":3,"pageNumber":2}',
    '{"sourceTotal":3,"pages":1,"received":3,"accepted":3,"rejected":0,"created":3,"updated":0,"unchanged":0,"review":0,"errors":0,"datasheetQueueErrors":0}'
  ),
  'Run can be completed with exact counters'
);
select is(
  (select status from public.sprsok_sync_runs where id = (select run_id from test_sprsok_state)),
  'completed',
  'Completed run has completed status'
);
select ok(
  exists(select 1 from public.sprsok_products where source_record_key = 'id:__test_created'),
  'Synchronization never automatically deletes a product'
);

select * from finish();
rollback;
