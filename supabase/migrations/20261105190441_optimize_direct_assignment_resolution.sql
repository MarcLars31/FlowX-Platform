-- These internal readers are called only after the public entry point has
-- checked project/organization access. Resolve parents and package scopes once
-- for the whole project instead of repeating permission checks per descendant.
create function scipx_assignment_internal.resolution(pid uuid)
returns table(requirement_id uuid,work_id uuid,main_id uuid,hierarchy_review boolean,chapter_key text)
language sql stable set search_path=pg_catalog as $$
 with recursive nodes as materialized (
   select r.id,public.post_parent_id(r.id) as parent_id,public.post_is_source_chapter(r) as is_chapter,
     public.requirement_chapter_key(r) as chapter_key,r.category,r.value_json->>'postNumber' as number,
     coalesce(nullif(r.value_json->>'parentRequirementId',''),nullif(r.value_json->>'parentSourcePostId',''),nullif(r.value_json->>'parentPostNumber','')) is not null as has_parent,
     coalesce(r.value_json->'reviewFlags','[]') ?| array['unassigned-source-text','unverified-post-source'] as flagged
   from public.project_requirements r where r.project_id=pid and r.deleted_at is null and r.status not in ('superseded','rejected')
 ), walk(origin,current_id,path) as (
   select n.id,n.id,'{}'::uuid[] from nodes n
   union all
   select w.origin,n.parent_id,array_append(w.path,n.parent_id) from walk w join nodes n on n.id=w.current_id
   where n.parent_id is not null and n.parent_id<>w.origin and not n.parent_id=any(w.path) and cardinality(w.path)<128
 ), ancestry as materialized (
   select w.origin,case when n.parent_id is null then w.path else '{}'::uuid[] end as ancestors,
     n.parent_id is not null as broken_chain
   from walk w join nodes n on n.id=w.current_id
   where n.parent_id is null or n.parent_id=w.origin or n.parent_id=any(w.path) or cardinality(w.path)>=128
 ), hierarchy as materialized (
   select n.*,a.ancestors,(a.broken_chain or exists(select 1 from nodes reviewed where reviewed.id=any(array_prepend(n.id,a.ancestors))
     and ((reviewed.has_parent and reviewed.parent_id is null) or (reviewed.flagged and not reviewed.is_chapter)))) as needs_review
   from nodes n join ancestry a on a.origin=n.id
 ), packages as materialized (
   select w.*,anchor.id as anchor_id,anchor.chapter_key as anchor_chapter from public.project_work_packages w
   left join nodes anchor on anchor.id::text=w.scope_value
   where w.project_id=pid and w.assignment_mode<>'inherit'
   and (not public.pm_enabled(pid) or w.department_id is not null or w.direct_assignee or w.assignment_mode='unassigned')
 )
 select h.id,w.id,case when h.needs_review then null else coalesce(main.id,h.id) end,h.needs_review,h.chapter_key
 from hierarchy h left join lateral (
   select n.id from unnest(h.ancestors) with ordinality a(id,position) join nodes n on n.id=a.id
   where not n.is_chapter order by a.position limit 1
 ) main on true left join lateral (
   select p.id from packages p where
     (p.scope_type='post' and p.scope_value=h.id::text)
     or (p.scope_type='main_post' and (p.anchor_id=h.id or p.anchor_id=any(h.ancestors)))
     or (p.scope_type='pdf_chapter' and p.anchor_chapter=h.chapter_key)
     or (p.scope_type='chapter' and (h.number=p.scope_value or starts_with(h.number,p.scope_value||'.')))
     or (p.scope_type='group' and h.category=p.scope_value)
   order by case p.scope_type when 'post' then 5 when 'main_post' then 4 when 'pdf_chapter' then 3 when 'chapter' then 2 else 1 end desc,
     case when p.scope_type='main_post' then coalesce(array_position(h.ancestors,p.anchor_id),0) else 0 end,
     length(p.scope_value) desc,p.id limit 1
 ) w on true;
$$;
revoke all on function scipx_assignment_internal.resolution(uuid) from public,anon,authenticated;
create or replace function scipx_assignment_internal.capture_deadlines(pid uuid) returns void
language sql set search_path=pg_catalog as $$
 with pending as materialized (
   select r.*,resolved.work_id,resolved.chapter_key
   from scipx_assignment_internal.resolution(pid) resolved join public.project_requirements r on r.id=resolved.requirement_id left join public.project_work_deadlines d on d.requirement_id=r.id
   where r.project_id=pid and r.deleted_at is null and r.status not in ('superseded','rejected') and not coalesce(d.captured,false)
 ), chapter_dates as materialized (
   select distinct on (public.requirement_chapter_key(a)) public.requirement_chapter_key(a) as chapter_key,cw.due_date
   from public.project_work_packages cw join public.project_requirements a on a.id::text=cw.scope_value and a.project_id=pid
   where cw.project_id=pid and cw.scope_type='pdf_chapter' and a.deleted_at is null and a.status not in ('superseded','rejected')
   order by public.requirement_chapter_key(a),cw.id
 )
 insert into public.project_work_deadlines(requirement_id,project_id,inherited_date,captured)
 select r.id,pid,coalesce(w.due_date,c.due_date,s.deadline),true from pending r
 join public.project_work_packages w on w.id=r.work_id and w.assigned_to is not null
 join public.project_management_settings s on s.project_id=pid left join chapter_dates c on c.chapter_key=r.chapter_key
 on conflict(requirement_id) do update set inherited_date=excluded.inherited_date,captured=true,revision=project_work_deadlines.revision+1;
