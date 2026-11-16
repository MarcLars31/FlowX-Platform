-- Local development: explicit engineer permissions and optional work review.
begin;
delete from public.role_permissions rp using public.roles r, public.permissions p
where rp.role_id=r.id and rp.permission_id=p.id and r.organization_id is null and r.slug='engineer'
and p.key in ('project.create','project.update','project.delete','project.settings.update','project.version.create','document.upload','document.delete');
-- Legacy full_user keeps its existing project-manager capabilities. Aliases are
-- consolidated in the UI without silently changing existing memberships.

create schema scipx_review_internal;
revoke all on schema scipx_review_internal from public,anon;
grant usage on schema scipx_review_internal to authenticated;
alter table public.project_management_settings add column review_required boolean not null default false;
alter table public.project_management_settings add column reviewer_id uuid references auth.users(id);
alter table public.project_management_settings add constraint review_requires_reviewer check(not review_required or reviewer_id is not null);
create index on public.project_management_settings(reviewer_id) where reviewer_id is not null;
alter table public.project_task_states add column review_state text not null default 'in_progress'
 check(review_state in ('in_progress','ready','approved','returned','completed'));
alter table public.project_task_states add column submitted_by uuid references auth.users(id);
alter table public.project_task_states add column reviewed_by uuid references auth.users(id);
alter table public.project_task_states add column review_note text;
alter table public.project_task_states add column reviewed_at timestamptz;
update public.project_task_states set review_state='completed' where done;
alter table public.project_task_states add constraint task_review_done check(done=(review_state in ('approved','completed')));
create table public.project_work_reviews (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 requirement_id uuid not null references public.project_requirements(id) on delete cascade,
 state text not null check(state in ('in_progress','ready','approved','returned','completed')),
 actor_id uuid not null references auth.users(id), note text not null default '' check(length(note)<=4000),
 created_at timestamptz not null default now()
);
create index on public.project_work_reviews(requirement_id,created_at,id);
create index on public.project_work_reviews(project_id);
create index on public.project_work_reviews(actor_id);
alter table public.project_work_reviews enable row level security;
revoke all on public.project_work_reviews from public,anon,authenticated;
grant select on public.project_work_reviews to authenticated;
create policy work_review_read on public.project_work_reviews for select to authenticated using(public.pm_can_read(requirement_id));

-- Preserve both project-role columns; reviewer must not be coerced to viewer.
alter table public.project_members drop constraint if exists project_members_project_role_check;
alter table public.project_members add constraint project_members_project_role_check check(project_role in ('owner','editor','reviewer','viewer'));
create or replace function public.sync_project_member_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare member_org uuid; member_user uuid;
begin
 select organization_id,user_id into member_org,member_user from public.organization_members where id=new.organization_member_id and status='active';
 if member_org is null then raise exception 'An active organization member is required.' using errcode='22023'; end if;
 if new.organization_id is null then new.organization_id:=member_org; end if;
 if new.user_id is null then new.user_id:=member_user; end if;
 if new.organization_id<>member_org or new.user_id<>member_user then raise exception 'Project member organization mismatch' using errcode='42501'; end if;
 if new.role is null or (tg_op='UPDATE' and new.project_role is distinct from old.project_role and new.role is not distinct from old.role) then
   new.role:=case new.project_role when 'owner' then 'project_manager' when 'editor' then 'editor' when 'reviewer' then 'reviewer' else 'viewer' end;
 end if;
 new.project_role:=case new.role when 'project_manager' then 'owner' when 'editor' then 'editor' when 'reviewer' then 'reviewer' else 'viewer' end;
 new.updated_at:=now(); return new;
end $$;

