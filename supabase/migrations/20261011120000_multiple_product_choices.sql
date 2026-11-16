-- One approved post snapshot, containing independent main products and accessories.
-- Reuse all existing product validation, permission checks, learning and audit writes.
create or replace function public.save_product_choices(
  requested_project_id uuid, requested_requirement_id uuid, requested_revision bigint,
  requested_products jsonb, requested_legacy boolean default false
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  requirement_row public.project_requirements;
  item jsonb; result jsonb; snapshot jsonb; snapshots jsonb := '[]'::jsonb;
  assignment_id uuid; current_revision bigint; identity_key text;
  identities text[] := array[]::text[];
begin
  if auth.uid() is null or not public.can_access_project(requested_project_id) then
    raise exception 'Project access denied' using errcode = '42501';
  end if;
  select * into requirement_row from public.project_requirements
    where id = requested_requirement_id and project_id = requested_project_id and deleted_at is null for update;
  if not found or not public.has_permission(requirement_row.organization_id, 'project.product_suggestion.create')
    or not public.can_edit_project_requirement(requested_requirement_id) then
    raise exception 'Product selection access denied' using errcode = '42501';
  end if;
  if requested_revision is null or requirement_row.edit_revision <> requested_revision then
    raise exception 'The post or its product selection has changed. Reopen the card.' using errcode = '40001';
  end if;
  if jsonb_typeof(requested_products) is distinct from 'array' then
    raise exception 'Products must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(requested_products) not between 1 and 20 then
    raise exception 'Choose between 1 and 20 products' using errcode = '22023';
  end if;
  if requested_legacy and exists(select 1 from public.project_product_suggestions
    where project_id=requested_project_id and requirement_id=requested_requirement_id and status='selected'
      and jsonb_array_length(coalesce(product_snapshot->'products','[]'))>1) then
    raise exception 'Multiple products are saved. Reload the application before editing.' using errcode='40001';
  end if;
  for item in select value from jsonb_array_elements(requested_products) loop
    identity_key := regexp_replace(regexp_replace(lower(coalesce(item->>'productNumber','')), '[^[:alnum:]]', '', 'g'), '^nrf', '');
    if jsonb_typeof(item) is distinct from 'object' or item->>'userApproved' is distinct from 'true'
      or identity_key = '' or identity_key = any(identities) then
      raise exception 'Invalid or duplicate product choice' using errcode='22023';
    end if;
    identities := array_append(identities, identity_key);
    select edit_revision into current_revision from public.project_requirements where id=requested_requirement_id;
    result := public.save_product_choice(requested_project_id, requested_requirement_id, current_revision, 'approve', item);
    assignment_id := (result->>'assignmentId')::uuid;
    select product_snapshot - 'products' into snapshot from public.project_product_suggestions
      where id=assignment_id and project_id=requested_project_id and requirement_id=requested_requirement_id and status='selected';
    if snapshot is null then raise exception 'Product choice was not saved'; end if;
    snapshots := snapshots || jsonb_build_array(snapshot);
  end loop;
  -- The outer fields keep older read-only consumers compatible. The array is authoritative.
  update public.project_product_suggestions set product_snapshot = (snapshots->0) || jsonb_build_object('products',snapshots)
    where id=assignment_id;
  return jsonb_build_object('assignmentId',assignment_id,'productCount',jsonb_array_length(snapshots),
    'editRevision',(select edit_revision from public.project_requirements where id=requested_requirement_id));
end $$;
revoke all on function public.save_product_choices(uuid,uuid,bigint,jsonb,boolean) from public;
grant execute on function public.save_product_choices(uuid,uuid,bigint,jsonb,boolean) to authenticated;
