-- Test-account markers are deliberately stored separately from the email address.
-- Cleanup tooling must require both these database markers and matching protected
-- Auth app_metadata before it may delete an account.

alter table public.profiles
  add column if not exists is_test_account boolean not null default false,
  add column if not exists test_account_fixture text,
  add column if not exists test_account_key text;

alter table public.profiles
  drop constraint if exists profiles_test_account_markers_check;

alter table public.profiles
  add constraint profiles_test_account_markers_check
  check (
    (
      is_test_account = false
      and test_account_fixture is null
      and test_account_key is null
    )
    or
    (
      is_test_account = true
      and test_account_fixture ~ '^[a-z][a-z0-9_-]{2,63}$'
      and test_account_key ~ '^[a-z][a-z0-9_-]{2,63}$'
    )
  );

create unique index if not exists profiles_test_account_fixture_key_unique
  on public.profiles (test_account_fixture, test_account_key)
  where is_test_account = true;

comment on column public.profiles.is_test_account is
  'Explicit server-managed test-account marker. Never infer this from email.';
comment on column public.profiles.test_account_fixture is
  'Versioned fixture namespace used by environment-gated test tooling.';
comment on column public.profiles.test_account_key is
  'Stable identity inside a test fixture; not an authentication credential.';

-- Existing column-level grants intentionally do not include the marker columns.
-- Repeat the revocation defensively in case a broad grant existed in an older
-- environment. service_role retains table-owner/bypass access for seed tooling.
revoke update (
  is_test_account,
  test_account_fixture,
  test_account_key
) on public.profiles from public, anon, authenticated;

-- Test organizations use equally explicit markers. A name match is never enough
-- for the fixture tool to reuse or modify an organization.
alter table public.organizations
  add column if not exists is_test_organization boolean not null default false,
  add column if not exists test_organization_fixture text,
  add column if not exists test_organization_key text;

alter table public.organizations
  drop constraint if exists organizations_test_fixture_markers_check;

alter table public.organizations
  add constraint organizations_test_fixture_markers_check
  check (
    (
      is_test_organization = false
      and test_organization_fixture is null
      and test_organization_key is null
    )
    or
    (
      is_test_organization = true
      and test_organization_fixture ~ '^[a-z][a-z0-9_-]{2,63}$'
      and test_organization_key ~ '^[a-z][a-z0-9_-]{2,63}$'
    )
  );

create unique index if not exists organizations_test_fixture_key_unique
  on public.organizations (
    test_organization_fixture,
    test_organization_key
  )
  where is_test_organization = true;

comment on column public.organizations.is_test_organization is
  'Explicit server-managed marker for an isolated fixture organization.';

revoke update (
  is_test_organization,
  test_organization_fixture,
  test_organization_key
) on public.organizations from public, anon, authenticated;