create function scipx_review_internal.is_reviewer(pid uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(
 select 1 from public.project_members pm join public.projects p on p.id=pm.project_id
 join public.organization_members m on m.id=pm.organization_member_id and m.user_id=pm.user_id and m.organization_id=p.organization_id
 where pm.project_id=pid and pm.user_id=auth.uid() and pm.role='reviewer' and pm.status='active' and m.status='active' and p.deleted_at is null
 and public.has_permission(p.organization_id,'project.requirement.view') and public.has_permission(p.organization_id,'project.product_suggestion.create'));
$$;
create function scipx_review_internal.can_review(pid uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and public.can_access_project(pid) and exists(select 1 from public.project_management_settings s
 where s.project_id=pid and s.review_required and (public.is_delivery_manager(pid) or (s.reviewer_id=auth.uid() and scipx_review_internal.is_reviewer(pid))));
$$;
create function scipx_review_internal.reviewers(pid uuid) returns table(id uuid,name text)
language sql stable set search_path=pg_catalog as $$
 select m.user_id,coalesce(nullif(pr.display_name,''),pr.email,m.user_id::text)
 from public.projects p join public.organization_members m on m.organization_id=p.organization_id and m.status='active'
 join public.roles r on r.id=m.role_id and (r.organization_id is null or r.organization_id=p.organization_id)
 left join public.profiles pr on pr.id=m.user_id
 where p.id=pid and p.deleted_at is null
 and not exists(select 1 from public.project_members pm where pm.project_id=pid and pm.user_id=m.user_id and (pm.status<>'active' or pm.role<>'reviewer'))
 and exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id where rp.role_id=r.id and perm.key='project.requirement.view')
 and exists(select 1 from public.role_permissions rp join public.permissions perm on perm.id=rp.permission_id where rp.role_id=r.id and perm.key='project.product_suggestion.create');
$$;

-- Function copies below preserve the established scope/tenant checks.
create or replace function public.pm_active_member(pid uuid,uid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id
 join public.project_members pm on pm.project_id=p.id and pm.user_id=m.user_id
 where p.id=pid and p.deleted_at is null and m.user_id=uid and m.status='active' and pm.status='active' and pm.role in ('editor','project_manager'));
$$;

create or replace function public.is_delivery_manager(pid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and public.can_access_project(pid) and exists(select 1 from public.projects p
 join public.organization_members m on m.organization_id=p.organization_id and m.user_id=auth.uid() and m.status='active'
 where p.id=pid and p.deleted_at is null and public.has_permission(p.organization_id,'project.product_suggestion.create') and
 (public.is_organization_admin(p.organization_id) or auth.uid() in (p.owner_user_id,p.owner_id,p.created_by,p.project_manager_id)
 or exists(select 1 from public.project_members pm where pm.project_id=pid and pm.user_id=auth.uid() and pm.status='active' and pm.role='project_manager')));
$$;

create or replace function scipx_assignment_internal.candidates(pid uuid)
returns table(id uuid,name text) language sql stable set search_path=pg_catalog as $$
 select m.user_id,coalesce(nullif(pr.display_name,''),pr.email,m.user_id::text)
 from public.projects p join public.organization_members m on m.organization_id=p.organization_id and m.status='active'
 join public.roles r on r.id=m.role_id and (r.organization_id is null or r.organization_id=p.organization_id)
 join public.role_permissions rp on rp.role_id=r.id join public.permissions permission on permission.id=rp.permission_id
 left join public.profiles pr on pr.id=m.user_id
 where p.id=pid and p.deleted_at is null
 and not exists(select 1 from public.project_members pm where pm.project_id=pid and pm.user_id=m.user_id
   and (pm.status<>'active' or pm.role not in ('editor','project_manager')))
 group by m.user_id,pr.display_name,pr.email
 having bool_or(permission.key in ('project.requirement.view','project.product_suggestion.view'))
    and bool_or(permission.key='project.product_suggestion.create');
$$;

create function scipx_review_internal.can_work(rid uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from public.project_requirements r join public.projects p on p.id=r.project_id
 where r.id=rid and r.deleted_at is null and r.status<>'superseded' and public.can_access_project(p.id) and
 (public.is_delivery_manager(p.id) or (public.has_permission(p.organization_id,'project.product_suggestion.create') and
 case when public.pm_enabled(p.id) then exists(select 1 from public.project_work_packages w where w.id=public.work_package_for_requirement(r.id)
 and ((public.pm_in_department(p.id,w.department_id,auth.uid()) and (w.assigned_to=auth.uid() or public.pm_is_supervisor(p.id,w.department_id)))
 or (w.direct_assignee and w.department_id is null and w.assigned_to=auth.uid() and public.pm_active_member(p.id,auth.uid()))))
 else not exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=auth.uid() and (m.status<>'active' or m.role in ('viewer','reviewer')))
 and (not p.assignments_enforced or exists(select 1 from public.project_work_packages w join public.organization_members m on m.user_id=w.assigned_to and m.organization_id=p.organization_id and m.status='active'
 where w.id=public.work_package_for_requirement(r.id) and w.assigned_to=auth.uid() and public.pm_active_member(p.id,auth.uid()))) end)));
$$;

create or replace function public.pm_can_read(rid uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.project_requirements r where r.id=rid and public.can_access_project(r.project_id)
 and (not public.pm_enabled(r.project_id) or public.has_permission(r.organization_id,'project.requirement.view') or public.has_permission(r.organization_id,'project.product_suggestion.view'))
 and (not public.pm_enabled(r.project_id) or public.is_delivery_manager(r.project_id) or scipx_review_internal.is_reviewer(r.project_id) or exists(select 1 from public.project_work_packages w
 where w.id=public.work_package_for_requirement(r.id) and (
 public.pm_in_department(r.project_id,w.department_id,auth.uid())
 or (w.direct_assignee and w.department_id is null and w.assigned_to=auth.uid() and public.pm_active_member(r.project_id,auth.uid()))))));
$$;

create or replace function public.pm_full_project_read(pid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select not public.pm_enabled(pid) or public.is_delivery_manager(pid) or scipx_review_internal.is_reviewer(pid);
$$;

create or replace function scipx_assignment_internal.full_read_projects()
returns setof uuid language sql stable security definer set search_path=pg_catalog as $$
 select p.id from public.projects p
 where (select auth.uid()) is not null and p.deleted_at is null
 and public.can_access_project(p.id)
 and (not public.pm_enabled(p.id) or (
   (public.is_delivery_manager(p.id) or scipx_review_internal.is_reviewer(p.id))
   and (public.has_permission(p.organization_id,'project.requirement.view')
     or public.has_permission(p.organization_id,'project.product_suggestion.view'))
 ));
$$;

create function scipx_review_internal.configure_base(pid uuid,payload jsonb,expected_revision bigint) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; current_revision bigint; d jsonb; did uuid; lead uuid; v_deadline date;
begin
 select * into p from public.projects where id=pid for update;
 if not public.is_delivery_manager(pid) then raise exception 'Manager access required' using errcode='42501'; end if;
 select revision into current_revision from public.project_management_settings where project_id=pid;
 if coalesce(current_revision,-1) is distinct from expected_revision then raise exception 'Settings changed; reload' using errcode='40001'; end if;
 if jsonb_typeof(payload->'departments') is distinct from 'array' or jsonb_array_length(payload->'departments') not between 0 and 100 then raise exception 'Choose project departments' using errcode='22023'; end if;
 perform public.pm_capture_deadlines(pid);
 v_deadline:=nullif(payload->>'deadline','')::date;
 insert into public.project_management_settings(project_id,deadline,allow_later_post_deadline,multiple_help_requests,assignment_email)
 values(pid,v_deadline,true,true,'batch')
 on conflict(project_id) do update set deadline=excluded.deadline,allow_later_post_deadline=excluded.allow_later_post_deadline,multiple_help_requests=excluded.multiple_help_requests,assignment_email=excluded.assignment_email,revision=project_management_settings.revision+1;
 for d in select value from jsonb_array_elements(payload->'departments') loop
 did:=(d->>'department_id')::uuid; lead:=(d->>'supervisor_id')::uuid;
 if not exists(select 1 from public.teams t join public.team_members tm on tm.team_id=t.id join public.organization_members m on m.id=tm.organization_member_id
 where t.id=did and t.organization_id=p.organization_id and t.status='active' and m.organization_id=p.organization_id and m.user_id=lead and m.status='active') then raise exception 'Active department supervisor required' using errcode='22023'; end if;
 insert into public.project_work_departments values(pid,did,lead) on conflict(project_id,department_id) do update set supervisor_id=excluded.supervisor_id;
 insert into public.project_members(project_id,organization_member_id,project_role,organization_id,user_id,role,status)
 select pid,m.id,'editor',p.organization_id,m.user_id,'editor','active' from public.team_members tm join public.organization_members m on m.id=tm.organization_member_id where tm.team_id=did and m.organization_id=p.organization_id and m.status='active'
 on conflict(project_id,user_id) do nothing;
 end loop;
 -- Department removal is explicit and cannot strand assigned posts.
 if exists(select 1 from public.project_work_packages w where w.project_id=pid and w.department_id is not null and not exists(select 1 from jsonb_array_elements(payload->'departments') e where (e->>'department_id')::uuid=w.department_id)) then raise exception 'Reassign department work before removal' using errcode='22023'; end if;
 delete from public.project_work_departments where project_id=pid and department_id not in(select (e->>'department_id')::uuid from jsonb_array_elements(payload->'departments') e);
 update public.projects set assignments_enforced=true where id=pid;
 perform public.write_audit_log(p.organization_id,'project.management_configured','project',pid,null,null,payload);
end $$;

create function scipx_review_internal.thread_base(pid uuid,rid uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not public.pm_enabled(pid) or not exists(select 1 from public.project_requirements where id=rid and project_id=pid) or not public.pm_can_read(rid) then raise exception 'Post access denied' using errcode='42501'; end if;
 return jsonb_build_object('help',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at,h.id) from public.project_help_requests h where requirement_id=rid),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from public.project_work_messages m where requirement_id=rid),'[]'::jsonb));
