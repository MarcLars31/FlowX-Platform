-- Cache only derived display metadata. Source rows and their edit revisions
-- are untouched; a changed revision makes the old cache unusable immediately.
create table public.project_requirement_overviews (
  requirement_id uuid primary key references public.project_requirements(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_updated_at timestamptz not null,
  source_revision bigint not null,
  version integer not null,
  summary jsonb not null check (jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 32768)
);
create index project_requirement_overviews_project_idx on public.project_requirement_overviews(project_id);
alter table public.project_requirement_overviews enable row level security;
grant select on public.project_requirement_overviews to authenticated;
grant all on public.project_requirement_overviews to service_role;
create policy requirement_overviews_select on public.project_requirement_overviews for select to authenticated using (
  project_id in (select p.id from public.projects p where public.can_access_project(p.id))
  and organization_id in (select m.organization_id from public.organization_members m
    where m.user_id = (select auth.uid()) and m.status = 'active'
      and public.has_permission(m.organization_id, 'project.requirement.view'))
);

create or replace function public.cache_project_requirement_overviews(requested_project_id uuid, requested_organization_id uuid, entries jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) > 100 then raise exception 'INVALID_CACHE_BATCH'; end if;
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
