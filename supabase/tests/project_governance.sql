begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth, pg_catalog;
select plan(21);

select has_column('public', 'projects', 'project_number', 'projects have organization-scoped project numbers');
select has_column('public', 'projects', 'current_stage', 'projects have a separate workflow stage');
select has_column('public', 'projects', 'owner_user_id', 'projects have an owner user');
select has_table('public', 'project_settings', 'project settings are present');
select has_table('public', 'project_modules', 'project modules are present');
select has_table('public', 'technical_descriptions', 'technical descriptions are present');
select has_table('public', 'technical_description_versions', 'technical description versions are present');
select has_column('public', 'requirement_sets', 'technical_description_version_id', 'requirements link to exact description versions');
select has_column('public', 'analyses', 'requires_review', 'analyses expose review state');
select has_column('public', 'match_runs', 'is_stale', 'match runs expose stale state');
select has_column('public', 'material_lists', 'requires_review', 'material lists expose review state');
select ok(
  exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'create_project_with_defaults'),
  'atomic project creation RPC is present'
);
select ok(
  exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'create_project_with_details'),
  'complete project form creation RPC is present'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'projects_organization_project_number_uidx'),
  'project number uniqueness is scoped to organization'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'project_members_project_user_uidx'),
  'project membership is unique per user'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_settings' and policyname = 'project_settings_select'),
  'project settings have RLS select policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_modules' and policyname = 'project_modules_select'),
  'project modules have RLS select policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technical_descriptions' and policyname = 'technical_descriptions_select'),
  'technical descriptions have RLS select policy'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'projects_workflow_gate'),
  'project completion is guarded by a database trigger'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'technical_description_versions_immutable'),
  'approved description versions are immutable'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'technical_description_versions_stale_results'),
  'new description versions mark dependent results stale'
);

select * from finish();
rollback;