end $$;

create or replace function public.guard_requirement_assignment() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare rid uuid; pid uuid;
begin
 if auth.uid() is null then return coalesce(new,old); end if;
 if tg_table_name='project_requirements' then
   pid:=coalesce(new.project_id,old.project_id); rid:=coalesce(old.id,new.id);
   if tg_op='INSERT' then
     if exists(select 1 from public.projects where id=pid and assignments_enforced) and not public.is_delivery_manager(pid) then raise exception 'Only the project manager can add posts' using errcode='42501'; end if;
     return new;
   end if;
 else pid:=coalesce(new.project_id,old.project_id); rid:=coalesce(old.requirement_id,new.requirement_id); end if;
 -- An FK cascade runs after the parent is gone. Its project deletion was already authorized.
 if tg_op='DELETE' and pg_trigger_depth()>1
 and not exists(select 1 from public.projects where id=pid)
 and public.has_organization_role(old.organization_id,'organization_owner')
 and public.has_permission(old.organization_id,'project.permanent_delete') then return old; end if;
 perform 1 from public.projects where id=pid for update;
 if exists(select 1 from public.project_task_states ts join public.project_management_settings s on s.project_id=ts.project_id
   where ts.requirement_id=rid and s.review_required and ts.review_state in ('ready','approved')) then
   raise exception 'Reopen the post before changing reviewed content' using errcode='42501'; end if;
 if not public.is_delivery_manager(pid) and (rid is null or not public.can_edit_project_requirement(rid)) then raise exception 'This post is assigned to another person' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.project_id is distinct from old.project_id or new.organization_id is distinct from old.organization_id) then raise exception 'Project scope is immutable' using errcode='42501'; end if;
 if tg_op='UPDATE' and tg_table_name<>'project_requirements' then
   if new.requirement_id is distinct from old.requirement_id and not public.can_edit_project_requirement(new.requirement_id) then raise exception 'Post scope denied' using errcode='42501'; end if;
 end if;
 return coalesce(new,old);
