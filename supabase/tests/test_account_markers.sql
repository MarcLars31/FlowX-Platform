begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth, pg_catalog;
select plan(15);

select has_column('public', 'profiles', 'is_test_account', 'profiles have an explicit test marker');
select has_column('public', 'profiles', 'test_account_fixture', 'profiles store the fixture namespace');
select has_column('public', 'profiles', 'test_account_key', 'profiles store the stable fixture key');
select has_column('public', 'organizations', 'is_test_organization', 'organizations have an explicit test marker');
select has_column('public', 'organizations', 'test_organization_fixture', 'organizations store the fixture namespace');
select has_column('public', 'organizations', 'test_organization_key', 'organizations store the stable fixture key');
select has_index('public', 'profiles', 'profiles_test_account_fixture_key_unique', 'test profile identities are unique');
select has_index('public', 'organizations', 'organizations_test_fixture_key_unique', 'test organization identities are unique');
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_test_account', 'UPDATE'),
  'authenticated users cannot mark their own profile as a test account'
);
select ok(
  not has_column_privilege('authenticated', 'public.organizations', 'is_test_organization', 'UPDATE'),
  'authenticated users cannot mark an organization as a fixture'
);

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
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  '',
  now(),
  '{"provider":"email","providers":["email"],"is_test_account":true,"test_account_fixture":"pgtap_fixture"}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
from (
  values
    ('54000000-0000-4000-8000-000000000001'::uuid, 'marker-1@example.test'),
    ('54000000-0000-4000-8000-000000000002'::uuid, 'marker-2@example.test')
) fixture(id, email);

select lives_ok(
  $$
    update public.profiles
    set
      is_test_account = true,
      test_account_fixture = 'pgtap_fixture',
      test_account_key = 'marker_1'
    where id = '54000000-0000-4000-8000-000000000001'
  $$,
  'a fully marked test profile is valid'
);

select is(
  (
    select is_test_account
    from public.profiles
    where id = '54000000-0000-4000-8000-000000000001'
  ),
  true,
  'the explicit profile marker is persisted'
);

select throws_ok(
  $$
    update public.profiles
    set test_account_fixture = 'pgtap_fixture'
    where id = '54000000-0000-4000-8000-000000000002'
  $$,
  'an unmarked profile cannot carry fixture metadata'
);

select throws_ok(
  $$
    update public.profiles
    set
      is_test_account = true,
      test_account_fixture = 'pgtap_fixture',
      test_account_key = 'marker_1'
    where id = '54000000-0000-4000-8000-000000000002'
  $$,
  'duplicate fixture profile identities are rejected'
);

insert into public.organizations (
  id,
  name,
  status,
  is_test_organization,
  test_organization_fixture,
  test_organization_key
)
values (
  '55000000-0000-4000-8000-000000000001',
  'Safe fixture organization',
  'active',
  true,
  'pgtap_fixture',
  'safe_fixture'
);

select is(
  (
    select test_organization_key
    from public.organizations
    where id = '55000000-0000-4000-8000-000000000001'
  ),
  'safe_fixture',
  'a fully marked test organization is persisted'
);

select * from finish();
rollback;
