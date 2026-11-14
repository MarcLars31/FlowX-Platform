-- Idempotent fictional FlowX demonstration dataset.
-- Every technical and commercial row is linked to the dataset below.
-- It must always be displayed with this exact warning:
-- Demo data – ej verifierad för projektering, installation eller inköp.

begin;

insert into public.data_sources (
  id, code, name, source_type, is_active, configuration
) values (
  'd0000000-0000-4000-8000-000000000001',
  'scipx_demo',
  'Scipx fictional demonstration source',
  'demo',
  true,
  '{"fictional":true,"production_use_forbidden":true}'::jsonb
)
on conflict (id) do update
set name = excluded.name,
    source_type = excluded.source_type,
    is_active = excluded.is_active,
    configuration = excluded.configuration,
    updated_at = now(),
    deleted_at = null;

insert into public.data_sets (
  id, data_source_id, code, name, version, data_mode, quality_status,
  disclaimer, source_description, is_active
) values (
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000001',
  'flowx_demo_catalog',
  'FlowX fictional sprinkler catalog',
  '1.0.0',
  'demo',
  'demo_unverified',
  'Demo data – ej verifierad för projektering, installation eller inköp.',
  'Fictional values created solely to exercise FlowX workflows.',
  true
)
on conflict (id) do update
set name = excluded.name,
    version = excluded.version,
    data_mode = excluded.data_mode,
    quality_status = excluded.quality_status,
    disclaimer = excluded.disclaimer,
    source_description = excluded.source_description,
    is_active = excluded.is_active,
    updated_at = now(),
    deleted_at = null;

insert into public.organizations (
  id, name, organization_number, status
) values (
  'd0000000-0000-4000-8000-000000000003',
  'Scipx Demo Company',
  'DEMO-000001',
  'active'
)
on conflict (id) do update
set name = excluded.name,
    organization_number = excluded.organization_number,
    status = excluded.status,
    updated_at = now();

insert into public.manufacturers (
  id, name, normalized_name, country, country_code, notes,
  data_source_id, data_set_id, quality_status, is_active
) values (
  'd0000000-0000-4000-8000-000000000010',
  'Scipx Demo Fire Systems',
  'scipx demo fire systems',
  'Sweden',
  'SE',
  'Fictional manufacturer used only for FlowX demonstrations.',
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'demo_unverified',
  true
)
on conflict (id) do update
set name = excluded.name,
    normalized_name = excluded.normalized_name,
    notes = excluded.notes,
    data_source_id = excluded.data_source_id,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.categories (
  id, name, code, path, level, description, data_set_id, is_active
) values
  (
    'd0000000-0000-4000-8000-000000000020',
    'Demo sprinkler heads', 'demo_sprinkler_heads', 'demo/sprinkler-heads', 1,
    'Fictional sprinkler-head category.',
    'd0000000-0000-4000-8000-000000000002', true
  ),
  (
    'd0000000-0000-4000-8000-000000000021',
    'Demo couplings', 'demo_couplings', 'demo/couplings', 1,
    'Fictional grooved-coupling category.',
    'd0000000-0000-4000-8000-000000000002', true
  )
on conflict (id) do update
set name = excluded.name,
    code = excluded.code,
    path = excluded.path,
    level = excluded.level,
    description = excluded.description,
    data_set_id = excluded.data_set_id,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.product_families (
  id, manufacturer_id, category_id, code, name, description,
  data_set_id, quality_status
) values
  (
    'd0000000-0000-4000-8000-000000000030',
    'd0000000-0000-4000-8000-000000000010',
    'd0000000-0000-4000-8000-000000000020',
    'SDH', 'SDH demo sprinkler family',
    'Fictional standard-response sprinkler family.',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000031',
    'd0000000-0000-4000-8000-000000000010',
    'd0000000-0000-4000-8000-000000000021',
    'DGC', 'DGC demo coupling family',
    'Fictional grooved coupling family.',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  )
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

