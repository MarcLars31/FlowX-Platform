begin;

-- A single read model for external Sprsok records and FlowX's canonical
-- product catalog. Source-prefixed text IDs prevent collisions between bigint
-- source IDs and UUID canonical IDs.
create or replace view public.flowx_product_search
with (security_invoker = true)
as
select
  'sprsok:' || product.id::text as id,
  'sprsok'::text as source,
  product.id::text as source_id,
  product.sin,
  product.leverandor,
  product.type,
  product.utforelse,
  product.k_verdi,
  product.rti,
  product.datablad,
  false as is_demo,
  null::text as demo_disclaimer,
  search_index.normalized_article_number,
  search_index.search_document
from public.sprsok_products product
join public.sprsok_product_search_index search_index
  on search_index.product_id = product.id
where search_index.is_visible

union all

select
  'flowx:' || product.id::text as id,
  'flowx'::text as source,
  product.id::text as source_id,
  coalesce(product.manufacturer_product_number, product.product_no) as sin,
  product.manufacturer as leverandor,
  coalesce(product.product_type, product.category) as type,
  coalesce(
    nullif(replace(product.technical_data ->> 'orientation', '_', ' '), ''),
    product.connection_type
  ) as utforelse,
  product.technical_data ->> 'kFactorMetric' as k_verdi,
  case product.technical_data ->> 'responseType'
    when 'quick' then 'QR'
    when 'standard' then 'SR'
    else product.technical_data ->> 'responseType'
  end as rti,
  null::text as datablad,
  data_set.data_mode = 'demo' as is_demo,
  case when data_set.data_mode = 'demo' then data_set.disclaimer end as demo_disclaimer,
  public.normalize_sprsok_article(
    coalesce(product.manufacturer_product_number, product.product_no)
  ) as normalized_article_number,
  lower(concat_ws(
    ' ',
    product.manufacturer_product_number,
    product.product_no,
    product.product_name,
    product.manufacturer,
    product.product_type,
    product.category,
    replace(product.technical_data ->> 'orientation', '_', ' '),
    product.technical_data ->> 'kFactorMetric',
    product.technical_data ->> 'responseType',
    product.technical_data ->> 'connectionSize',
    product.technical_data ->> 'finish'
  )) as search_document
from public.products product
left join public.data_sets data_set on data_set.id = product.data_set_id
where product.deleted_at is null
  and product.status = 'approved'
  and nullif(btrim(coalesce(
    product.manufacturer_product_number,
    product.product_no
  )), '') is not null;

comment on view public.flowx_product_search is
  'Unified product search projection for Sprsok source records and canonical FlowX products.';

grant select on public.flowx_product_search to authenticated, service_role;
revoke all on public.flowx_product_search from anon;

commit;
