begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth, pg_catalog;
select plan(8);

select has_table(
  'public',
  'product_learning_events',
  'append-only product learning events are present'
);

select has_view(
  'public',
  'product_candidate_training_examples',
  'candidate labels are exposed through a training view'
);

select has_view(
  'public',
  'requirement_correction_training_examples',
  'PDF corrections are exposed through a training view'
);

select has_view(
  'public',
  'product_learning_feedback_summary',
  'feedback readiness is exposed through a summary view'
);

select ok(
  exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'record_product_candidate_impression'
  ),
  'candidate impression RPC is present'
);

select function_privs_are(
  'public',
  'record_product_candidate_impression',
  array['uuid', 'uuid', 'jsonb'],
  'authenticated',
  array['EXECUTE'],
  'authenticated reviewers can record candidate impressions'
);

select table_privs_are(
  'public',
  'product_learning_events',
  'authenticated',
  array['SELECT'],
  'learning events are readable but append-only for authenticated users'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_learning_events'
      and policyname = 'product_learning_events_select'
  ),
  'learning events have an organization-scoped select policy'
);

select * from finish();
rollback;
