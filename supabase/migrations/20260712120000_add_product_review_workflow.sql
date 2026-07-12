create or replace function public.approve_product_review(p_review_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_product public.products%rowtype;
  product_payload jsonb;
  approval_names text[] := array[]::text[];
  approval_name text;
  approval_id uuid;
begin
  select *
  into queued_product
  from public.products
  where id = p_review_id
  for update;

  if not found then
    raise exception 'Review product not found.';
  end if;

  if queued_product.status <> 'needs_review' then
    raise exception 'Review product has already been processed.';
  end if;

  if nullif(btrim(queued_product.manufacturer), '') is null then
    raise exception 'Manufacturer is required.';
  end if;

  if nullif(btrim(queued_product.product_no), '') is null then
    raise exception 'SIN/product number is required.';
  end if;

  begin
    product_payload := coalesce(queued_product.raw_text::jsonb, '{}'::jsonb);
  exception when others then
    product_payload := '{}'::jsonb;
  end;

  if jsonb_typeof(product_payload -> 'approvals') = 'array' then
    select coalesce(array_agg(value), array[]::text[])
    into approval_names
    from jsonb_array_elements_text(product_payload -> 'approvals') value;
  elsif nullif(product_payload ->> 'approvals', '') is not null then
    approval_names := string_to_array(product_payload ->> 'approvals', ',');
  end if;

  foreach approval_name in array approval_names
  loop
    approval_name := btrim(approval_name);
    if approval_name = '' then
      continue;
    end if;

    insert into public.approvals (id, name, type)
    values (gen_random_uuid(), approval_name, 'certification')
    on conflict (name) do update set name = excluded.name
    returning id into approval_id;

    insert into public.product_approvals (
      id,
      product_id,
      approval_id,
      source_document,
      approval_text,
      status
    ) values (
      gen_random_uuid(),
      queued_product.id,
      approval_id,
      queued_product.source_document,
      approval_name,
      'approved'
    )
    on conflict (product_id, approval_id) do nothing;
  end loop;

  update public.products
  set
    status = 'approved',
    reviewed_at = now(),
    updated_at = now()
  where id = queued_product.id;

  return queued_product.id;
end;
$$;

revoke all on function public.approve_product_review(uuid) from public;
grant execute on function public.approve_product_review(uuid) to service_role;
