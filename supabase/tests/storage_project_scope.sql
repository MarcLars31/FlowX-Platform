begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth, pg_catalog;
select plan(6);

select has_table('storage', 'objects', 'project file storage is available');
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_select'
  ),
  'project file reads have a dedicated policy'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_insert'
  ),
  'project file uploads have a dedicated policy'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_delete'
  ),
  'project file deletion has a dedicated policy'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_select'
      and qual::text like '%can_access_project%'
  ),
  'reads are scoped to project access'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_insert'
      and with_check::text like '%document.upload%'
  ),
  'uploads require the document upload permission'
);

select * from finish();
rollback;
