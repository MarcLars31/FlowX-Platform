-- Removing a saved product uses the same lock and revision as approval.
-- Keep the rejected snapshot for history; only selected snapshots contribute
-- main products and their accessories to the current choice and material list.
create or replace function public.clear_product_choice(
  requested_project_id uuid, requested_requirement_id uuid, requested_revision bigint
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  requirement_row public.project_requirements;
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
  update public.project_product_suggestions set status = 'rejected'
    where project_id = requested_project_id and requirement_id = requested_requirement_id and status = 'selected';
  update public.project_requirements set value_json = coalesce(value_json, '{}'::jsonb) - 'productResolution'
    where id = requested_requirement_id;
  perform public.write_audit_log(requirement_row.organization_id, 'product_choice.cleared', 'project_requirement',
    requested_requirement_id, null, null, jsonb_build_object('revision', requested_revision));
  return jsonb_build_object('editRevision', (select edit_revision from public.project_requirements where id = requested_requirement_id));
end; $$;
revoke all on function public.clear_product_choice(uuid,uuid,bigint) from public;
grant execute on function public.clear_product_choice(uuid,uuid,bigint) to authenticated;