end $$;

create or replace function scipx_assignment_internal.read(pid uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare p public.projects; result jsonb; manager boolean; assignments jsonb; people jsonb; posts jsonb;
 enabled boolean; active_member boolean; can_create boolean; reviewer boolean; review_allowed boolean;
begin
 select * into p from public.projects where id=pid and deleted_at is null;
 if not found or not public.can_access_project(pid) or not (public.has_permission(p.organization_id,'project.requirement.view') or public.has_permission(p.organization_id,'project.product_suggestion.view'))
 then raise exception 'Project access denied' using errcode='42501'; end if;
 manager:=public.is_delivery_manager(pid); reviewer:=scipx_review_internal.is_reviewer(pid); review_allowed:=scipx_review_internal.can_review(pid);
 enabled:=public.pm_enabled(pid);active_member:=public.pm_active_member(pid,auth.uid());
 can_create:=public.has_permission(p.organization_id,'project.product_suggestion.create');
 result:=jsonb_build_object('projectId',pid,'name',p.name,'userId',auth.uid(),'manager',manager,'reviewer',reviewer,'canReview',review_allowed,
   'settings',(select to_jsonb(s) from public.project_management_settings s where s.project_id=pid),
   'departments',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'supervisorId',d.supervisor_id)) from public.teams t left join public.project_work_departments d on d.department_id=t.id and d.project_id=pid where t.organization_id=p.organization_id and t.status='active' and (manager or (reviewer and exists(select 1 from public.project_work_departments visible_d where visible_d.project_id=pid and visible_d.department_id=t.id)) or public.pm_in_department(pid,t.id,auth.uid()))),'[]'),
   'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'departmentId',tm.team_id,'name',coalesce(pr.display_name,pr.email,m.user_id::text))) from public.team_members tm join public.teams t on t.id=tm.team_id and t.organization_id=p.organization_id and t.status='active' join public.organization_members m on m.id=tm.organization_member_id and m.organization_id=p.organization_id and m.status='active' left join public.profiles pr on pr.id=m.user_id where manager or (reviewer and exists(select 1 from public.project_work_departments visible_d where visible_d.project_id=pid and visible_d.department_id=t.id)) or public.pm_in_department(pid,t.id,auth.uid())),'[]'));
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
    'reviewState',coalesce(ts.review_state,'in_progress'),'submittedBy',ts.submitted_by,'reviewNote',ts.review_note,
   'canReview',review_allowed and ts.review_state='ready' and ts.submitted_by is distinct from auth.uid() and w.assigned_to is distinct from auth.uid(),
   'contentLocked',coalesce(s.review_required and ts.review_state in ('ready','approved'),false),
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
 where manager or reviewer or not enabled or w.readable;
 select coalesce(jsonb_agg(to_jsonb(w) || case when w.scope_type='pdf_chapter'
   then jsonb_build_object('chapter_key',public.requirement_chapter_key(a)) else '{}'::jsonb end order by w.id),'[]')
 into assignments from public.project_work_packages w
 left join public.project_requirements a on a.id::text=w.scope_value and a.project_id=pid
 where w.project_id=pid and (manager or reviewer or public.pm_in_department(pid,w.department_id,auth.uid())
   or (w.direct_assignee and w.department_id is null and w.assigned_to=auth.uid() and public.pm_active_member(pid,auth.uid())));
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name,c.id),'[]') into people
 from scipx_assignment_internal.candidates(pid) c where manager;
 result:=result || jsonb_build_object('posts',posts,'assignments',assignments,'assignees',people,
   'reviewerCandidates',case when manager then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name) from scipx_review_internal.reviewers(pid) c),'[]') else '[]'::jsonb end,
   'reviewerName',(select coalesce(pr.display_name,pr.email) from public.profiles pr join public.project_management_settings s on s.reviewer_id=pr.id where s.project_id=pid),
   'assignmentVersion',case when manager then scipx_assignment_internal.version(pid) else null end);
 -- Preserve department names used by the follow-up view and add direct assignees.
 return jsonb_set(result,'{members}',coalesce(result->'members','[]') || coalesce((
 select jsonb_agg(jsonb_build_object('id',pr.id,'departmentId',null,'name',coalesce(nullif(pr.display_name,''),pr.email,pr.id::text)))
 from public.profiles pr where exists(select 1 from jsonb_array_elements(assignments) a where a->>'assigned_to'=pr.id::text)
 and not exists(select 1 from jsonb_array_elements(result->'members') m where m->>'id'=pr.id::text)),'[]'));