insert into public.products (
  id, manufacturer, manufacturer_id, product_no, manufacturer_product_number,
  product_name, category, category_id, product_family_id, product_type,
  connection_type, material, available_sizes, status, source_type,
  technical_data, data_source_id, data_set_id, quality_status
) values
  (
    'd0000000-0000-4000-8000-000000000040',
    'Scipx Demo Fire Systems', 'd0000000-0000-4000-8000-000000000010',
    'DEMO-SDH-K80', 'DEMO-SDH-K80', 'SDH K80 pendent sprinkler (demo)',
    'Demo sprinkler heads', 'd0000000-0000-4000-8000-000000000020',
    'd0000000-0000-4000-8000-000000000030', 'sprinkler_head',
    'Threaded', 'Demo brass alloy', 'DN15', 'approved', 'demo',
    '{"demo":true,"responseType":"standard","orientation":"pendent"}'::jsonb,
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000041',
    'Scipx Demo Fire Systems', 'd0000000-0000-4000-8000-000000000010',
    'DEMO-DGC-50', 'DEMO-DGC-50', 'DGC rigid grooved coupling DN50 (demo)',
    'Demo couplings', 'd0000000-0000-4000-8000-000000000021',
    'd0000000-0000-4000-8000-000000000031', 'coupling',
    'Grooved', 'Demo ductile iron', 'DN50', 'approved', 'demo',
    '{"demo":true,"nominalDiameterMm":50,"outsideDiameterMm":60.3}'::jsonb,
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  )
on conflict (id) do update
set product_name = excluded.product_name,
    manufacturer_id = excluded.manufacturer_id,
    category_id = excluded.category_id,
    product_family_id = excluded.product_family_id,
    status = excluded.status,
    source_type = excluded.source_type,
    technical_data = excluded.technical_data,
    data_source_id = excluded.data_source_id,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

insert into public.product_variants (
  id, product_id, sku, manufacturer_sku, variant_name, nominal_size, dn_size,
  outside_diameter_mm, unit_of_measure, technical_status, status,
  data_set_id, quality_status
) values
  (
    'd0000000-0000-4000-8000-000000000050',
    'd0000000-0000-4000-8000-000000000040',
    'DEMO-SDH-K80-DN15', 'DEMO-SDH-K80-DN15', 'K80 / DN15', '1/2 in', 'DN15',
    21.3, 'pcs', 'approved', 'approved',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000051',
    'd0000000-0000-4000-8000-000000000041',
    'DEMO-DGC-50-DN50', 'DEMO-DGC-50-DN50', 'DN50 / OD 60.3 mm', '2 in', 'DN50',
    60.3, 'pcs', 'approved', 'approved',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  )
on conflict (id) do update
set variant_name = excluded.variant_name,
    technical_status = excluded.technical_status,
    status = excluded.status,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

insert into public.unit_definitions (id, code, name, symbol, quantity_kind, is_si)
values
  ('d0000000-0000-4000-8000-000000000060', 'k_factor_metric', 'Metric K-factor', 'L/min/bar^0.5', 'flow_coefficient', true),
  ('d0000000-0000-4000-8000-000000000061', 'millimetre', 'Millimetre', 'mm', 'length', true),
  ('d0000000-0000-4000-8000-000000000062', 'bar', 'Bar', 'bar', 'pressure', false)
on conflict (id) do update
set name = excluded.name, symbol = excluded.symbol, quantity_kind = excluded.quantity_kind,
    is_si = excluded.is_si, updated_at = now();

insert into public.attribute_definitions (
  id, category_id, key, name, description, value_type, default_unit,
  default_unit_id, allowed_units, is_required_for_matching, is_filterable,
  is_comparable, data_set_id, quality_status
) values
  (
    'd0000000-0000-4000-8000-000000000070',
    'd0000000-0000-4000-8000-000000000020',
    'k_factor_metric', 'K-factor', 'Metric sprinkler discharge coefficient.',
    'number', 'L/min/bar^0.5', 'd0000000-0000-4000-8000-000000000060',
    '["L/min/bar^0.5"]'::jsonb, true, true, true,
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000071',
    'd0000000-0000-4000-8000-000000000021',
    'outside_diameter_mm', 'Outside diameter', 'Pipe outside diameter.',
    'number', 'mm', 'd0000000-0000-4000-8000-000000000061',
    '["mm"]'::jsonb, true, true, true,
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000072',
    'd0000000-0000-4000-8000-000000000021',
    'maximum_working_pressure_bar', 'Maximum working pressure', 'Maximum working pressure at 20 °C.',
    'number', 'bar', 'd0000000-0000-4000-8000-000000000062',
    '["bar"]'::jsonb, true, true, true,
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  )
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    default_unit_id = excluded.default_unit_id,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

