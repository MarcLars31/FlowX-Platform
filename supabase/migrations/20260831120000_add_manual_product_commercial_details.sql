-- Store manually entered commercial product details in the same transaction as
-- the explicit product approval. Price and lead time belong to the project
-- snapshot and are deliberately not copied into reusable product memory.

create or replace function public.approve_distributor_product_mapping_v2(
  requested_project_id uuid,
  requested_requirement_id uuid,
  requested_user_approved boolean,
  requested_product_name text,
  requested_product_number text,
  requested_manufacturer_name text default null,
  requested_notes text default null,
  requested_accessories jsonb default '[]'::jsonb,
  requested_entry_method text default 'catalog',
  requested_product_subtitle text default null,
  requested_manufacturer_article_number text default null,
  requested_delivery_time_days integer default null,
  requested_unit_price numeric default null,
  requested_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  mapping_result jsonb;
  assignment_id uuid;
  saved_snapshot jsonb;
  captured_at timestamptz := now();
  clean_entry_method text := lower(nullif(btrim(requested_entry_method), ''));
  clean_subtitle text := left(nullif(btrim(requested_product_subtitle), ''), 500);
  clean_article_number text := left(nullif(btrim(requested_manufacturer_article_number), ''), 120);
  clean_manufacturer text := left(nullif(btrim(requested_manufacturer_name), ''), 200);
  clean_currency text := upper(left(nullif(btrim(requested_currency), ''), 3));
  detail_snapshot jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if clean_entry_method is null or clean_entry_method not in ('catalog', 'manual') then
    raise exception 'Unknown product entry method.' using errcode = '22023';
  end if;
  if requested_delivery_time_days is not null
    and (requested_delivery_time_days < 0 or requested_delivery_time_days > 3650) then
    raise exception 'Delivery time must be between 0 and 3650 days.' using errcode = '22023';
  end if;
  if requested_unit_price is not null
    and (
      requested_unit_price::text in ('NaN', 'Infinity', '-Infinity')
      or requested_unit_price < 0
      or requested_unit_price > 1000000000000
    ) then
    raise exception 'Unit price is outside the allowed range.' using errcode = '22023';
  end if;
  if clean_currency is not null and clean_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter code.' using errcode = '22023';
  end if;
  if requested_unit_price is not null and clean_currency is null then
    raise exception 'Currency is required when a unit price is supplied.' using errcode = '22023';
  end if;
  if clean_entry_method = 'manual' and (
    clean_article_number is null
    or clean_manufacturer is null
    or requested_delivery_time_days is null
    or requested_unit_price is null
    or requested_unit_price <= 0
    or clean_currency is null
  ) then
    raise exception 'Manual products require article number, manufacturer, delivery time, price and currency.' using errcode = '22023';
  end if;

  perform public.prepare_requirement_for_direct_product_mapping(
    requested_project_id,
    requested_requirement_id
  );

  mapping_result := public.approve_distributor_product_mapping(
    requested_project_id,
    requested_requirement_id,
    requested_user_approved,
    requested_product_name,
    requested_product_number,
    requested_manufacturer_name,
    requested_notes,
    requested_accessories
  );
  assignment_id := nullif(mapping_result ->> 'assignmentId', '')::uuid;
  if assignment_id is null then
    raise exception 'Approved product assignment was not returned.';
  end if;

  detail_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'entryMethod', clean_entry_method,
    'subtitle', clean_subtitle,
    'manufacturerArticleNumber', clean_article_number,
    'deliveryTimeDays', requested_delivery_time_days,
    'unitPrice', requested_unit_price,
    'currency', clean_currency,
    'commercialCapturedAt', case
      when clean_entry_method = 'manual' then captured_at
      else null
    end
  ));

  update public.project_product_suggestions
  set product_snapshot = coalesce(product_snapshot, '{}'::jsonb) || detail_snapshot,
      updated_at = captured_at
  where id = assignment_id
    and project_id = requested_project_id
    and requirement_id = requested_requirement_id
    and status = 'selected'
    and selected_by = actor_id
  returning product_snapshot into saved_snapshot;

  if saved_snapshot is null then
    raise exception 'Manual product details were not saved.';
  end if;

  perform public.write_audit_log(
    (select organization_id from public.projects where id = requested_project_id),
    'distributor_product_mapping.details_saved',
    'project_product_suggestion',
    assignment_id,
    null,
    detail_snapshot,
    jsonb_build_object(
      'project_id', requested_project_id,
      'requirement_id', requested_requirement_id,
      'entry_method', clean_entry_method,
      'captured_at', captured_at
    )
  );

  return mapping_result || detail_snapshot;
end;
$$;

revoke all on function public.approve_distributor_product_mapping_v2(
  uuid, uuid, boolean, text, text, text, text, jsonb, text, text, text, integer, numeric, text
) from public;
grant execute on function public.approve_distributor_product_mapping_v2(
  uuid, uuid, boolean, text, text, text, text, jsonb, text, text, text, integer, numeric, text
) to authenticated;

comment on function public.approve_distributor_product_mapping_v2(
  uuid, uuid, boolean, text, text, text, text, jsonb, text, text, text, integer, numeric, text
) is
  'Atomically approves a product and stores project-specific manual article, lead-time and price details.';
