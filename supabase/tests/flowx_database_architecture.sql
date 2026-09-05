begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth, pg_catalog;
select plan(48);

select has_table('public', 'project_systems', 'project systems exist');
select has_table('public', 'project_buildings', 'project buildings exist');
select has_table('public', 'project_floors', 'project floors exist');
select has_table('public', 'project_zones', 'project zones exist');
select has_table('public', 'project_positions', 'project positions exist');
select has_table('public', 'requirement_reviews', 'requirement reviews exist');
select has_table('public', 'unit_definitions', 'unit definitions exist');
select has_table('public', 'unit_conversions', 'unit conversions exist');
select has_table('public', 'attribute_synonyms', 'attribute synonyms exist');
select has_table('public', 'product_families', 'product families exist');
select has_table('public', 'product_document_versions', 'product document versions exist');
select has_table('public', 'product_images', 'product images exist');
select has_table('public', 'approval_conditions', 'approval conditions exist');
select has_table('public', 'rule_packages', 'rule packages exist');
select has_table('public', 'rule_package_versions', 'rule package versions exist');
select has_table('public', 'rule_definitions', 'rule definitions exist');
select has_table('public', 'compatibility_rule_conditions', 'compatibility conditions exist');
select has_table('public', 'product_compatibility_groups', 'compatibility groups exist');
select has_table('public', 'price_lists', 'price lists exist');
select has_table('public', 'price_list_items', 'price-list items exist');
select has_table('public', 'stock_levels', 'stock observations exist');
select has_table('public', 'lead_times', 'lead-time observations exist');
select has_table('public', 'offer_history', 'offer history exists');
select has_table('public', 'data_sources', 'data sources exist');
select has_table('public', 'data_sets', 'data sets exist');
select has_table('public', 'import_jobs', 'import jobs exist');
select has_table('public', 'import_job_rows', 'import job rows exist');
select has_table('public', 'import_errors', 'import errors exist');
select has_table('public', 'external_product_mappings', 'external product mappings exist');
select has_table('public', 'external_attribute_mappings', 'external attribute mappings exist');
select has_table('public', 'matching_decisions', 'matching decisions exist');
select has_table('public', 'matching_overrides', 'matching overrides exist');
select has_table('public', 'catalog_revision_history', 'catalog revisions exist');

select has_column('public', 'project_requirements', 'requirement_type', 'requirements have normalized types');
select col_type_is(
  'public', 'project_requirements', 'status', 'requirement_review_status',
  'requirement status uses the normalized enum'
);
select has_column('public', 'products', 'data_set_id', 'products carry dataset provenance');
select has_column('public', 'supplier_offers', 'observed_at', 'offers are timestamped observations');

select is(
  (
    select count(*)::integer
    from public.roles
    where organization_id is null
      and slug in ('company_admin', 'project_manager', 'engineer', 'viewer')
  ),
  4,
  'all canonical customer roles exist'
);
select ok(
  exists (
    select 1
    from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.slug = 'company_admin'
      and permission.key = 'member.invite'
  ),
  'company admin inherits member invitation permission'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'organization_members_protect_platform_admin'
      and not tgisinternal
  ),
  'platform admin cannot be assigned through organization membership'
);
select ok(
  to_regprocedure('public.enforce_data_set_quality()') is not null,
  'demo dataset quality guard exists'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'product_attribute_values_enforce_data_set_quality'
      and not tgisinternal
  ),
  'demo attribute verification changes invoke the quality guard'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'projects_enforce_demo_data_set'
      and not tgisinternal
  ),
  'project demo markers are validated by the database'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'match_candidates_eligible_requires_pass'
  ),
  'technical eligibility is enforced by a database constraint'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'material_list_items_selected_technical_gate'
  ),
  'material-list selection is protected by a technical gate'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'requirement_evaluations_refresh_gate'
  ),
  'requirement evaluations refresh the candidate gate'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'compatibility_evaluations_refresh_gate'
  ),
  'compatibility evaluations refresh the candidate gate'
);
select ok(
  (
    select count(*) >= 20
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'project_systems', 'project_buildings', 'project_floors', 'project_zones',
        'project_positions', 'requirement_reviews', 'price_lists', 'import_jobs',
        'matching_decisions', 'data_sets'
      )
  ),
  'new project, import, catalog, and commercial tables have RLS policies'
);

select * from finish();
rollback;
