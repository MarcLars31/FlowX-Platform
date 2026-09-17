-- The customer workflow no longer has a separate requirement-review screen.
-- Extraction status is kept for traceability until a distributor explicitly
-- saves a product for the row. That action promotes the row atomically enough
-- for the existing, stricter product-memory RPC to accept it.

create or replace function public.prepare_requirement_for_direct_product_mapping(
  requested_project_id uuid,
  requested_requirement_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  project_row public.projects%rowtype;
  requirement_row public.project_requirements%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into project_row
  from public.projects
  where id = requested_project_id
    and deleted_at is null;
  if not found then
    raise exception 'Project not found.';
  end if;

  if not public.can_access_project(project_row.id)
    or not public.has_permission(
      project_row.organization_id,
      'project.product_suggestion.create'
    ) then
    raise exception 'Product mapping access denied.' using errcode = '42501';
  end if;

  select * into requirement_row
  from public.project_requirements
  where id = requested_requirement_id
    and project_id = project_row.id
    and organization_id = project_row.organization_id
    and deleted_at is null;
  if not found then
    raise exception 'Requirement not found.';
  end if;

  if lower(coalesce(requirement_row.value_json ->> 'operation', 'install')) = 'remove' then
    raise exception 'Removal lines cannot receive a product.';
  end if;
  if requirement_row.status in ('rejected', 'superseded') then
    raise exception 'Rejected requirements cannot receive a product.';
  end if;

  if requirement_row.status in (
    'extracted_unreviewed',
    'inferred_unreviewed',
    'conflicted'
  ) then
    update public.project_requirements
    set status = 'user_confirmed',
        updated_at = now()
    where id = requirement_row.id
    returning * into requirement_row;
  end if;

  return requirement_row.status::text;
end;
$$;

revoke all on function public.prepare_requirement_for_direct_product_mapping(uuid, uuid)
  from public;
grant execute on function public.prepare_requirement_for_direct_product_mapping(uuid, uuid)
  to authenticated;

comment on function public.prepare_requirement_for_direct_product_mapping(uuid, uuid) is
  'Promotes an extracted product row when an authorized distributor saves its product mapping.';
