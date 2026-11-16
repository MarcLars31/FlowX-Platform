-- One permission snapshot per request, with fresh membership validation in SQL.
create function public.current_organization_context(requested_organization_id uuid default null) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('organization',to_jsonb(o),'membership',to_jsonb(m)||jsonb_build_object('role_slug',r.slug),
  'permissions',coalesce((select jsonb_agg(p.key order by p.key) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=r.id),'[]'::jsonb))
 from public.organization_members m join public.organizations o on o.id=m.organization_id join public.roles r on r.id=m.role_id
 where m.user_id=auth.uid() and m.status='active' and o.deleted_at is null and o.status='active'
 order by (m.organization_id=requested_organization_id) desc nulls last,m.created_at,m.id limit 1;
$$;
revoke all on function public.current_organization_context(uuid) from public,anon;
grant execute on function public.current_organization_context(uuid) to authenticated;

-- IDs travel in a POST body, avoiding long GET URLs; RLS remains in force.
create function public.project_requirement_detail_batch(requested_project_id uuid,requested_ids uuid[]) returns setof public.project_requirements
language plpgsql stable security invoker set search_path=pg_catalog as $$
begin
 if cardinality(requested_ids)>500 then raise exception 'Batch too large'; end if;
 return query select * from public.project_requirements where project_id=requested_project_id and id=any(requested_ids) and deleted_at is null;
end; $$;
revoke all on function public.project_requirement_detail_batch(uuid,uuid[]) from public,anon;
grant execute on function public.project_requirement_detail_batch(uuid,uuid[]) to authenticated;
create or replace function public.cache_project_requirement_overviews(requested_project_id uuid, requested_organization_id uuid, entries jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) > 500 then raise exception 'INVALID_CACHE_BATCH'; end if;
  insert into public.project_requirement_overviews(requirement_id, project_id, organization_id, source_updated_at, source_revision, version, summary)
  select r.id, r.project_id, r.organization_id, r.updated_at, r.edit_revision, e.version, e.summary
  from jsonb_to_recordset(entries) e(requirement_id uuid, source_updated_at timestamptz, source_revision bigint, version integer, summary jsonb)
  join public.project_requirements r on r.id = e.requirement_id
  where r.project_id = requested_project_id and r.organization_id = requested_organization_id and r.deleted_at is null
    and r.edit_revision = e.source_revision and r.updated_at = e.source_updated_at and e.summary->>'id' = r.id::text
  on conflict(requirement_id) do update set source_updated_at = excluded.source_updated_at,
    source_revision = excluded.source_revision, version = excluded.version, summary = excluded.summary
    where project_requirement_overviews.source_revision <= excluded.source_revision;
end;
$$;
revoke all on function public.cache_project_requirement_overviews(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.cache_project_requirement_overviews(uuid,uuid,jsonb) to service_role;
