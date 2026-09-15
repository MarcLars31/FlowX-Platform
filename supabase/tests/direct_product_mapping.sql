begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth, pg_catalog;
select plan(2);

select ok(
  exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'prepare_requirement_for_direct_product_mapping'
  ),
  'direct product mapping preparation RPC is present'
);

select function_privs_are(
  'public',
  'prepare_requirement_for_direct_product_mapping',
  array['uuid', 'uuid'],
  'authenticated',
  array['EXECUTE'],
  'authenticated can prepare an accessible extracted row for product mapping'
);

select * from finish();
rollback;