end $$;

-- The editor check also protects legacy APIs. Reopen a submitted or approved
-- post before modifying its contents, even as a manager.
create or replace function public.can_edit_project_requirement(rid uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select scipx_review_internal.can_work(rid) and not exists(select 1 from public.project_task_states t
 join public.project_management_settings s on s.project_id=t.project_id
 where t.requirement_id=rid and s.review_required and t.review_state in ('ready','approved'));
$$;

create function scipx_review_internal.configure(pid uuid,payload jsonb,expected_revision bigint) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare old_settings public.project_management_settings; required boolean; reviewer uuid; p public.projects; member uuid;
begin
 select * into p from public.projects where id=pid and deleted_at is null for update;
 if not found or auth.uid() is null or not public.is_delivery_manager(pid) then raise exception 'Manager access required' using errcode='42501'; end if;
 select * into old_settings from public.project_management_settings where project_id=pid;
 required:=coalesce(old_settings.review_required,false); reviewer:=old_settings.reviewer_id;
 if payload ? 'review_required' then
   if jsonb_typeof(payload->'review_required') is distinct from 'boolean' then raise exception 'Invalid review setting' using errcode='22023'; end if;
   required:=(payload->>'review_required')::boolean;
   reviewer:=nullif(payload->>'reviewer_id','')::uuid;
 end if;
 if required and (reviewer is null or not exists(select 1 from scipx_review_internal.reviewers(pid) c where c.id=reviewer)) then
   raise exception 'Choose an active reviewer without a conflicting project role' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(payload->'departments') d where (required and (d->>'supervisor_id')::uuid=reviewer) or not exists(
   select 1 from scipx_assignment_internal.candidates(pid) c where c.id=(d->>'supervisor_id')::uuid)) then
   raise exception 'Choose an active editable department supervisor' using errcode='22023';
 end if;
 if not required and exists(select 1 from public.project_task_states t where t.project_id=pid and t.review_state='ready') then
   raise exception 'Resolve or reopen pending reviews before disabling review' using errcode='22023';
 end if;
 if required then
   select id into member from public.organization_members where organization_id=p.organization_id and user_id=reviewer and status='active';
   insert into public.project_members(project_id,organization_member_id,project_role,organization_id,user_id,role,status)
   values(pid,member,'reviewer',p.organization_id,reviewer,'reviewer','active') on conflict(project_id,user_id) do nothing;
 end if;
 -- Enroll the reviewer before department auto-membership, which deliberately
 -- preserves existing roles. The whole call rolls back on a stale revision.
 perform scipx_review_internal.configure_base(pid,payload,expected_revision);
 update public.project_management_settings set review_required=required,reviewer_id=case when required then reviewer else null end where project_id=pid;
 if required and not coalesce(old_settings.review_required,false) then
   with changed as (update public.project_task_states set done=false,review_state='ready',submitted_by=updated_by,
     reviewed_by=null,review_note=null,reviewed_at=null,revision=revision+1,updated_at=now()
     where project_id=pid and done returning *)
   insert into public.project_work_reviews(project_id,requirement_id,state,actor_id,note)
   select pid,requirement_id,'ready',auth.uid(),'Granskning aktivert for prosjektet' from changed;
 end if;
 perform public.write_audit_log(p.organization_id,'project.review_configured','project',pid,to_jsonb(old_settings),
   jsonb_build_object('review_required',required,'reviewer_id',reviewer),'{}');
