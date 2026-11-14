begin;

-- Keep the existing projection available to older clients during deployment.
-- This view retains its approval/visibility filters and caller permissions.
create or replace view public.flowx_product_search_v2
with (security_invoker = true)
as
select search.*,
  product.product_name,
  product.category as product_category,
  product.material,
  product.connection_type,
  product.available_sizes,
  jsonb_strip_nulls(jsonb_build_object(
    'connectionSize', product.technical_data -> 'connectionSize',
    'dn', product.technical_data -> 'dn',
    'material', product.technical_data -> 'material',
    'connectionType', product.technical_data -> 'connectionType',
    'temperatureC', coalesce(product.technical_data -> 'temperatureC', product.technical_data -> 'temperatureRatingC'),
    'workingPressureBar', coalesce(product.technical_data -> 'workingPressureBar', product.technical_data -> 'maximumWorkingPressureBar'),
    'pressureClass', product.technical_data -> 'pressureClass',
    'finish', product.technical_data -> 'finish'
  )) as technical_data
from public.flowx_product_search search
left join public.products product on product.id = case when search.source = 'flowx' then search.source_id::uuid end;

grant select on public.flowx_product_search_v2 to authenticated, service_role;
revoke all on public.flowx_product_search_v2 from anon;

commit;