insert into public.product_attribute_values (
  id, product_variant_id, attribute_definition_id, value_number, unit,
  unit_definition_id, verification_status, data_set_id, quality_status
) values
  (
    'd0000000-0000-4000-8000-000000000080',
    'd0000000-0000-4000-8000-000000000050',
    'd0000000-0000-4000-8000-000000000070', 80, 'L/min/bar^0.5',
    'd0000000-0000-4000-8000-000000000060', 'unverified',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000081',
    'd0000000-0000-4000-8000-000000000051',
    'd0000000-0000-4000-8000-000000000071', 60.3, 'mm',
    'd0000000-0000-4000-8000-000000000061', 'unverified',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000082',
    'd0000000-0000-4000-8000-000000000051',
    'd0000000-0000-4000-8000-000000000072', 34, 'bar',
    'd0000000-0000-4000-8000-000000000062', 'unverified',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  )
on conflict (id) do update
set value_number = excluded.value_number,
    unit = excluded.unit,
    unit_definition_id = excluded.unit_definition_id,
    verification_status = excluded.verification_status,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

insert into public.approvals (
  id, name, code, type, description, issuing_body, region_code,
  data_set_id, quality_status
) values (
  'd0000000-0000-4000-8000-000000000090',
  'Demo Fire Approval', 'DFA-DEMO', 'approval',
  'Fictional approval used only for workflow testing.',
  'Demo Approval Institute', 'EU',
  'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
)
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

insert into public.product_approvals (
  id, product_id, product_variant_id, approval_id, approval_text, status,
  data_set_id, quality_status
) values (
  'd0000000-0000-4000-8000-000000000091',
  'd0000000-0000-4000-8000-000000000040',
  'd0000000-0000-4000-8000-000000000050',
  'd0000000-0000-4000-8000-000000000090',
  'Fictional demo approval; not valid for design or procurement.',
  'approved',
  'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
)
on conflict (id) do update
set approval_text = excluded.approval_text,
    status = excluded.status,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

insert into public.approval_conditions (
  id, product_approval_id, condition_type, attribute_definition_id,
  operator, value_number, unit_definition_id, source_reference
) values (
  'd0000000-0000-4000-8000-000000000092',
  'd0000000-0000-4000-8000-000000000091',
  'temperature', null, 'lte', 68, null,
  'Fictional demo condition.'
)
on conflict (id) do update
set operator = excluded.operator,
    value_number = excluded.value_number,
    source_reference = excluded.source_reference,
    updated_at = now(),
    deleted_at = null;

insert into public.suppliers (
  id, name, normalized_name, supplier_type, country_code, is_active,
  data_source_id, data_set_id, quality_status
) values (
  'd0000000-0000-4000-8000-000000000100',
  'Nordic Demo Distribution', 'nordic demo distribution', 'distributor', 'SE', true,
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
)
on conflict (id) do update
set name = excluded.name,
    supplier_type = excluded.supplier_type,
    is_active = excluded.is_active,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now();

insert into public.supplier_products (
  id, supplier_id, product_variant_id, supplier_sku, supplier_product_name,
  package_quantity, order_unit, is_active, data_set_id, quality_status
) values (
  'd0000000-0000-4000-8000-000000000101',
  'd0000000-0000-4000-8000-000000000100',
  'd0000000-0000-4000-8000-000000000050',
  'NDD-DEMO-K80', 'SDH K80 sprinkler (demo offer)', 1, 'pcs', true,
  'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
)
on conflict (id) do update
set supplier_product_name = excluded.supplier_product_name,
    is_active = excluded.is_active,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now();

insert into public.supplier_offers (
  id, organization_id, supplier_product_id, price, currency_code,
  price_unit, stock_quantity, stock_status, lead_time_days,
  source_type, data_source_id, data_set_id, observed_at, quality_status
) values (
  'd0000000-0000-4000-8000-000000000102',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000101',
  149.50, 'SEK', 'pcs', 420, 'in_stock', 3, 'demo',
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002', now(), 'demo_unverified'
)
on conflict (id) do update
set price = excluded.price,
    stock_quantity = excluded.stock_quantity,
    lead_time_days = excluded.lead_time_days,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    observed_at = now(),
    updated_at = now(),
    deleted_at = null;

