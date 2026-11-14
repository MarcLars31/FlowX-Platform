-- Keep the complete, project-specific requirement review in the same
-- transaction as the explicitly approved product and its component articles.
create or replace function public.approve_distributor_product_mapping_v3(
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
  requested_requirement_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  project_row public.projects%rowtype;
  requirement_row public.project_requirements%rowtype;
  mapping_result jsonb;
  assignment_id uuid;
  review_snapshot jsonb;
  saved_snapshot jsonb;
  check_row jsonb;
  decision jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into project_row from public.projects
    where id = requested_project_id and deleted_at is null;
  if not found then raise exception 'Project not found.'; end if;
  if not public.can_access_project(project_row.id)
    or not public.has_permission(project_row.organization_id, 'project.product_suggestion.create') then
    raise exception 'Product mapping access denied.' using errcode = '42501';
  end if;

  select * into requirement_row from public.project_requirements
    where id = requested_requirement_id and project_id = project_row.id
      and organization_id = project_row.organization_id and deleted_at is null
    for update;
  if not found then raise exception 'Requirement not found.'; end if;
  if requested_requirement_updated_at is null
    or requirement_row.updated_at is distinct from requested_requirement_updated_at then
    raise exception 'Requirement changed during review.' using errcode = '40001';
  end if;

  if requested_requirement_review is null
    or jsonb_typeof(requested_requirement_review) is distinct from 'object'
    or requested_requirement_review ->> 'version' is distinct from '1'
    or nullif(requested_requirement_review ->> 'revision', '') is null
    or nullif(requested_requirement_review ->> 'confirmation', '') is null
    or jsonb_typeof(requested_requirement_review -> 'checks') is distinct from 'array'
    or jsonb_typeof(requested_requirement_review -> 'decisions') is distinct from 'object' then
    raise exception 'A completed requirement review is required.' using errcode = '22023';
  end if;
  if jsonb_array_length(requested_requirement_review -> 'checks') not between 1 and 250 then
    raise exception 'Invalid requirement review size.' using errcode = '22023';
  end if;
  for check_row in select value from jsonb_array_elements(requested_requirement_review -> 'checks') loop
    decision := requested_requirement_review -> 'decisions' -> (check_row ->> 'id');
    if decision is null or decision ->> 'status' not in ('product', 'handled', 'not_applicable')
      or decision ->> 'status' is null then
      raise exception 'Every requirement must be reviewed.' using errcode = '22023';
    end if;
    if decision ->> 'status' = 'product' then
      if jsonb_typeof(decision -> 'productKeys') is distinct from 'array' then
        raise exception 'Reviewed product links are required.' using errcode = '22023';
      end if;
      if jsonb_array_length(decision -> 'productKeys') = 0 then
        raise exception 'Reviewed product links are required.' using errcode = '22023';
      end if;
    else
      if nullif(btrim(decision ->> 'note'), '') is null then
        raise exception 'A review comment is required.' using errcode = '22023';
      end if;
      if decision ->> 'status' = 'not_applicable' and check_row ->> 'optional' is distinct from 'true' then
        raise exception 'Mandatory requirements cannot be skipped.' using errcode = '22023';
      end if;
    end if;
  end loop;

  mapping_result := public.approve_distributor_product_mapping_v2(
    requested_project_id, requested_requirement_id, requested_user_approved,
    requested_product_name, requested_product_number, requested_manufacturer_name,
    requested_notes, requested_accessories, requested_entry_method,
    requested_product_subtitle, requested_manufacturer_article_number,
    requested_delivery_time_days, requested_unit_price, requested_currency
  );
  assignment_id := (mapping_result ->> 'assignmentId')::uuid;
  review_snapshot := requested_requirement_review || jsonb_build_object(
    'reviewedBy', actor_id, 'reviewedAt', now(),
    'sourceRequirementUpdatedAt', requested_requirement_updated_at
  );
  update public.project_product_suggestions
    set product_snapshot = coalesce(product_snapshot, '{}'::jsonb)
      || jsonb_build_object('requirementReview', review_snapshot), updated_at = now()
    where id = assignment_id and project_id = requested_project_id
      and requirement_id = requested_requirement_id and selected_by = actor_id and status = 'selected'
    returning product_snapshot into saved_snapshot;
  if saved_snapshot is null then raise exception 'Requirement review was not saved.'; end if;
  perform public.write_audit_log(project_row.organization_id,
    'distributor_product_mapping.requirements_reviewed', 'project_product_suggestion',
    assignment_id, null, review_snapshot,
    jsonb_build_object('project_id', requested_project_id, 'requirement_id', requested_requirement_id));
  return mapping_result || jsonb_build_object('requirementReview', review_snapshot);
end;
$$;

revoke all on function public.approve_distributor_product_mapping_v3(
  uuid, uuid, boolean, text, text, text, text, jsonb, text, text, text, integer, numeric, text, jsonb, timestamptz
) from public;
grant execute on function public.approve_distributor_product_mapping_v3(
  uuid, uuid, boolean, text, text, text, text, jsonb, text, text, text, integer, numeric, text, jsonb, timestamptz
) to authenticated;
