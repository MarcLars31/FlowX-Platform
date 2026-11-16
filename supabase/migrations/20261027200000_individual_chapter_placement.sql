-- Individual placements retain the original source hierarchy. Legacy parent
-- placements are expanded by the server and saved with the user's next edit.
alter table public.project_chapter_organization
 add column placement_version integer not null default 1 check(placement_version in (1,2));

create function public.save_individual_chapter_organization(pid uuid, expected_revision bigint, source_ids uuid[],
 target_id text default null, new_title text default null, normalized_placements jsonb default null)
 returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; saved public.project_chapter_organization; result jsonb;
begin
 select * into p from public.projects where id=pid and deleted_at is null for update;
 if not found or not public.is_delivery_manager(pid) or not public.has_permission(p.organization_id,'project.requirement.update')
 then raise exception 'Project manager access required' using errcode='42501'; end if;
 select * into saved from public.project_chapter_organization where project_id=pid;
 if expected_revision is distinct from coalesce(saved.revision,0)
 then raise exception 'Chapter placement changed; reload' using errcode='40001'; end if;
 if saved.placement_version=1 then
   if normalized_placements is null or jsonb_typeof(normalized_placements)<>'object'
   then raise exception 'Reload legacy chapter placements' using errcode='22023'; end if;
   -- Existing assignments must be preserved. Newly expanded keys can refer
   -- only to this project's sources and to an already saved destination.
   if exists(select 1 from jsonb_each(saved.placements) e where normalized_placements->e.key is distinct from e.value)
   or exists(select 1 from jsonb_each(normalized_placements) e where not saved.placements ? e.key and (
     not exists(select 1 from public.project_requirements r where r.id::text=e.key and r.project_id=pid and r.organization_id=p.organization_id)
     or not exists(select 1 from jsonb_each(saved.placements) old where old.value=e.value)))
   then raise exception 'Invalid legacy chapter placements' using errcode='22023'; end if;
   update public.project_chapter_organization set placements=normalized_placements where project_id=pid;
 end if;
 -- Original RPC enforces source ownership, limits, custom targets, revision
 -- and access again. A failed edit rolls the normalization back as well.
 result:=public.save_project_chapter_organization(pid,expected_revision,source_ids,target_id,new_title);
 update public.project_chapter_organization set placement_version=2 where project_id=pid;
 return result;
end $$;
revoke all on function public.save_individual_chapter_organization(uuid,bigint,uuid[],text,text,jsonb) from public,anon;
grant execute on function public.save_individual_chapter_organization(uuid,bigint,uuid[],text,text,jsonb) to authenticated;