-- The demo project has no Auth owner. Disable only the creator-membership hook
-- for this single controlled seed insert; all scope, workflow, and audit
-- triggers remain enabled.
alter table public.projects disable trigger projects_add_creator_membership;

insert into public.projects (
  id, organization_id, name, customer, customer_name, country, standard,
  system_type, supplier, status, access_level, description, demo_data_set_id
) values (
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000003',
  'Demo – logistics building sprinkler system',
  'Fictional Demo Customer', 'Fictional Demo Customer', 'Sweden',
  'Fictional demo standard', 'Wet sprinkler system', 'Nordic Demo Distribution',
  'active', 'organization',
  'Fictional project for exercising FlowX. Not valid engineering data.',
  'd0000000-0000-4000-8000-000000000002'
)
on conflict (id) do update
set name = excluded.name,
    status = excluded.status,
    description = excluded.description,
    demo_data_set_id = excluded.demo_data_set_id,
    updated_at = now(),
    deleted_at = null;

alter table public.projects enable trigger projects_add_creator_membership;

insert into public.project_systems (
  id, organization_id, project_id, code, name, system_type, technical_parameters
) values (
  'd0000000-0000-4000-8000-000000000111',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'SYS-01', 'Demo wet sprinkler system', 'wet_sprinkler',
  '{"demo":true}'::jsonb
)
on conflict (id) do update
set name = excluded.name, technical_parameters = excluded.technical_parameters,
    updated_at = now(), deleted_at = null;

insert into public.project_buildings (
  id, organization_id, project_id, code, name, gross_area_m2
) values (
  'd0000000-0000-4000-8000-000000000112',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'BLD-01', 'Demo logistics building', 2500
)
on conflict (id) do update
set name = excluded.name, gross_area_m2 = excluded.gross_area_m2,
    updated_at = now(), deleted_at = null;

insert into public.project_floors (
  id, organization_id, project_id, building_id, code, name, level_number, gross_area_m2
) values (
  'd0000000-0000-4000-8000-000000000113',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000112',
  'F-00', 'Ground floor', 0, 2500
)
on conflict (id) do update
set name = excluded.name, gross_area_m2 = excluded.gross_area_m2,
    updated_at = now(), deleted_at = null;

insert into public.project_zones (
  id, organization_id, project_id, floor_id, code, name,
  hazard_classification, area_m2
) values (
  'd0000000-0000-4000-8000-000000000114',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000113',
  'Z-01', 'Demo storage zone', 'fictional_demo_hazard', 1000
)
on conflict (id) do update
set name = excluded.name, area_m2 = excluded.area_m2,
    updated_at = now(), deleted_at = null;

insert into public.project_positions (
  id, organization_id, project_id, zone_id, position_code, name,
  position_type, quantity
) values (
  'd0000000-0000-4000-8000-000000000115',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000114',
  'SP-DEMO-001', 'Demo sprinkler position', 'sprinkler_head', 1
)
on conflict (id) do update
set name = excluded.name, quantity = excluded.quantity,
    updated_at = now(), deleted_at = null;

insert into public.project_system_zones (
  project_system_id, project_zone_id, organization_id, project_id
) values (
  'd0000000-0000-4000-8000-000000000111',
  'd0000000-0000-4000-8000-000000000114',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110'
)
on conflict (project_system_id, project_zone_id) do nothing;

