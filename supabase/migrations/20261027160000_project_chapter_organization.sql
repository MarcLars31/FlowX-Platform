-- User-defined placement of preserved PDF text. Original extraction and product
-- relationships remain immutable. Development migration; no production rollout.
create table public.project_chapter_organization (
 project_id uuid primary key references public.projects(id) on delete cascade,
 organization_id uuid not null references public.organizations(id),
 revision bigint not null default 0 check(revision >= 0),
 custom_chapters jsonb not null default '[]'::jsonb check(jsonb_typeof(custom_chapters)='array'),
 placements jsonb not null default '{}'::jsonb check(jsonb_typeof(placements)='object'),
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
alter table public.project_chapter_organization enable row level security;
create policy chapter_organization_read on public.project_chapter_organization for select to authenticated
 using(public.can_access_project(project_id) and public.has_permission(organization_id,'project.requirement.view'));
grant select on public.project_chapter_organization to authenticated;

create function public.save_project_chapter_organization(pid uuid, expected_revision bigint, source_ids uuid[], target_id text default null, new_title text default null)
 returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; saved public.project_chapter_organization; chapters jsonb; moves jsonb; rid uuid; destination text; current_revision bigint;
begin
 select * into p from public.projects where id=pid and deleted_at is null for update;
 if not found or not public.is_delivery_manager(pid) or not public.has_permission(p.organization_id,'project.requirement.update')
 then raise exception 'Project manager access required' using errcode='42501'; end if;
 if source_ids is null or cardinality(source_ids) not between 1 and 500
 or (select count(distinct id) from unnest(source_ids) id) <> cardinality(source_ids)
 then raise exception 'Select 1 to 500 distinct source posts' using errcode='22023'; end if;
 if (select count(*) from public.project_requirements r where r.id=any(source_ids) and r.project_id=pid
 and r.organization_id=p.organization_id and r.deleted_at is null and r.status not in ('superseded','rejected')) <> cardinality(source_ids)
 then raise exception 'Source post not found in project' using errcode='22023'; end if;
 select * into saved from public.project_chapter_organization where project_id=pid;
 current_revision:=coalesce(saved.revision,0);
 if expected_revision is distinct from current_revision then raise exception 'Chapter placement changed; reload' using errcode='40001'; end if;
 chapters:=coalesce(saved.custom_chapters,'[]'::jsonb); moves:=coalesce(saved.placements,'{}'::jsonb);
 destination:=target_id;
 if new_title is not null then
   if target_id is not null or length(btrim(new_title)) not between 1 and 160 or jsonb_array_length(chapters)>=200
   then raise exception 'Invalid new chapter' using errcode='22023'; end if;
   destination:='custom:'||gen_random_uuid()::text;
   chapters:=chapters||jsonb_build_array(jsonb_build_object('id',destination,'title',btrim(new_title)));
 elsif target_id is not null then
   if length(target_id) not between 1 and 2000 then raise exception 'Invalid chapter' using errcode='22023'; end if;
   if starts_with(target_id,'custom:') and not exists(select 1 from jsonb_array_elements(chapters) c where c->>'id'=target_id)
   then raise exception 'Custom chapter not found' using errcode='22023'; end if;
 end if;
 foreach rid in array source_ids loop
   if destination is null then moves:=moves-rid::text;
   else moves:=jsonb_set(moves,array[rid::text],to_jsonb(destination)); end if;
 end loop;
 insert into public.project_chapter_organization(project_id,organization_id,revision,custom_chapters,placements,updated_by)
 values(pid,p.organization_id,current_revision+1,chapters,moves,auth.uid())
 on conflict(project_id) do update set revision=excluded.revision,custom_chapters=excluded.custom_chapters,placements=excluded.placements,updated_by=excluded.updated_by,updated_at=now();
 return jsonb_build_object('revision',current_revision+1,'customChapters',chapters,'placements',moves);
end $$;
revoke all on function public.save_project_chapter_organization(uuid,bigint,uuid[],text,text) from public,anon;
grant execute on function public.save_project_chapter_organization(uuid,bigint,uuid[],text,text) to authenticated;