$$;

create or replace function scipx_assignment_internal.read(pid uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare p public.projects; result jsonb; manager boolean; assignments jsonb; people jsonb; posts jsonb;
 enabled boolean; active_member boolean; can_create boolean;
begin
 select * into p from public.projects where id=pid and deleted_at is null;
 if not found or not public.can_access_project(pid) or not (public.has_permission(p.organization_id,'project.requirement.view') or public.has_permission(p.organization_id,'project.product_suggestion.view'))
 then raise exception 'Project access denied' using errcode='42501'; end if;
 manager:=public.is_delivery_manager(pid);
 enabled:=public.pm_enabled(pid);active_member:=public.pm_active_member(pid,auth.uid());
 can_create:=public.has_permission(p.organization_id,'project.product_suggestion.create');
 result:=jsonb_build_object('projectId',pid,'name',p.name,'userId',auth.uid(),'manager',manager,
   'settings',(select to_jsonb(s) from public.project_management_settings s where s.project_id=pid),
   'departments',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'supervisorId',d.supervisor_id)) from public.teams t left join public.project_work_departments d on d.department_id=t.id and d.project_id=pid where t.organization_id=p.organization_id and t.status='active' and (manager or public.pm_in_department(pid,t.id,auth.uid()))),'[]'),
   'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'departmentId',tm.team_id,'name',coalesce(pr.display_name,pr.email,m.user_id::text))) from public.team_members tm join public.teams t on t.id=tm.team_id and t.organization_id=p.organization_id and t.status='active' join public.organization_members m on m.id=tm.organization_member_id and m.organization_id=p.organization_id and m.status='active' left join public.profiles pr on pr.id=m.user_id where manager or public.pm_in_department(pid,t.id,auth.uid())),'[]'));
 -- Evaluate the same pm_can_read/can_edit predicates once per package, then
 -- join the effective package. Hundreds of inherited posts share one package.
 with package_access as materialized (
   select w.*,
     (public.pm_in_department(pid,w.department_id,auth.uid()) or (w.direct_assignee and w.department_id is null and w.assigned_to=auth.uid() and active_member)) as readable,
     (can_create and ((public.pm_in_department(pid,w.department_id,auth.uid()) and (w.assigned_to=auth.uid() or public.pm_is_supervisor(pid,w.department_id)))
       or (w.direct_assignee and w.department_id is null and w.assigned_to=auth.uid() and active_member))) as can_edit_work
   from public.project_work_packages w where w.project_id=pid
 ), resolved as materialized (
   select r.*,resolved.work_id,resolved.chapter_key,resolved.main_id,resolved.hierarchy_review
   from scipx_assignment_internal.resolution(pid) resolved join public.project_requirements r on r.id=resolved.requirement_id
 ), chapter_dates as materialized (
   select distinct on (public.requirement_chapter_key(a)) public.requirement_chapter_key(a) as chapter_key,cw.due_date
   from public.project_work_packages cw join public.project_requirements a on a.id::text=cw.scope_value and a.project_id=pid
   where cw.project_id=pid and cw.scope_type='pdf_chapter' and a.deleted_at is null and a.status not in ('superseded','rejected')
   order by public.requirement_chapter_key(a),cw.id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',r.id,'number',r.value_json->>'postNumber','title',left(coalesce(r.value_text,''),200),'chapter',coalesce(r.value_json#>>'{sourceChapter,title}','Kapittel uten navn'),
   'chapterKey',r.chapter_key,'assignmentId',r.work_id,'assignmentMode',w.assignment_mode,
   'dueDate',case when s.project_id is null then null when d.due_date is not null then d.due_date when d.captured then d.inherited_date else coalesce(w.due_date,c.due_date,s.deadline) end,
   'ownDeadline',d.due_date,'deadlineRevision',coalesce(d.revision,-1),'canEdit',manager or case when enabled then coalesce(w.can_edit_work,false) else public.can_edit_project_requirement(r.id) end,
   'done',coalesce(ts.done,false),'revision',coalesce(ts.revision,-1),'openHelp',(select count(*) from public.project_help_requests h where h.requirement_id=r.id and h.resolved_at is null),
   'sourcePage',r.source_page,'sourceOrder',r.value_json->'sourceOrder','documentId',coalesce(r.source_technical_description_document_id,r.source_document_id),
   'hierarchyReview',r.hierarchy_review,'mainPost',case when main.id is not null then jsonb_build_object('id',main.id,'number',main.value_json->>'postNumber','title',left(coalesce(main.value_text,''),200),'standalone',main.id=r.id) else null end,
   'measurement',jsonb_build_object('unit',r.value_json->'unit','quantity',r.value_json->'quantity','pdfColumnValues',r.value_json->'pdfColumnValues','quantityText',r.value_json->'quantityText'),
   'sourceChapter',r.value_json->'sourceChapter'
 ) order by coalesce(r.source_page,0),r.value_json->>'sourceOrder',r.id),'[]') into posts
 from resolved r left join package_access w on w.id=r.work_id
 left join public.project_requirements main on main.id=r.main_id
 left join public.project_task_states ts on ts.requirement_id=r.id left join public.project_work_deadlines d on d.requirement_id=r.id
 left join public.project_management_settings s on s.project_id=pid left join chapter_dates c on c.chapter_key=r.chapter_key
 where manager or not enabled or w.readable;
 select coalesce(jsonb_agg(to_jsonb(w) || case when w.scope_type='pdf_chapter'
   then jsonb_build_object('chapter_key',public.requirement_chapter_key(a)) else '{}'::jsonb end order by w.id),'[]')
 into assignments from public.project_work_packages w
 left join public.project_requirements a on a.id::text=w.scope_value and a.project_id=pid
 where w.project_id=pid and (manager or public.pm_in_department(pid,w.department_id,auth.uid())
   or (w.direct_assignee and w.department_id is null and w.assigned_to=auth.uid() and public.pm_active_member(pid,auth.uid())));
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name,c.id),'[]') into people
 from scipx_assignment_internal.candidates(pid) c where manager;
 result:=result || jsonb_build_object('posts',posts,'assignments',assignments,'assignees',people,
   'assignmentVersion',case when manager then scipx_assignment_internal.version(pid) else null end);
 -- Preserve department names used by the follow-up view and add direct assignees.
 return jsonb_set(result,'{members}',coalesce(result->'members','[]') || coalesce((
 select jsonb_agg(jsonb_build_object('id',pr.id,'departmentId',null,'name',coalesce(nullif(pr.display_name,''),pr.email,pr.id::text)))
 from public.profiles pr where exists(select 1 from jsonb_array_elements(assignments) a where a->>'assigned_to'=pr.id::text)
 and not exists(select 1 from jsonb_array_elements(result->'members') m where m->>'id'=pr.id::text)),'[]'));
