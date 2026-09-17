-- Fifty fictional sprinkler heads for the Scipx demonstration catalog.
-- Every row remains demo_unverified and carries the mandatory disclaimer.
-- The values are plausible workflow fixtures, not design or procurement data.

begin;

do $$
declare
  demo_dataset public.data_sets;
begin
  select data_set.*
  into demo_dataset
  from public.data_sets data_set
  where data_set.id = 'd0000000-0000-4000-8000-000000000002';

  if demo_dataset.id is null
    or demo_dataset.code <> 'flowx_demo_catalog'
    or demo_dataset.data_mode <> 'demo'
    or demo_dataset.quality_status <> 'demo_unverified'
    or demo_dataset.disclaimer is distinct from
      'Demo data – ej verifierad för projektering, installation eller inköp.' then
    raise exception 'The required Scipx demo dataset is missing or has an invalid identity.';
  end if;
end
$$;

update public.product_families
set description = 'Fictional sprinkler family with multiple K-factors, response types and orientations.',
    updated_at = now()
where id = 'd0000000-0000-4000-8000-000000000030';

insert into public.unit_definitions (id, code, name, symbol, quantity_kind, is_si)
values (
  'd0000000-0000-4000-8000-000000000063',
  'degree_celsius', 'Degree Celsius', '°C', 'temperature', true
)
on conflict (id) do update
set name = excluded.name,
    symbol = excluded.symbol,
    quantity_kind = excluded.quantity_kind,
    is_si = excluded.is_si,
    updated_at = now();

insert into public.attribute_definitions (
  id, category_id, key, name, description, value_type, default_unit,
  default_unit_id, allowed_units, allowed_values, is_required_for_matching,
  is_filterable, is_comparable, data_set_id, quality_status
) values
  (
    'd0000000-0000-4000-8000-000000000073',
    'd0000000-0000-4000-8000-000000000020',
    'maximum_working_pressure_bar', 'Maximum working pressure',
    'Fictional maximum working pressure for demo matching.',
    'number', 'bar', 'd0000000-0000-4000-8000-000000000062',
    '["bar"]'::jsonb, '[]'::jsonb, true, true, true,
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000074',
    'd0000000-0000-4000-8000-000000000020',
    'temperature_rating_c', 'Temperature rating',
    'Fictional sprinkler temperature classification.',
    'number', '°C', 'd0000000-0000-4000-8000-000000000063',
    '["°C"]'::jsonb, '[]'::jsonb, true, true, true,
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000075',
    'd0000000-0000-4000-8000-000000000020',
    'response_type', 'Response type', 'Fictional thermal response classification.',
    'enum', null, null, '[]'::jsonb,
    '["quick","standard"]'::jsonb, true, true, true,
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000076',
    'd0000000-0000-4000-8000-000000000020',
    'orientation', 'Orientation', 'Fictional sprinkler installation orientation.',
    'enum', null, null, '[]'::jsonb,
    '["pendent","upright","horizontal_sidewall","recessed_pendent","concealed_pendent"]'::jsonb,
    true, true, true,
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000077',
    'd0000000-0000-4000-8000-000000000020',
    'connection_size_dn', 'Connection size', 'Normalized fictional connection dimension.',
    'enum', null, null, '[]'::jsonb,
    '["DN15","DN20","DN25"]'::jsonb, true, true, true,
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000078',
    'd0000000-0000-4000-8000-000000000020',
    'finish_color', 'Finish / colour', 'Fictional finish used for filtering.',
    'enum', null, null, '[]'::jsonb,
    '["chrome","brass","white","black","custom_ral"]'::jsonb,
    false, true, false,
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000079',
    'd0000000-0000-4000-8000-000000000020',
    'thermal_element', 'Thermal element', 'Fictional heat-sensitive operating element.',
    'enum', null, null, '[]'::jsonb,
    '["glass_bulb","fusible_link"]'::jsonb, false, true, false,
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  )
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    default_unit = excluded.default_unit,
    default_unit_id = excluded.default_unit_id,
    allowed_units = excluded.allowed_units,
    allowed_values = excluded.allowed_values,
    is_required_for_matching = excluded.is_required_for_matching,
    is_filterable = excluded.is_filterable,
    is_comparable = excluded.is_comparable,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

