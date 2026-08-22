-- A learned product suggestion must never be treated as approved automatically.
-- The public application entry point requires an explicit user-approval flag and
-- stamps the saved assignment with an auditable approval marker.

revoke execute on function public.save_distributor_product_mapping(
  uuid, uuid, text, text, text, text, jsonb
) from authenticated;

create or replace function public.approve_distributor_product_mapping(
  requested_project_id uuid,
  requested_requirement_id uuid,
  requested_user_approved boolean,
  requested_product_name text,
  requested_product_number text,
  requested_manufacturer_name text default null,
  requested_notes text default null,
  requested_accessories jsonb default '[]'::jsonb
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
  approved_at timestamptz := now();
  approved_snapshot jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if requested_user_approved is distinct from true then
    raise exception 'Explicit user approval is required.' using errcode = '22023';
  end if;

  mapping_result := public.save_distributor_product_mapping(
    requested_project_id,
    requested_requirement_id,
    requested_product_name,
    requested_product_number,
    requested_manufacturer_name,
    requested_notes,
    requested_accessories
  );
  assignment_id := nullif(mapping_result ->> 'assignmentId', '')::uuid;

  update public.project_product_suggestions
  set product_snapshot = coalesce(product_snapshot, '{}'::jsonb) || jsonb_build_object(
        'approvedByUser', true,
        'approvalStatus', 'user_approved',
        'approvedBy', actor_id,
        'approvedAt', approved_at
      ),
      updated_at = approved_at
  where id = assignment_id
    and project_id = requested_project_id
    and requirement_id = requested_requirement_id
    and status = 'selected'
    and selected_by = actor_id
  returning product_snapshot into approved_snapshot;

  if approved_snapshot is null then
    raise exception 'Approved product assignment was not saved.';
  end if;

  perform public.write_audit_log(
    (select organization_id from public.projects where id = requested_project_id),
    'distributor_product_mapping.user_approved',
    'project_product_suggestion',
    assignment_id,
    null,
    approved_snapshot,
    jsonb_build_object(
      'project_id', requested_project_id,
      'requirement_id', requested_requirement_id,
      'approved_by', actor_id,
      'approved_at', approved_at
    )
  );

  return mapping_result || jsonb_build_object(
    'approvedByUser', true,
    'approvalStatus', 'user_approved',
    'approvedAt', approved_at
  );
end;
$$;

revoke all on function public.approve_distributor_product_mapping(
  uuid, uuid, boolean, text, text, text, text, jsonb
) from public;
grant execute on function public.approve_distributor_product_mapping(
  uuid, uuid, boolean, text, text, text, text, jsonb
) to authenticated;

comment on function public.approve_distributor_product_mapping(
  uuid, uuid, boolean, text, text, text, text, jsonb
) is
  'Saves a distributor product only after explicit user approval and records who approved it and when.';

-- Historical distributor_manual assignments were created through the former
-- explicit confirmation button. Preserve those deliberate decisions while
-- moving them to the stricter approval model.
update public.project_product_suggestions
set product_snapshot = coalesce(product_snapshot, '{}'::jsonb) || jsonb_build_object(
      'approvedByUser', true,
      'approvalStatus', 'user_approved',
      'approvedBy', selected_by,
      'approvedAt', coalesce(selected_at, updated_at, created_at)
    ),
    updated_at = now()
where status = 'selected'
  and product_snapshot ->> 'source' = 'distributor_manual'
  and coalesce((product_snapshot ->> 'approvedByUser')::boolean, false) is false;