end $$;
create or replace function public.save_project_management(pid uuid,payload jsonb,expected_revision bigint) returns void
language sql security invoker set search_path=pg_catalog as $$ select scipx_review_internal.configure(pid,payload,expected_revision); $$;

create function scipx_review_internal.transition(pid uuid,rid uuid,expected_revision bigint,operation text,note text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare task public.project_task_states; org uuid; required boolean; next_state text; actor uuid:=auth.uid(); submitted uuid; reviewer uuid; assignee uuid;
begin
 select organization_id into org from public.projects where id=pid and deleted_at is null for update;
 if org is null or actor is null or not public.pm_enabled(pid) or not public.can_access_project(pid)
 or not exists(select 1 from public.project_requirements where id=rid and project_id=pid and deleted_at is null and status not in ('superseded','rejected'))
 then raise exception 'Post access denied' using errcode='42501'; end if;
 select * into task from public.project_task_states where requirement_id=rid;
 if coalesce(task.revision,-1) is distinct from expected_revision then raise exception 'Task changed; reload' using errcode='40001'; end if;
 select review_required,reviewer_id into required,reviewer from public.project_management_settings where project_id=pid;
 select assigned_to into assignee from public.project_work_packages where id=public.work_package_for_requirement(rid);
 note:=btrim(coalesce(note,''));
 if length(note)>4000 then raise exception 'Review comment is too long' using errcode='22023'; end if;
 if operation in ('approve','return') then
   if not scipx_review_internal.can_review(pid) then raise exception 'Reviewer access required' using errcode='42501'; end if;
   if task.review_state is distinct from 'ready' then raise exception 'Post must be ready for review' using errcode='22023'; end if;
   if task.submitted_by=actor or assignee=actor then raise exception 'You cannot review your own submission' using errcode='42501'; end if;
   if operation='return' and length(note)=0 then raise exception 'Describe what needs to change' using errcode='22023'; end if;
   next_state:=case operation when 'approve' then 'approved' else 'returned' end; submitted:=task.submitted_by;
 elsif operation in ('submit','reopen') then
   if not scipx_review_internal.can_work(rid) then raise exception 'Post edit denied' using errcode='42501'; end if;
   if operation='submit' and required and task.review_state in ('ready','approved') then raise exception 'Reopen the post before submitting' using errcode='22023'; end if;
   if operation='submit' and required and not exists(select 1 from scipx_review_internal.reviewers(pid) c where c.id=reviewer) then raise exception 'Choose an active reviewer' using errcode='22023'; end if;
   next_state:=case when operation='reopen' then 'in_progress' when required then 'ready' else 'completed' end;
   submitted:=case when operation='submit' then actor else null end;
 else raise exception 'Invalid review action' using errcode='22023'; end if;
 if operation in ('submit','approve') and exists(select 1 from public.project_help_requests where requirement_id=rid and resolved_at is null) then
   raise exception 'Resolve help before completing the post' using errcode='22023'; end if;
 insert into public.project_task_states(requirement_id,project_id,done,updated_by,review_state,submitted_by,reviewed_by,review_note,reviewed_at)
 values(rid,pid,next_state in ('approved','completed'),actor,next_state,submitted,case when operation in ('approve','return') then actor end,
   nullif(note,''),case when operation in ('approve','return') then now() end)
 on conflict(requirement_id) do update set done=excluded.done,review_state=excluded.review_state,submitted_by=excluded.submitted_by,
 reviewed_by=excluded.reviewed_by,review_note=excluded.review_note,reviewed_at=excluded.reviewed_at,revision=project_task_states.revision+1,updated_by=actor,updated_at=now();
 insert into public.project_work_reviews(project_id,requirement_id,state,actor_id,note) values(pid,rid,next_state,actor,note);
 perform public.write_audit_log(org,'project.work_review','project_requirement',rid,to_jsonb(task),jsonb_build_object('state',next_state,'note',note),'{}');
 -- In-app review notifications use the existing safe project/post links.
 insert into public.project_work_notifications(project_id,requirement_id,recipient_id,kind,title)
 select pid,rid,recipient,'review',case next_state when 'ready' then 'En post er klar til granskning' when 'approved' then 'Posten er godkjent' when 'returned' then 'Posten er sendt tilbake' else 'Posten er åpnet igjen' end
 from (select case when next_state='ready' then reviewer else assignee end recipient) recipients
 where recipient is not null and recipient<>actor and exists(select 1 from public.project_members pm join public.organization_members m on m.id=pm.organization_member_id where pm.project_id=pid and pm.user_id=recipient and pm.status='active' and m.status='active');
end $$;
alter table public.project_work_notifications drop constraint project_work_notifications_kind_check;
alter table public.project_work_notifications add constraint project_work_notifications_kind_check check(kind in ('assignment','help','reply','resolved','deadline','review'));
create function public.review_project_work(pid uuid,rid uuid,expected_revision bigint,operation text,note text default '') returns void
language sql security invoker set search_path=pg_catalog as $$ select scipx_review_internal.transition(pid,rid,expected_revision,operation,note); $$;
create or replace function public.update_project_task(pid uuid,rid uuid,expected_revision bigint,mark_done boolean) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if mark_done is null then raise exception 'Invalid status' using errcode='22023'; end if;
 perform scipx_review_internal.transition(pid,rid,expected_revision,case when mark_done then 'submit' else 'reopen' end,'');
end $$;

create function scipx_review_internal.read_thread(pid uuid,rid uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 result:=scipx_review_internal.thread_base(pid,rid);
 return result || jsonb_build_object('reviews',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'state',e.state,'actor',coalesce(pr.display_name,pr.email,'Prosjektdeltaker'),'note',e.note,'created_at',e.created_at) order by e.created_at,e.id)
 from public.project_work_reviews e left join public.profiles pr on pr.id=e.actor_id where e.project_id=pid and e.requirement_id=rid),'[]'));
end $$;
create or replace function public.read_project_work_thread(pid uuid,rid uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$ select scipx_review_internal.read_thread(pid,rid); $$;

revoke all on all functions in schema scipx_review_internal from public,anon,authenticated;
grant execute on function scipx_review_internal.is_reviewer(uuid),scipx_review_internal.can_review(uuid),scipx_review_internal.configure(uuid,jsonb,bigint),scipx_review_internal.transition(uuid,uuid,bigint,text,text),scipx_review_internal.read_thread(uuid,uuid) to authenticated;
revoke all on function public.review_project_work(uuid,uuid,bigint,text,text) from public,anon;
grant execute on function public.review_project_work(uuid,uuid,bigint,text,text) to authenticated;
commit;