insert into public.project_documents (
  id, organization_id, project_id, storage_bucket, storage_path, file_name,
  content_type, size_bytes, status, document_category, extraction_status,
  extraction_method, extraction_result, file_sha256, page_count,
  document_type, original_filename, version, upload_status,
  processing_status, checksum, mime_type, file_size
) values (
  'd0000000-0000-4000-8000-000000000116',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'project-files',
  'd0000000-0000-4000-8000-000000000003/d0000000-0000-4000-8000-000000000110/demo/fictional-technical-description.pdf',
  'fictional-technical-description.pdf',
  'application/pdf', 16384, 'active', 'technical_description', 'completed',
  'manual',
  '{"demo":true,"filePresent":false,"note":"Metadata only; no binary PDF is installed by the seed.","disclaimer":"Demo data – ej verifierad för projektering, installation eller inköp."}'::jsonb,
  repeat('d', 64), 1, 'technical_description',
  'fictional-technical-description.pdf', 1, 'metadata_only', 'completed',
  repeat('d', 64), 'application/pdf', 16384
)
on conflict (id) do update
set storage_path = excluded.storage_path,
    file_name = excluded.file_name,
    status = excluded.status,
    extraction_status = excluded.extraction_status,
    extraction_method = excluded.extraction_method,
    extraction_result = excluded.extraction_result,
    processing_status = excluded.processing_status,
    updated_at = now(),
    deleted_at = null;

insert into public.document_pages (
  id, organization_id, project_id, document_id, page_number,
  extracted_text, extraction_method, metadata, source_coordinates
) values (
  'd0000000-0000-4000-8000-000000000117',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000116',
  1,
  'Fictional requirement: pendent sprinkler, metric K-factor at least 80. Demo text only.',
  'manual',
  '{"demo":true,"disclaimer":"Demo data – ej verifierad för projektering, installation eller inköp."}'::jsonb,
  '[]'::jsonb
)
on conflict (id) do update
set extracted_text = excluded.extracted_text,
    extraction_method = excluded.extraction_method,
    metadata = excluded.metadata,
    updated_at = now();

insert into public.extraction_runs (
  id, organization_id, project_id, document_id, status,
  extraction_provider, model_name, model_version, prompt_version,
  started_at, completed_at, raw_result
) values (
  'd0000000-0000-4000-8000-000000000118',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000116',
  'completed', 'flowx_demo', 'fictional-extractor', '1.0', 'demo-v1',
  now(), now(),
  '{"demo":true,"disclaimer":"Demo data – ej verifierad för projektering, installation eller inköp."}'::jsonb
)
on conflict (id) do update
set status = excluded.status,
    extraction_provider = excluded.extraction_provider,
    model_name = excluded.model_name,
    model_version = excluded.model_version,
    prompt_version = excluded.prompt_version,
    raw_result = excluded.raw_result,
    updated_at = now();

insert into public.requirement_sets (
  id, organization_id, project_id, version, status
) values (
  'd0000000-0000-4000-8000-000000000120',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110', 1, 'confirmed'
)
on conflict (id) do update
set status = excluded.status, updated_at = now();

insert into public.project_requirements (
  id, organization_id, project_id, requirement_set_id, project_system_id,
  project_position_id, category, requirement_key, display_name,
  attribute_key, attribute_definition_id, requirement_type, operator,
  value_type, value_number, unit, unit_definition_id, is_mandatory,
  certainty, status, verification_status
) values (
  'd0000000-0000-4000-8000-000000000121',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000120',
  'd0000000-0000-4000-8000-000000000111',
  'd0000000-0000-4000-8000-000000000115',
  'sprinkler_head', 'k_factor_metric', 'K-factor ≥ 80',
  'k_factor_metric', 'd0000000-0000-4000-8000-000000000070',
  'must', 'gte', 'number', 80, 'L/min/bar^0.5',
  'd0000000-0000-4000-8000-000000000060', true,
  'explicit', 'user_confirmed', 'manual'
)
on conflict (id) do update
set value_number = excluded.value_number,
    requirement_type = excluded.requirement_type,
    status = excluded.status,
    updated_at = now(),
    deleted_at = null;

insert into public.requirement_evidence (
  id, organization_id, project_id, requirement_id, document_id,
  page_number, source_text, source_coordinates
) values (
  'd0000000-0000-4000-8000-000000000122',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000121',
  'd0000000-0000-4000-8000-000000000116',
  1,
  'Fictional requirement: pendent sprinkler, metric K-factor at least 80. Demo text only.',
  '[]'::jsonb
)
on conflict (id) do update
set source_text = excluded.source_text,
    page_number = excluded.page_number,
    source_coordinates = excluded.source_coordinates;

