begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth, pg_catalog;
select plan(21);

select has_table('public', 'document_pages', 'document pages are present');
select has_table('public', 'extraction_runs', 'extraction runs are present');
select has_table('public', 'requirement_candidates', 'requirement candidates are present');
select has_table('public', 'requirement_sets', 'requirement sets are present');
select has_table('public', 'requirement_evidence', 'requirement evidence is present');
select has_table('public', 'attribute_definitions', 'attribute definitions are present');
select has_table('public', 'product_attribute_values', 'typed product attributes are present');
select has_table('public', 'supplier_offers', 'organization-scoped supplier offers are present');
select has_table('public', 'match_runs', 'match runs are present');
select has_table('public', 'requirement_evaluations', 'requirement evaluations are present');
select has_table('public', 'material_list_versions', 'material list versions are present');
select has_table('public', 'exports', 'exports are present');
select has_table('public', 'organization_join_requests', 'organization join requests are present');
select has_column('public', 'project_documents', 'checksum', 'project documents have checksums');
select has_column('public', 'project_requirements', 'source_candidate_id', 'confirmed requirements link to candidates');
select has_column('public', 'organizations', 'country_code', 'organizations have country codes');
select has_column('public', 'profiles', 'job_title', 'profiles have job titles');
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'requirement_candidates'
      and policyname = 'requirement_candidates_select'
  ),
  'requirement candidates have an explicit RLS select policy'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'document_pages'
      and policyname = 'document_pages_update_technical_description'
      and cmd = 'UPDATE'
  ),
  'technical-description retries can update existing document pages'
);
select ok(
  exists (select 1 from storage.buckets where id = 'project-files' and public = false),
  'project-files storage bucket is private'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organization_join_requests'
      and policyname = 'organization_join_requests_select_authorized'
  ),
  'join requests have an explicit RLS select policy'
);

select * from finish();
rollback;
