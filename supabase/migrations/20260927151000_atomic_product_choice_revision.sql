alter table public.project_requirements add column if not exists edit_revision bigint not null default 0;

create or replace function public.bump_requirement_edit_revision() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  new.edit_revision := old.edit_revision + 1;
  return new;
end; $$;
create trigger requirement_edit_revision before update on public.project_requirements
for each row execute function public.bump_requirement_edit_revision();

create or replace function public.bump_assignment_requirement_revision() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if tg_op <> 'INSERT' then
    update public.project_requirements set edit_revision = edit_revision
      where id = old.requirement_id and project_id = old.project_id;
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.requirement_id is distinct from old.requirement_id) then
    update public.project_requirements set edit_revision = edit_revision
      where id = new.requirement_id and project_id = new.project_id;
  end if;
  return null;
end; $$;
create trigger assignment_requirement_revision after insert or update or delete on public.project_product_suggestions
for each row execute function public.bump_assignment_requirement_revision();

create or replace function public.save_product_choice(
  requested_project_id uuid, requested_requirement_id uuid, requested_revision bigint,
  requested_action text, requested_input jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  requirement_row public.project_requirements;
  result jsonb;
begin
  if auth.uid() is null or not public.can_access_project(requested_project_id) then
    raise exception 'Project access denied' using errcode = '42501';
  end if;
  select * into requirement_row from public.project_requirements
    where id = requested_requirement_id and project_id = requested_project_id and deleted_at is null for update;
  if not found or not public.has_permission(requirement_row.organization_id, 'project.product_suggestion.create') then
    raise exception 'Product selection access denied' using errcode = '42501';
  end if;
  -- This revision covers both the specification and ALL selected-product writes,
  -- including a first choice, changes from legacy clients and selection removal.
  if requested_revision is null or requirement_row.edit_revision <> requested_revision then
    raise exception 'The post or its product selection has changed. Reopen the card.' using errcode = '40001';
  end if;
  if requested_action = 'approve' then
    result := public.approve_distributor_product_mapping_v4(
      requested_project_id, requested_requirement_id, (requested_input->>'userApproved')::boolean,
      requested_input->>'productName', requested_input->>'productNumber', requested_input->>'manufacturerName',
      requested_input->>'notes', coalesce(requested_input->'accessories', '[]'::jsonb), requested_input->>'entryMethod',
      requested_input->>'productSubtitle', requested_input->>'manufacturerArticleNumber',
      (requested_input->>'deliveryTimeDays')::integer, (requested_input->>'unitPrice')::numeric, requested_input->>'currency',
      nullif(requested_input->'requirementReview', 'null'::jsonb), requirement_row.updated_at,
      nullif(requested_input->'orderQuantity', 'null'::jsonb)
    );
    update public.project_requirements set value_json = coalesce(value_json, '{}'::jsonb) - 'productResolution'
      where id = requested_requirement_id;
  elsif requested_action in ('not_in_assortment', 'clear_resolution') then
    if requested_action = 'not_in_assortment' then
      perform public.prepare_requirement_for_direct_product_mapping(requested_project_id, requested_requirement_id);
      update public.project_product_suggestions set status = 'rejected'
        where project_id = requested_project_id and requirement_id = requested_requirement_id and status = 'selected';
    end if;
    update public.project_requirements set value_json = (coalesce(value_json, '{}'::jsonb) - 'productResolution') ||
      case when requested_action = 'not_in_assortment' then jsonb_build_object('productResolution', jsonb_build_object(
        'status', 'not_in_assortment', 'resolvedAt', now(), 'resolvedBy', auth.uid())) else '{}'::jsonb end
      where id = requested_requirement_id;
    result := '{}'::jsonb;
  else
    raise exception 'Invalid product action' using errcode = '22023';
  end if;
  perform public.write_audit_log(requirement_row.organization_id, 'product_choice.saved', 'project_requirement',
    requested_requirement_id, null, null, jsonb_build_object('revision', requested_revision, 'action', requested_action,
      'extractionVersion', requirement_row.value_json->'extractionVersion'));
  return result || jsonb_build_object('editRevision', (select edit_revision from public.project_requirements where id = requested_requirement_id));
end; $$;
revoke all on function public.save_product_choice(uuid,uuid,bigint,text,jsonb) from public;
grant execute on function public.save_product_choice(uuid,uuid,bigint,text,jsonb) to authenticated;
revoke all on function public.bump_assignment_requirement_revision() from public;
revoke all on function public.bump_requirement_edit_revision() from public;