insert into public.match_runs (
  id, organization_id, project_id, requirement_set_id, status,
  technical_gate_status, ranking_version, started_at, completed_at
) values (
  'd0000000-0000-4000-8000-000000000130',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000120',
  'completed', 'pass', 'demo-1', now(), now()
)
on conflict (id) do update
set status = excluded.status,
    technical_gate_status = excluded.technical_gate_status,
    updated_at = now();

insert into public.match_candidates (
  id, organization_id, project_id, match_run_id, product_id,
  product_variant_id, technical_result, review_status, ranking_score,
  ranking_factors, commercial_factors
) values (
  'd0000000-0000-4000-8000-000000000131',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000130',
  'd0000000-0000-4000-8000-000000000040',
  'd0000000-0000-4000-8000-000000000050',
  'pass', 'eligible', 92.0,
  '{"technicalFit":1.0,"demo":true}'::jsonb,
  '{"price":149.50,"currency":"SEK","demo":true}'::jsonb
)
on conflict (id) do update
set technical_result = excluded.technical_result,
    review_status = excluded.review_status,
    ranking_score = excluded.ranking_score,
    ranking_factors = excluded.ranking_factors,
    commercial_factors = excluded.commercial_factors,
    updated_at = now();

insert into public.requirement_evaluations (
  id, organization_id, project_id, match_run_id, match_candidate_id,
  requirement_id, result, is_mandatory, evidence, explanation
) values (
  'd0000000-0000-4000-8000-000000000132',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000130',
  'd0000000-0000-4000-8000-000000000131',
  'd0000000-0000-4000-8000-000000000121',
  'pass', true,
  '[{"attribute":"k_factor_metric","value":80,"demo":true}]'::jsonb,
  'Fictional product equals the fictional minimum K-factor.'
)
on conflict (id) do update
set result = excluded.result,
    evidence = excluded.evidence,
    explanation = excluded.explanation;

insert into public.matching_decisions (
  id, organization_id, project_id, match_run_id, match_candidate_id,
  decision, rationale, decided_by
)
select
  'd0000000-0000-4000-8000-000000000133',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000130',
  'd0000000-0000-4000-8000-000000000131',
  'selected',
  'Fictional demo selection after the technical gate.',
  auth_user.id
from auth.users auth_user
order by auth_user.created_at, auth_user.id
limit 1
on conflict (id) do update
set decision = excluded.decision,
    rationale = excluded.rationale,
    updated_at = now(),
    deleted_at = null;

insert into public.material_lists (
  id, organization_id, project_id, name, status
) values (
  'd0000000-0000-4000-8000-000000000140',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000110',
  'Demo material list', 'approved'
)
on conflict (id) do update
set name = excluded.name, status = excluded.status, updated_at = now(), deleted_at = null;

insert into public.material_list_versions (
  id, organization_id, material_list_id, version, status, source_match_run_id,
  notes
) values (
  'd0000000-0000-4000-8000-000000000141',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000140', 1, 'approved',
  'd0000000-0000-4000-8000-000000000130',
  'Demo data – ej verifierad för projektering, installation eller inköp.'
)
on conflict (id) do update
set status = excluded.status, notes = excluded.notes, updated_at = now();

insert into public.material_list_items (
  id, organization_id, material_list_id, material_list_version_id,
  product_id, line_number, description, quantity, unit, selected,
  unit_price, currency_code, technical_status, compatibility_status,
  source_match_candidate_id, metadata
) values (
  'd0000000-0000-4000-8000-000000000142',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000140',
  'd0000000-0000-4000-8000-000000000141',
  'd0000000-0000-4000-8000-000000000040',
  1, 'SDH K80 pendent sprinkler (demo)', 100, 'pcs', true,
  149.50, 'SEK', 'pass', 'not_applicable',
  'd0000000-0000-4000-8000-000000000131',
  '{"demo":true,"disclaimer":"Demo data – ej verifierad för projektering, installation eller inköp."}'::jsonb
)
on conflict (id) do update
set quantity = excluded.quantity,
    selected = excluded.selected,
    unit_price = excluded.unit_price,
    technical_status = excluded.technical_status,
    compatibility_status = excluded.compatibility_status,
    metadata = excluded.metadata,
    updated_at = now();

commit;
