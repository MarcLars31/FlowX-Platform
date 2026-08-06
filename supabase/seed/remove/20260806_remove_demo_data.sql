-- Explicit and idempotent removal of the FlowX fictional demo fixture.
-- This file is never run by the normal seed command. It only removes stable
-- IDs after verifying that the dataset still has the expected demo identity.

begin;

do $$
declare
  dataset public.data_sets;
begin
  select data_set.*
  into dataset
  from public.data_sets data_set
  where data_set.id = 'd0000000-0000-4000-8000-000000000002';

  if dataset.id is null then
    return;
  end if;

  if dataset.code <> 'flowx_demo_catalog'
    or dataset.data_mode <> 'demo'
    or dataset.quality_status <> 'demo_unverified'
    or dataset.disclaimer is distinct from
      'Demo data – ej verifierad för projektering, installation eller inköp.' then
    raise exception 'Refusing to remove data: the stable demo dataset identity no longer matches.';
  end if;
end
$$;

delete from public.material_list_items
where id = 'd0000000-0000-4000-8000-000000000142';
delete from public.material_list_versions
where id = 'd0000000-0000-4000-8000-000000000141';
delete from public.material_lists
where id = 'd0000000-0000-4000-8000-000000000140';

delete from public.matching_decisions
where id = 'd0000000-0000-4000-8000-000000000133';
delete from public.requirement_evaluations
where id = 'd0000000-0000-4000-8000-000000000132';
delete from public.match_candidates
where id = 'd0000000-0000-4000-8000-000000000131';
delete from public.match_runs
where id = 'd0000000-0000-4000-8000-000000000130';

delete from public.requirement_evidence
where id = 'd0000000-0000-4000-8000-000000000122';
delete from public.project_requirements
where id = 'd0000000-0000-4000-8000-000000000121';
delete from public.requirement_sets
where id = 'd0000000-0000-4000-8000-000000000120';

delete from public.extraction_runs
where id = 'd0000000-0000-4000-8000-000000000118';
delete from public.document_pages
where id = 'd0000000-0000-4000-8000-000000000117';
delete from public.project_documents
where id = 'd0000000-0000-4000-8000-000000000116';

delete from public.project_system_zones
where project_system_id = 'd0000000-0000-4000-8000-000000000111'
  and project_zone_id = 'd0000000-0000-4000-8000-000000000114';
delete from public.project_positions
where id = 'd0000000-0000-4000-8000-000000000115';
delete from public.project_zones
where id = 'd0000000-0000-4000-8000-000000000114';
delete from public.project_floors
where id = 'd0000000-0000-4000-8000-000000000113';
delete from public.project_buildings
where id = 'd0000000-0000-4000-8000-000000000112';
delete from public.project_systems
where id = 'd0000000-0000-4000-8000-000000000111';
delete from public.projects
where id = 'd0000000-0000-4000-8000-000000000110';

delete from public.supplier_offers
where data_set_id = 'd0000000-0000-4000-8000-000000000002';
delete from public.supplier_products
where data_set_id = 'd0000000-0000-4000-8000-000000000002';
delete from public.suppliers
where id = 'd0000000-0000-4000-8000-000000000100';

delete from public.approval_conditions
where product_approval_id in (
  select id
  from public.product_approvals
  where data_set_id = 'd0000000-0000-4000-8000-000000000002'
);
delete from public.product_approvals
where data_set_id = 'd0000000-0000-4000-8000-000000000002';
delete from public.approvals
where data_set_id = 'd0000000-0000-4000-8000-000000000002';
delete from public.product_attribute_values
where data_set_id = 'd0000000-0000-4000-8000-000000000002';
delete from public.product_variants
where data_set_id = 'd0000000-0000-4000-8000-000000000002';
delete from public.products
where data_set_id = 'd0000000-0000-4000-8000-000000000002';
delete from public.product_families
where id in (
  'd0000000-0000-4000-8000-000000000030',
  'd0000000-0000-4000-8000-000000000031'
);
delete from public.attribute_definitions
where data_set_id = 'd0000000-0000-4000-8000-000000000002';
delete from public.unit_definitions
where id in (
  'd0000000-0000-4000-8000-000000000060',
  'd0000000-0000-4000-8000-000000000061',
  'd0000000-0000-4000-8000-000000000062',
  'd0000000-0000-4000-8000-000000000063'
);
delete from public.categories
where id in (
  'd0000000-0000-4000-8000-000000000020',
  'd0000000-0000-4000-8000-000000000021'
);
delete from public.manufacturers
where id = 'd0000000-0000-4000-8000-000000000010';

delete from public.catalog_revision_history
where data_set_id = 'd0000000-0000-4000-8000-000000000002';
-- Audit logs are intentionally append-only and hold a restrictive foreign key
-- to the organization. Preserve the empty organization shell and deactivate it
-- instead of weakening audit history to make fixture removal possible.
update public.organizations
set status = 'disabled', updated_at = now()
where id = 'd0000000-0000-4000-8000-000000000003'
  and organization_number = 'DEMO-000001';

delete from public.data_sets
where id = 'd0000000-0000-4000-8000-000000000002'
  and code = 'flowx_demo_catalog'
  and data_mode = 'demo';
delete from public.data_sources
where id = 'd0000000-0000-4000-8000-000000000001'
  and code = 'scipx_demo'
  and source_type = 'demo';

commit;