-- Product number 1 is the K80 sprinkler created by the base demo seed. Products
-- 2–50 use their own stable UUIDs so the catalog remains idempotent.
with sprinkler_fixture as (
  select
    item_number,
    (array[80,28,36,40,57,115,160,202,242,363])[(item_number - 1) % 10 + 1]::numeric as k_factor,
    (array[57,68,79,93,141,182,260])[(item_number - 1) % 7 + 1]::integer as temperature_c,
    (array['quick','standard'])[(item_number - 1) % 2 + 1] as response_type,
    (array['pendent','upright','horizontal_sidewall','recessed_pendent','concealed_pendent'])[(item_number - 1) % 5 + 1] as orientation,
    (array['chrome','brass','white','black','custom_ral'])[(item_number - 1) % 5 + 1] as finish_color,
    (array['glass_bulb','fusible_link'])[(item_number - 1) % 2 + 1] as thermal_element,
    (array[12.1,17.2,20.7,25.0])[(item_number - 1) % 4 + 1]::numeric as pressure_bar
  from generate_series(1, 50) item_number
), normalized_fixture as (
  select *,
    case when k_factor <= 80 then 'DN15' when k_factor <= 202 then 'DN20' else 'DN25' end as dn_size,
    case when k_factor <= 80 then '1/2 in' when k_factor <= 202 then '3/4 in' else '1 in' end as nominal_size,
    case when k_factor <= 80 then 21.3 when k_factor <= 202 then 26.9 else 33.7 end::numeric as outside_diameter_mm
  from sprinkler_fixture
)
update public.products product
set product_name = 'SDH 001 K80 pendent quick-response sprinkler (demo)',
    connection_type = 'Threaded DN15',
    material = 'Demo brass alloy',
    available_sizes = 'DN15',
    temperature_ratings = jsonb_build_array(57),
    color = 'chrome',
    technical_data = jsonb_build_object(
      'demo', true,
      'catalogIndex', 1,
      'kFactorMetric', fixture.k_factor,
      'maximumWorkingPressureBar', fixture.pressure_bar,
      'temperatureRatingC', fixture.temperature_c,
      'responseType', fixture.response_type,
      'orientation', fixture.orientation,
      'connectionSize', fixture.dn_size,
      'finish', fixture.finish_color,
      'thermalElement', fixture.thermal_element,
      'disclaimer', 'Demo data – ej verifierad för projektering, installation eller inköp.'
    ),
    updated_at = now(),
    deleted_at = null
from normalized_fixture fixture
where fixture.item_number = 1
  and product.id = 'd0000000-0000-4000-8000-000000000040';