end $$;

create or replace function public.project_management_overview(oid uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with visible_projects as materialized (
   select p.id,p.name,s.deadline,public.is_delivery_manager(p.id) as manager,
     (public.has_permission(p.organization_id,'project.requirement.view') or public.has_permission(p.organization_id,'project.product_suggestion.view')) as can_read
   from public.projects p join public.project_management_settings s on s.project_id=p.id
   where p.organization_id=oid and p.deleted_at is null and public.can_access_project(p.id)
   and exists(select 1 from public.organization_members m where m.organization_id=oid and m.user_id=auth.uid() and m.status='active')
 ), visible_posts as materialized (
   select r.id,r.project_id,resolved.chapter_key,resolved.work_id
   from visible_projects p cross join lateral scipx_assignment_internal.resolution(p.id) resolved join public.project_requirements r on r.id=resolved.requirement_id
   where p.can_read and r.deleted_at is null and r.status<>'superseded' and (p.manager or public.pm_can_read(r.id))
 ), chapter_dates as materialized (
   select distinct on (w.project_id,public.requirement_chapter_key(a)) w.project_id,public.requirement_chapter_key(a) as chapter_key,w.due_date
   from visible_projects p join public.project_work_packages w on w.project_id=p.id and w.scope_type='pdf_chapter'
   join public.project_requirements a on a.id::text=w.scope_value and a.project_id=p.id
   where a.deleted_at is null and a.status<>'superseded' order by w.project_id,public.requirement_chapter_key(a),w.id
 ), counts as (
   select r.project_id,count(*) as total,count(*) filter(where ts.done) as done,
   count(*) filter(where not coalesce(ts.done,false) and (case when d.due_date is not null then d.due_date when d.captured then d.inherited_date else coalesce(w.due_date,c.due_date,p.deadline) end)<(now() at time zone 'Europe/Oslo')::date) as late,
   count(*) filter(where exists(select 1 from public.project_help_requests h where h.requirement_id=r.id and h.resolved_at is null)) as help,
   count(*) filter(where w.assigned_to is null) as unassigned
   from visible_posts r join visible_projects p on p.id=r.project_id
   left join public.project_work_packages w on w.id=r.work_id left join public.project_work_deadlines d on d.requirement_id=r.id
   left join public.project_task_states ts on ts.requirement_id=r.id left join chapter_dates c on c.project_id=r.project_id and c.chapter_key=r.chapter_key
   group by r.project_id
 ) select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'manager',p.manager,'deadline',p.deadline,
   'total',coalesce(c.total,0),'done',coalesce(c.done,0),'late',coalesce(c.late,0),'help',coalesce(c.help,0),'unassigned',coalesce(c.unassigned,0)) order by p.name,p.id),'[]')
 from visible_projects p left join counts c on c.project_id=p.id;
$$;

