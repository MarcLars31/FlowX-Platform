-- Project totals are separate from PDF quantities and reusable per-unit ratios.
-- Existing snapshots without quantityBasis retain their original calculation.
create or replace function public.approve_distributor_product_mapping_v4(
  requested_project_id uuid,
  requested_requirement_id uuid,
  requested_user_approved boolean,
  requested_product_name text,
  requested_product_number text,
  requested_manufacturer_name text,
  requested_notes text,
  requested_accessories jsonb,
  requested_entry_method text,
  requested_product_subtitle text,
  requested_manufacturer_article_number text,
  requested_delivery_time_days integer,
  requested_unit_price numeric,
  requested_currency text,
  requested_requirement_review jsonb,
  requested_requirement_updated_at timestamptz,
  requested_order_quantity jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  item jsonb;
  clean_item jsonb;
  clean_accessories jsonb := '[]'::jsonb;
  reusable_accessories jsonb := '[]'::jsonb;
  clean_order_quantity jsonb;
  amount numeric;
  unit_label text;
  basis text;
  identity_key text;
  seen_identities text[] := array[]::text[];
  mapping_result jsonb;
  assignment_id uuid;
  saved_snapshot jsonb;
  detail_snapshot jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if requested_order_quantity is not null then
    if jsonb_typeof(requested_order_quantity) is distinct from 'object'
      or jsonb_typeof(requested_order_quantity -> 'quantity') is distinct from 'number'
      or jsonb_typeof(requested_order_quantity -> 'unit') is distinct from 'string' then
      raise exception 'Invalid total product quantity.' using errcode = '22023';
    end if;
    amount := (requested_order_quantity ->> 'quantity')::numeric;
    unit_label := btrim(requested_order_quantity ->> 'unit');
    if amount < 0.001 or amount > 100000 or amount::text in ('NaN', 'Infinity', '-Infinity')
      or length(unit_label) not between 1 and 30 then
      raise exception 'Invalid total product quantity or unit.' using errcode = '22023';
    end if;
    clean_order_quantity := jsonb_build_object('quantity', amount, 'unit', unit_label);
  end if;
  if jsonb_typeof(requested_accessories) is distinct from 'array' then
    raise exception 'Accessories must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(requested_accessories) > 20 then
    raise exception 'A maximum of 20 accessories is allowed.' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(requested_accessories) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item -> 'name') is distinct from 'string'
      or nullif(btrim(item ->> 'name'), '') is null
      or jsonb_typeof(item -> 'quantity') is distinct from 'number' then
      raise exception 'Invalid accessory name or quantity.' using errcode = '22023';
    end if;
    amount := (item ->> 'quantity')::numeric;
    basis := coalesce(item ->> 'quantityBasis', 'per_unit');
    if amount < 0.001 or amount > 100000 or amount::text in ('NaN', 'Infinity', '-Infinity')
      or basis not in ('total', 'per_unit') then
      raise exception 'Invalid accessory quantity or basis.' using errcode = '22023';
    end if;
    clean_item := jsonb_build_object(
      'name', left(btrim(item ->> 'name'), 240),
      'productNumber', left(coalesce(btrim(item ->> 'productNumber'), ''), 120),
      'quantity', amount,
      'quantityBasis', basis,
      'unit', left(coalesce(nullif(btrim(item ->> 'unit'), ''), 'st'), 30),
      'notes', left(coalesce(btrim(item ->> 'notes'), ''), 500)
    );
    identity_key := regexp_replace(lower(clean_item ->> 'productNumber'), '[^[:alnum:]]', '', 'g');
    identity_key := regexp_replace(identity_key, '^nrf', '');
    if identity_key = '' then
      identity_key := 'name:' || regexp_replace(lower(clean_item ->> 'name'), '[^[:alnum:]]', '', 'g');
    else
      identity_key := 'nrf:' || identity_key;
    end if;
    if identity_key = any(seen_identities) then
      raise exception 'Duplicate accessory.' using errcode = '22023';
    end if;
    seen_identities := array_append(seen_identities, identity_key);
    clean_accessories := clean_accessories || jsonb_build_array(clean_item);
    -- A total of five on this post is not five per product on the next post.
    -- Only legacy per-unit amounts are eligible for reusable accessory memory.
    if basis = 'per_unit' then
      reusable_accessories := reusable_accessories || jsonb_build_array(clean_item);
    end if;
  end loop;

  -- Existing functions enforce project access, explicit approval and (when
  -- supplied) the requirement revision. All following writes share that transaction.
  if requested_requirement_review is not null then
    mapping_result := public.approve_distributor_product_mapping_v3(
      requested_project_id, requested_requirement_id, requested_user_approved,
      requested_product_name, requested_product_number, requested_manufacturer_name,
      requested_notes, reusable_accessories, requested_entry_method,
      requested_product_subtitle, requested_manufacturer_article_number,
      requested_delivery_time_days, requested_unit_price, requested_currency,
      requested_requirement_review, requested_requirement_updated_at
    );
  else
    mapping_result := public.approve_distributor_product_mapping_v2(
      requested_project_id, requested_requirement_id, requested_user_approved,
      requested_product_name, requested_product_number, requested_manufacturer_name,
      requested_notes, reusable_accessories, requested_entry_method,
      requested_product_subtitle, requested_manufacturer_article_number,
      requested_delivery_time_days, requested_unit_price, requested_currency
    );
  end if;
  assignment_id := (mapping_result ->> 'assignmentId')::uuid;
  detail_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'orderQuantity', clean_order_quantity, 'accessories', clean_accessories
  ));
  update public.project_product_suggestions
    set product_snapshot = (coalesce(product_snapshot, '{}'::jsonb) - 'orderQuantity') || detail_snapshot,
        updated_at = now()
    where id = assignment_id and project_id = requested_project_id
      and requirement_id = requested_requirement_id and selected_by = actor_id and status = 'selected'
    returning product_snapshot into saved_snapshot;
  if saved_snapshot is null then raise exception 'Product quantities were not saved.'; end if;
  perform public.write_audit_log(
    (select organization_id from public.projects where id = requested_project_id),
    'distributor_product_mapping.quantities_saved', 'project_product_suggestion',
    assignment_id, null, detail_snapshot,
    jsonb_build_object('project_id', requested_project_id, 'requirement_id', requested_requirement_id)
  );
  return mapping_result || detail_snapshot || jsonb_build_object('accessoryCount', jsonb_array_length(clean_accessories));
end;
$$;

revoke all on function public.approve_distributor_product_mapping_v4(
  uuid, uuid, boolean, text, text, text, text, jsonb, text, text, text, integer, numeric, text, jsonb, timestamptz, jsonb
) from public;
grant execute on function public.approve_distributor_product_mapping_v4(
  uuid, uuid, boolean, text, text, text, text, jsonb, text, text, text, integer, numeric, text, jsonb, timestamptz, jsonb
) to authenticated;