with sprinkler_fixture as (
  select
    item_number,
    (array[80,28,36,40,57,115,160,202,242,363])[(item_number - 1) % 10 + 1]::numeric as k_factor,
    (array[57,68,79,93,141,182,260])[(item_number - 1) % 7 + 1]::integer as temperature_c,
    (array['quick','standard'])[(item_number - 1) % 2 + 1] as response_type,
    (array['pendent','upright','horizontal_sidewall','recessed_pendent','concealed_pendent'])[(item_number - 1) % 5 + 1] as orientation,
    (array['chrome','brass','white','black','custom_ral'])[(item_number - 1) % 5 + 1] as finish_color,
    (array['glass_bulb','fusible_link'])[(item_number - 1) % 2 + 1] as thermal_element,
    (array[12.1,17.2,20.7,25.0])[(item_number - 1) % 4 + 1]::numeric as pressure_bar
  from generate_series(2, 50) item_number
), normalized_fixture as (
  select *,
    case when k_factor <= 80 then 'DN15' when k_factor <= 202 then 'DN20' else 'DN25' end as dn_size
  from sprinkler_fixture
)
insert into public.products (
  id, manufacturer, manufacturer_id, product_no, manufacturer_product_number,
  product_name, category, category_id, product_family_id, product_type,
  connection_type, material, available_sizes, temperature_ratings, color,
  status, source_type, technical_data, data_source_id, data_set_id, quality_status
)
select
  ('d1000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid,
  'Scipx Demo Fire Systems', 'd0000000-0000-4000-8000-000000000010',
  'DEMO-SDH-' || lpad(item_number::text, 3, '0') || '-K' || k_factor::text,
  'DEMO-SDH-' || lpad(item_number::text, 3, '0') || '-K' || k_factor::text,
  'SDH ' || lpad(item_number::text, 3, '0') || ' K' || k_factor::text || ' '
    || replace(orientation, '_', ' ') || ' ' || replace(response_type, '_', ' ')
    || '-response sprinkler (demo)',
  'Demo sprinkler heads', 'd0000000-0000-4000-8000-000000000020',
  'd0000000-0000-4000-8000-000000000030', 'sprinkler_head',
  'Threaded ' || dn_size,
  case when item_number % 7 = 0 then 'Demo stainless alloy' else 'Demo brass alloy' end,
  dn_size, jsonb_build_array(temperature_c), finish_color,
  'approved', 'demo',
  jsonb_build_object(
    'demo', true,
    'catalogIndex', item_number,
    'kFactorMetric', k_factor,
    'maximumWorkingPressureBar', pressure_bar,
    'temperatureRatingC', temperature_c,
    'responseType', response_type,
    'orientation', orientation,
    'connectionSize', dn_size,
    'finish', finish_color,
    'thermalElement', thermal_element,
    'disclaimer', 'Demo data – ej verifierad för projektering, installation eller inköp.'
  ),
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
from normalized_fixture
on conflict (id) do update
set product_name = excluded.product_name,
    connection_type = excluded.connection_type,
    material = excluded.material,
    available_sizes = excluded.available_sizes,
    temperature_ratings = excluded.temperature_ratings,
    color = excluded.color,
    status = excluded.status,
    technical_data = excluded.technical_data,
    data_source_id = excluded.data_source_id,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

with sprinkler_fixture as (
  select
    item_number,
    (array[80,28,36,40,57,115,160,202,242,363])[(item_number - 1) % 10 + 1]::numeric as k_factor
  from generate_series(2, 50) item_number
)
insert into public.product_variants (
  id, product_id, sku, manufacturer_sku, variant_name, nominal_size, dn_size,
  outside_diameter_mm, unit_of_measure, technical_status, status,
  data_set_id, quality_status
)
select
  ('d2000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid,
  ('d1000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid,
  'DEMO-SDH-' || lpad(item_number::text, 3, '0') || '-K' || k_factor::text,
  'DEMO-SDH-' || lpad(item_number::text, 3, '0') || '-K' || k_factor::text,
  'K' || k_factor::text || ' / '
    || case when k_factor <= 80 then 'DN15' when k_factor <= 202 then 'DN20' else 'DN25' end,
  case when k_factor <= 80 then '1/2 in' when k_factor <= 202 then '3/4 in' else '1 in' end,
  case when k_factor <= 80 then 'DN15' when k_factor <= 202 then 'DN20' else 'DN25' end,
  case when k_factor <= 80 then 21.3 when k_factor <= 202 then 26.9 else 33.7 end,
  'pcs', 'approved', 'approved',
  'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
from sprinkler_fixture
on conflict (id) do update
set variant_name = excluded.variant_name,
    nominal_size = excluded.nominal_size,
    dn_size = excluded.dn_size,
    outside_diameter_mm = excluded.outside_diameter_mm,
    technical_status = excluded.technical_status,
    status = excluded.status,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

-- Three numeric attributes per sprinkler variant.
with sprinkler_fixture as (
  select
    item_number,
    (array[80,28,36,40,57,115,160,202,242,363])[(item_number - 1) % 10 + 1]::numeric as k_factor,
    (array[57,68,79,93,141,182,260])[(item_number - 1) % 7 + 1]::numeric as temperature_c,
    (array[12.1,17.2,20.7,25.0])[(item_number - 1) % 4 + 1]::numeric as pressure_bar,
    case
      when item_number = 1 then 'd0000000-0000-4000-8000-000000000050'::uuid
      else ('d2000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid
    end as variant_id
  from generate_series(1, 50) item_number
), numeric_values as (
  select item_number, variant_id, 1 as attribute_ordinal,
    'd0000000-0000-4000-8000-000000000070'::uuid as attribute_id,
    k_factor as value_number, 'L/min/bar^0.5' as unit,
    'd0000000-0000-4000-8000-000000000060'::uuid as unit_id
  from sprinkler_fixture where item_number > 1
  union all
  select item_number, variant_id, 2,
    'd0000000-0000-4000-8000-000000000073'::uuid,
    pressure_bar, 'bar', 'd0000000-0000-4000-8000-000000000062'::uuid
  from sprinkler_fixture
  union all
  select item_number, variant_id, 3,
    'd0000000-0000-4000-8000-000000000074'::uuid,
    temperature_c, '°C', 'd0000000-0000-4000-8000-000000000063'::uuid
  from sprinkler_fixture
)
insert into public.product_attribute_values (
  id, product_variant_id, attribute_definition_id, value_number, unit,
  unit_definition_id, verification_status, normalized_value,
  data_set_id, quality_status
)
select
  ('d3000000-0000-4000-8000-' || lpad((item_number * 10 + attribute_ordinal)::text, 12, '0'))::uuid,
  variant_id, attribute_id, value_number, unit, unit_id, 'unverified',
  jsonb_build_object('value', value_number, 'unit', unit, 'demo', true),
  'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
from numeric_values
on conflict (id) do update
set value_number = excluded.value_number,
    unit = excluded.unit,
    unit_definition_id = excluded.unit_definition_id,
    normalized_value = excluded.normalized_value,
    verification_status = excluded.verification_status,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

-- Four normalized text attributes per sprinkler variant.
with sprinkler_fixture as (
  select
    item_number,
    (array[80,28,36,40,57,115,160,202,242,363])[(item_number - 1) % 10 + 1]::numeric as k_factor,
    (array['quick','standard'])[(item_number - 1) % 2 + 1] as response_type,
    (array['pendent','upright','horizontal_sidewall','recessed_pendent','concealed_pendent'])[(item_number - 1) % 5 + 1] as orientation,
    (array['chrome','brass','white','black','custom_ral'])[(item_number - 1) % 5 + 1] as finish_color,
    (array['glass_bulb','fusible_link'])[(item_number - 1) % 2 + 1] as thermal_element,
    case
      when item_number = 1 then 'd0000000-0000-4000-8000-000000000050'::uuid
      else ('d2000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid
    end as variant_id
  from generate_series(1, 50) item_number
), text_values as (
  select item_number, variant_id, 4 as attribute_ordinal,
    'd0000000-0000-4000-8000-000000000075'::uuid as attribute_id,
    response_type as value_text from sprinkler_fixture
  union all
  select item_number, variant_id, 5,
    'd0000000-0000-4000-8000-000000000076'::uuid,
    orientation from sprinkler_fixture
  union all
  select item_number, variant_id, 6,
    'd0000000-0000-4000-8000-000000000077'::uuid,
    case when k_factor <= 80 then 'DN15' when k_factor <= 202 then 'DN20' else 'DN25' end
  from sprinkler_fixture
  union all
  select item_number, variant_id, 7,
    'd0000000-0000-4000-8000-000000000078'::uuid,
    finish_color from sprinkler_fixture
  union all
  select item_number, variant_id, 8,
    'd0000000-0000-4000-8000-000000000079'::uuid,
    thermal_element from sprinkler_fixture
)
insert into public.product_attribute_values (
  id, product_variant_id, attribute_definition_id, value_text,
  verification_status, normalized_value, data_set_id, quality_status
)
select
  ('d3100000-0000-4000-8000-' || lpad((item_number * 10 + attribute_ordinal)::text, 12, '0'))::uuid,
  variant_id, attribute_id, value_text, 'unverified',
  jsonb_build_object('value', value_text, 'demo', true),
  'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
from text_values
on conflict (id) do update
set value_text = excluded.value_text,
    normalized_value = excluded.normalized_value,
    verification_status = excluded.verification_status,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

insert into public.approvals (
  id, name, code, type, description, issuing_body, region_code,
  data_set_id, quality_status
) values
  (
    'd0000000-0000-4000-8000-000000000090',
    'Demo European Fire Approval', 'DFA-EU-DEMO', 'approval',
    'Fictional European workflow approval; not a real certificate.',
    'Demo Fire Assessment Institute', 'EU',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000093',
    'Demo North American Listing', 'DNL-NA-DEMO', 'listing',
    'Fictional North American workflow listing; not a real listing.',
    'Demo Listing Laboratory', 'NA',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000094',
    'Demo Marine Approval', 'DMA-GLOBAL-DEMO', 'approval',
    'Fictional marine workflow approval; not valid for marine use.',
    'Demo Marine Assurance', 'GLOBAL',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000095',
    'Demo Storage Application Approval', 'DSA-EU-DEMO', 'approval',
    'Fictional storage application approval; not valid for design.',
    'Demo Storage Safety Board', 'EU',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  ),
  (
    'd0000000-0000-4000-8000-000000000096',
    'Demo Residential Application Approval', 'DRA-EU-DEMO', 'approval',
    'Fictional residential application approval; not valid for design.',
    'Demo Residential Safety Council', 'EU',
    'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
  )
on conflict (id) do update
set name = excluded.name,
    code = excluded.code,
    type = excluded.type,
    description = excluded.description,
    issuing_body = excluded.issuing_body,
    region_code = excluded.region_code,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

with sprinkler_fixture as (
  select
    item_number,
    (array[80,28,36,40,57,115,160,202,242,363])[(item_number - 1) % 10 + 1]::numeric as k_factor,
    (array[57,68,79,93,141,182,260])[(item_number - 1) % 7 + 1]::numeric as temperature_c,
    (array['pendent','upright','horizontal_sidewall','recessed_pendent','concealed_pendent'])[(item_number - 1) % 5 + 1] as orientation,
    ('d1000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid as product_id,
    ('d2000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid as variant_id
  from generate_series(2, 50) item_number
), approval_fixture as (
  select * from (values
    (1, 'd0000000-0000-4000-8000-000000000090'::uuid, 'DFA-EU-DEMO'),
    (2, 'd0000000-0000-4000-8000-000000000093'::uuid, 'DNL-NA-DEMO'),
    (3, 'd0000000-0000-4000-8000-000000000094'::uuid, 'DMA-GLOBAL-DEMO'),
    (4, 'd0000000-0000-4000-8000-000000000095'::uuid, 'DSA-EU-DEMO'),
    (5, 'd0000000-0000-4000-8000-000000000096'::uuid, 'DRA-EU-DEMO')
  ) as approval(approval_number, approval_id, approval_code)
), selected_approvals as (
  select fixture.*, approval.*
  from sprinkler_fixture fixture
  cross join approval_fixture approval
  where
    (approval_number = 1 and fixture.item_number % 3 <> 0)
    or (approval_number = 2 and fixture.item_number % 2 = 0)
    or (approval_number = 3 and fixture.item_number % 3 = 0)
    or (approval_number = 4 and fixture.k_factor >= 160)
    or (
      approval_number = 5
      and fixture.k_factor <= 80
      and fixture.orientation in ('recessed_pendent', 'concealed_pendent')
    )
)
insert into public.product_approvals (
  id, product_id, product_variant_id, approval_id, approval_text, status,
  data_set_id, quality_status
)
select
  ('d4000000-0000-4000-8000-' || lpad((item_number * 10 + approval_number)::text, 12, '0'))::uuid,
  product_id, variant_id, approval_id,
  approval_code || ': fictional demo relation; not valid for design, installation or procurement.',
  'approved', 'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
from selected_approvals
on conflict (id) do update
set approval_text = excluded.approval_text,
    status = excluded.status,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now(),
    deleted_at = null;

with sprinkler_fixture as (
  select
    item_number,
    (array[80,28,36,40,57,115,160,202,242,363])[(item_number - 1) % 10 + 1]::numeric as k_factor,
    (array[57,68,79,93,141,182,260])[(item_number - 1) % 7 + 1]::numeric as temperature_c,
    (array['pendent','upright','horizontal_sidewall','recessed_pendent','concealed_pendent'])[(item_number - 1) % 5 + 1] as orientation
  from generate_series(2, 50) item_number
), selected_approvals as (
  select fixture.*, approval_number
  from sprinkler_fixture fixture
  cross join generate_series(1, 5) approval_number
  where
    (approval_number = 1 and fixture.item_number % 3 <> 0)
    or (approval_number = 2 and fixture.item_number % 2 = 0)
    or (approval_number = 3 and fixture.item_number % 3 = 0)
    or (approval_number = 4 and fixture.k_factor >= 160)
    or (
      approval_number = 5
      and fixture.k_factor <= 80
      and fixture.orientation in ('recessed_pendent', 'concealed_pendent')
    )
)
insert into public.approval_conditions (
  id, product_approval_id, condition_type, attribute_definition_id,
  operator, value_number, unit_definition_id, source_reference
)
select
  ('d5000000-0000-4000-8000-' || lpad((item_number * 10 + approval_number)::text, 12, '0'))::uuid,
  ('d4000000-0000-4000-8000-' || lpad((item_number * 10 + approval_number)::text, 12, '0'))::uuid,
  'temperature', 'd0000000-0000-4000-8000-000000000074',
  'lte', temperature_c, 'd0000000-0000-4000-8000-000000000063',
  'Fictional demo temperature condition; no certificate exists.'
from selected_approvals
on conflict (id) do update
set operator = excluded.operator,
    value_number = excluded.value_number,
    unit_definition_id = excluded.unit_definition_id,
    source_reference = excluded.source_reference,
    updated_at = now(),
    deleted_at = null;

-- Add fictional offers for the additional sprinkler heads so technical
-- matching and commercial ranking can be demonstrated as separate stages.
with sprinkler_fixture as (
  select
    item_number,
    (array[80,28,36,40,57,115,160,202,242,363])[(item_number - 1) % 10 + 1]::numeric as k_factor
  from generate_series(2, 50) item_number
)
insert into public.supplier_products (
  id, supplier_id, product_variant_id, supplier_sku, supplier_product_name,
  package_quantity, order_unit, is_active, data_set_id, quality_status
)
select
  ('d6000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid,
  'd0000000-0000-4000-8000-000000000100',
  ('d2000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid,
  'NDD-DEMO-' || lpad(item_number::text, 3, '0'),
  'SDH ' || lpad(item_number::text, 3, '0') || ' K' || k_factor::text || ' sprinkler (demo offer)',
  case when item_number % 4 = 0 then 10 else 1 end,
  'pcs', true,
  'd0000000-0000-4000-8000-000000000002', 'demo_unverified'
from sprinkler_fixture
on conflict (id) do update
set supplier_product_name = excluded.supplier_product_name,
    package_quantity = excluded.package_quantity,
    is_active = excluded.is_active,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    updated_at = now();

with sprinkler_fixture as (
  select
    item_number,
    (array[80,28,36,40,57,115,160,202,242,363])[(item_number - 1) % 10 + 1]::numeric as k_factor,
    ((item_number * 37) % 601)::numeric as stock_quantity
  from generate_series(2, 50) item_number
)
insert into public.supplier_offers (
  id, organization_id, supplier_product_id, price, currency_code,
  price_unit, stock_quantity, stock_status, lead_time_days,
  source_type, data_source_id, data_set_id, observed_at, quality_status
)
select
  ('d7000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid,
  'd0000000-0000-4000-8000-000000000003',
  ('d6000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid,
  round((89 + k_factor * 0.72 + item_number * 1.35)::numeric, 2),
  'SEK', 'pcs', stock_quantity,
  case when stock_quantity = 0 then 'out_of_stock' when stock_quantity < 50 then 'low_stock' else 'in_stock' end,
  (item_number % 12) + 1,
  'demo', 'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002', now(), 'demo_unverified'
from sprinkler_fixture
on conflict (id) do update
set price = excluded.price,
    stock_quantity = excluded.stock_quantity,
    stock_status = excluded.stock_status,
    lead_time_days = excluded.lead_time_days,
    data_set_id = excluded.data_set_id,
    quality_status = excluded.quality_status,
    observed_at = now(),
    updated_at = now(),
    deleted_at = null;

commit;
