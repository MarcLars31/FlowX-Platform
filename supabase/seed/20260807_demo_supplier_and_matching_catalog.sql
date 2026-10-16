-- Additional fictional catalog choices and distributor listings used by the
-- project setup and product-matching demo. No price, stock or approval in this
-- fixture is verified for real use.

begin;

insert into public.manufacturers (
  id, name, normalized_name, country, country_code, notes,
  data_source_id, data_set_id, quality_status, is_active
) values
  (
    'd0000000-0000-4000-8000-000000000011',
    'NordicFlow Demo Sprinklers', 'nordicflow demo sprinklers', 'Sweden', 'SE',
    'Fictional manufacturer. Demo data only.',
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified', true
  ),
  (
    'd0000000-0000-4000-8000-000000000012',
    'Boreal Demo Fire Protection', 'boreal demo fire protection', 'Norway', 'NO',
    'Fictional manufacturer. Demo data only.',
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified', true
  ),
  (
    'd0000000-0000-4000-8000-000000000013',
    'FjordGuard Demo Systems', 'fjordguard demo systems', 'Norway', 'NO',
    'Fictional manufacturer. Demo data only.',
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified', true
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

-- Spread the fictional product catalog across fictional manufacturers while
-- keeping the stable product identities and normalized technical attributes.
with manufacturer_assignment as (
  select * from (values
    (0, 'd0000000-0000-4000-8000-000000000010'::uuid, 'Scipx Demo Fire Systems'),
    (1, 'd0000000-0000-4000-8000-000000000011'::uuid, 'NordicFlow Demo Sprinklers'),
    (2, 'd0000000-0000-4000-8000-000000000012'::uuid, 'Boreal Demo Fire Protection'),
    (3, 'd0000000-0000-4000-8000-000000000013'::uuid, 'FjordGuard Demo Systems')
  ) as assignment(bucket, manufacturer_id, manufacturer_name)
)
update public.products product
set manufacturer_id = assignment.manufacturer_id,
    manufacturer = assignment.manufacturer_name,
    updated_at = now()
from manufacturer_assignment assignment
where product.data_set_id = 'd0000000-0000-4000-8000-000000000002'
  and product.product_type = 'sprinkler_head'
  and mod(coalesce((product.technical_data ->> 'catalogIndex')::integer, 0), 4) = assignment.bucket;

-- Ensure the supplied technical description has technically compliant demo
-- alternatives for both pendent and upright K80 / 68 C / DN15 sprinklers.
update public.product_attribute_values value
set value_number = 68,
    normalized_value = jsonb_build_object('value', 68, 'unit', '°C', 'demo', true),
    updated_at = now()
from public.attribute_definitions definition
where value.attribute_definition_id = definition.id
  and definition.key = 'temperature_rating_c'
  and value.product_variant_id in (
    'd0000000-0000-4000-8000-000000000050',
    'd2000000-0000-4000-8000-000000000011'
  );

update public.product_attribute_values value
set value_number = 17.2,
    normalized_value = jsonb_build_object('value', 17.2, 'unit', 'bar', 'demo', true),
    updated_at = now()
from public.attribute_definitions definition
where value.attribute_definition_id = definition.id
  and definition.key = 'maximum_working_pressure_bar'
  and value.product_variant_id = 'd0000000-0000-4000-8000-000000000050';

update public.product_attribute_values value
set value_text = 'upright',
    normalized_value = jsonb_build_object('value', 'upright', 'demo', true),
    updated_at = now()
from public.attribute_definitions definition
where value.attribute_definition_id = definition.id
  and definition.key = 'orientation'
  and value.product_variant_id = 'd2000000-0000-4000-8000-000000000011';

update public.products
set temperature_ratings = '[68]'::jsonb,
    technical_data = jsonb_set(
      jsonb_set(technical_data, '{temperatureRatingC}', '68'::jsonb, true),
      '{maximumWorkingPressureBar}', '17.2'::jsonb, true
    ),
    updated_at = now()
where id = 'd0000000-0000-4000-8000-000000000040';

update public.products
set product_name = 'SDH 011 K80 upright quick-response sprinkler (demo)',
    temperature_ratings = '[68]'::jsonb,
    technical_data = jsonb_set(
      jsonb_set(technical_data, '{temperatureRatingC}', '68'::jsonb, true),
      '{orientation}', to_jsonb('upright'::text), true
    ),
    updated_at = now()
where id = 'd1000000-0000-4000-8000-000000000011';

update public.approval_conditions condition
set value_number = 68,
    updated_at = now()
from public.product_approvals relation
where condition.product_approval_id = relation.id
  and relation.product_variant_id in (
    'd0000000-0000-4000-8000-000000000050',
    'd2000000-0000-4000-8000-000000000011'
  )
  and condition.condition_type = 'temperature';

insert into public.suppliers (
  id, name, normalized_name, supplier_type, country_code, is_active,
  external_identifiers, data_source_id, data_set_id, quality_status
) values
  (
    'e0000000-0000-4000-8000-000000000010',
    'Ahlsell', 'ahlsell', 'distributor', 'SE', true,
    '{"demoListing":true}'::jsonb,
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'e0000000-0000-4000-8000-000000000020',
    'Dahl', 'dahl', 'distributor', 'NO', true,
    '{"demoListing":true}'::jsonb,
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'e0000000-0000-4000-8000-000000000030',
    'Onninen', 'onninen', 'distributor', 'NO', true,
    '{"demoListing":true}'::jsonb,
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  )
on conflict (id) do update
set name = excluded.name,
    normalized_name = excluded.normalized_name,
    supplier_type = excluded.supplier_type,
    country_code = excluded.country_code,
    is_active = excluded.is_active,
    external_identifiers = excluded.external_identifiers,
    data_source_id = excluded.data_source_id,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now();

with distributor as (
  select * from (values
    ('e0000000-0000-4000-8000-000000000010'::uuid, 'AHL'),
    ('e0000000-0000-4000-8000-000000000020'::uuid, 'DAH'),
    ('e0000000-0000-4000-8000-000000000030'::uuid, 'ONN')
  ) as item(id, code)
), demo_variant as (
  select variant.id, variant.sku, product.product_name
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where variant.data_set_id = 'd0000000-0000-4000-8000-000000000002'
    and variant.deleted_at is null
), listing as (
  select distributor.id as supplier_id, distributor.code, variant.*,
    md5(distributor.id::text || ':' || variant.id::text) as identity_hash
  from distributor
  cross join demo_variant variant
)
insert into public.supplier_products (
  id, supplier_id, product_variant_id, supplier_sku, supplier_product_name,
  package_quantity, order_unit, is_active, data_set_id, quality_status
)
select
  (substr(identity_hash, 1, 8) || '-' || substr(identity_hash, 9, 4) || '-4' ||
    substr(identity_hash, 14, 3) || '-8' || substr(identity_hash, 18, 3) || '-' ||
    substr(identity_hash, 21, 12))::uuid,
  supplier_id, id, code || '-DEMO-' || sku,
  product_name || ' – demo listing', 1, 'pcs', true,
  'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
from listing
on conflict (supplier_id, supplier_sku) do update
set supplier_product_name = excluded.supplier_product_name,
    product_variant_id = excluded.product_variant_id,
    is_active = excluded.is_active,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now();

commit;
