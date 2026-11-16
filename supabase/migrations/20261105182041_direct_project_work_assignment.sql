-- Direct person assignment reuses the existing scope, hierarchy and deadline model.
-- Existing department assignments remain valid. No project is enrolled by migration.
alter table public.project_work_packages add column direct_assignee boolean not null default false;

create schema if not exists scipx_assignment_internal;
revoke all on schema scipx_assignment_internal from public,anon;
grant usage on schema scipx_assignment_internal to authenticated;

create table scipx_assignment_internal.actions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 before_packages jsonb not null, before_deadlines jsonb not null,
 before_settings jsonb, before_enforced boolean not null,
 added_members uuid[] not null default '{}',
 after_version text not null, created_at timestamptz not null default now(),
 undone_at timestamptz
);
alter table scipx_assignment_internal.actions enable row level security;
revoke all on scipx_assignment_internal.actions from public,anon,authenticated;
create index on scipx_assignment_internal.actions(project_id,actor_id,created_at desc);
create index on scipx_assignment_internal.actions(actor_id);

-- Every package writer, including older APIs, serializes with the project lock.
create function scipx_assignment_internal.lock_package_project() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from public.projects where id=coalesce(new.project_id,old.project_id) for update;
 if tg_op<>'DELETE' and new.department_id is not null then new.direct_assignee:=false; end if;
 return coalesce(new,old);
end $$;
revoke all on function scipx_assignment_internal.lock_package_project() from public,anon,authenticated;
create trigger direct_assignment_project_lock before insert or update or delete on public.project_work_packages
for each row execute function scipx_assignment_internal.lock_package_project();

create function scipx_assignment_internal.version(pid uuid) returns text
language sql stable set search_path=pg_catalog as $$
 select md5(jsonb_build_object(
 'packages',coalesce((select jsonb_agg(to_jsonb(w) order by w.id) from public.project_work_packages w where w.project_id=pid),'[]'),
 'deadlines',coalesce((select jsonb_agg(to_jsonb(d) order by d.requirement_id) from public.project_work_deadlines d where d.project_id=pid),'[]'),
 'settings',(select to_jsonb(s) from public.project_management_settings s where s.project_id=pid),
 'enforced',(select assignments_enforced from public.projects where id=pid),
 'members',coalesce((select jsonb_agg(jsonb_build_array(m.id,m.user_id,m.role,m.status,m.organization_member_id,m.project_role) order by m.id)
 from public.project_members m where m.project_id=pid),'[]'))::text);
$$;
revoke all on function scipx_assignment_internal.version(uuid) from public,anon,authenticated;

create function scipx_assignment_internal.candidates(pid uuid)
returns table(id uuid,name text) language sql stable set search_path=pg_catalog as $$
 select m.user_id,coalesce(nullif(pr.display_name,''),pr.email,m.user_id::text)
 from public.projects p join public.organization_members m on m.organization_id=p.organization_id and m.status='active'
 join public.roles r on r.id=m.role_id and (r.organization_id is null or r.organization_id=p.organization_id)
 join public.role_permissions rp on rp.role_id=r.id join public.permissions permission on permission.id=rp.permission_id
 left join public.profiles pr on pr.id=m.user_id
 where p.id=pid and p.deleted_at is null
 and not exists(select 1 from public.project_members pm where pm.project_id=pid and pm.user_id=m.user_id
   and (pm.status<>'active' or pm.role not in ('editor','reviewer','project_manager')))
 group by m.user_id,pr.display_name,pr.email
 having bool_or(permission.key in ('project.requirement.view','project.product_suggestion.view'))
    and bool_or(permission.key='project.product_suggestion.create');
$$;
revoke all on function scipx_assignment_internal.candidates(uuid) from public,anon,authenticated;

-- Resolve each uncaptured row once. Only the guarded manager mutation calls this.
create function scipx_assignment_internal.capture_deadlines(pid uuid) returns void
language sql set search_path=pg_catalog as $$
 with pending as materialized (
   select r.*,public.work_package_for_requirement(r.id) as work_id,public.requirement_chapter_key(r) as chapter_key
   from public.project_requirements r left join public.project_work_deadlines d on d.requirement_id=r.id
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
revoke all on function scipx_assignment_internal.capture_deadlines(uuid) from public,anon,authenticated;

-- The three existing permission functions below keep their existing ACLs.
-- Direct assignments require an active project member and match that exact user.
create or replace function public.pm_can_read(rid uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.project_requirements r where r.id=rid and public.can_access_project(r.project_id)
 and (not public.pm_enabled(r.project_id) or public.has_permission(r.organization_id,'project.requirement.view') or public.has_permission(r.organization_id,'project.product_suggestion.view'))
 and (not public.pm_enabled(r.project_id) or public.is_delivery_manager(r.project_id) or exists(select 1 from public.project_work_packages w
 where w.id=public.work_package_for_requirement(r.id) and (
 public.pm_in_department(r.project_id,w.department_id,auth.uid())
 or (w.direct_assignee and w.department_id is null and w.assigned_to=auth.uid() and public.pm_active_member(r.project_id,auth.uid()))))));
$$;
create or replace function public.can_edit_project_requirement(rid uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from public.project_requirements r join public.projects p on p.id=r.project_id
 where r.id=rid and r.deleted_at is null and r.status<>'superseded' and public.can_access_project(p.id) and
 (public.is_delivery_manager(p.id) or (public.has_permission(p.organization_id,'project.product_suggestion.create') and
 case when public.pm_enabled(p.id) then exists(select 1 from public.project_work_packages w where w.id=public.work_package_for_requirement(r.id)
 and ((public.pm_in_department(p.id,w.department_id,auth.uid()) and (w.assigned_to=auth.uid() or public.pm_is_supervisor(p.id,w.department_id)))
 or (w.direct_assignee and w.department_id is null and w.assigned_to=auth.uid() and public.pm_active_member(p.id,auth.uid()))))
 else not exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=auth.uid() and (m.status<>'active' or m.role='viewer'))
 and (not p.assignments_enforced or exists(select 1 from public.project_work_packages w join public.organization_members m on m.user_id=w.assigned_to and m.organization_id=p.organization_id and m.status='active'
 where w.id=public.work_package_for_requirement(r.id) and w.assigned_to=auth.uid() and public.pm_active_member(p.id,auth.uid()))) end)));
$$;
alter policy pm_package_scope on public.project_work_packages using(
 public.pm_full_project_read(project_id) or public.pm_in_department(project_id,department_id,auth.uid())
 or (direct_assignee and department_id is null and assigned_to=auth.uid() and public.pm_active_member(project_id,auth.uid()))
);

create function scipx_assignment_internal.assign(
 pid uuid,targets jsonb,assignee uuid,assignment_mode text,replace_overrides boolean,expected_version text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; target jsonb; r public.project_requirements; old_w public.project_work_packages;
 kind text; scope text; normalized jsonb:='[]'; previous_packages jsonb; previous_deadlines jsonb;
 previous_settings jsonb; added uuid[]:='{}'; member_id uuid; action_id uuid; version_after text;
begin
 select * into p from public.projects where id=pid and deleted_at is null for update;
 if not found or auth.uid() is null or not public.is_delivery_manager(pid)
 or not (public.has_permission(p.organization_id,'project.requirement.view') or public.has_permission(p.organization_id,'project.product_suggestion.view'))
 then raise exception 'Manager access required' using errcode='42501'; end if;
 if expected_version is distinct from scipx_assignment_internal.version(pid) then raise exception 'Assignments changed; reload' using errcode='40001'; end if;
 if jsonb_typeof(targets) is distinct from 'array' or jsonb_array_length(targets) not between 1 and 500
 or assignment_mode is null or assignment_mode not in ('explicit','inherit','unassigned') or replace_overrides is null
 or (assignment_mode='explicit' and assignee is null) or (assignment_mode<>'explicit' and assignee is not null)
 then raise exception 'Invalid assignment' using errcode='22023'; end if;
 if assignee is not null and not exists(select 1 from scipx_assignment_internal.candidates(pid) c where c.id=assignee)
 then raise exception 'Active editable project member required' using errcode='22023'; end if;
 -- Canonicalize and validate the whole batch before making any changes.
 for target in select value from jsonb_array_elements(targets) loop
   kind:=target->>'scope_type'; scope:=target->>'scope_value';
   if kind is null or kind not in ('post','main_post','pdf_chapter') then raise exception 'Invalid scope' using errcode='22023'; end if;
   select * into r from public.project_requirements where id=scope::uuid and project_id=pid and deleted_at is null and status not in ('superseded','rejected');
   if not found then raise exception 'Post does not belong to project' using errcode='22023'; end if;
   if kind='main_post' and (public.post_needs_hierarchy_review(r.id) or public.post_is_source_chapter(r)) then raise exception 'Verified main post required' using errcode='22023'; end if;
   if kind='pdf_chapter' then
     if coalesce(btrim(r.value_json#>>'{sourceChapter,title}'),'')='' then raise exception 'Verified chapter required' using errcode='22023'; end if;
     select w.scope_value into scope from public.project_work_packages w join public.project_requirements a on a.id::text=w.scope_value and a.project_id=pid
     where w.project_id=pid and w.scope_type='pdf_chapter' and a.deleted_at is null and a.status not in ('superseded','rejected')
       and public.requirement_chapter_key(a)=public.requirement_chapter_key(r) order by w.id limit 1;
     if scope is null then select min(a.id::text) into scope from public.project_requirements a where a.project_id=pid and a.deleted_at is null
       and a.status not in ('superseded','rejected') and public.requirement_chapter_key(a)=public.requirement_chapter_key(r); end if;
   end if;
   if not normalized @> jsonb_build_array(jsonb_build_object('scope_type',kind,'scope_value',scope))
   then normalized:=normalized||jsonb_build_array(jsonb_build_object('scope_type',kind,'scope_value',scope)); end if;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(w) order by w.id),'[]') into previous_packages from public.project_work_packages w where w.project_id=pid;
 select coalesce(jsonb_agg(to_jsonb(d) order by d.requirement_id),'[]') into previous_deadlines from public.project_work_deadlines d where d.project_id=pid;
 select to_jsonb(s) into previous_settings from public.project_management_settings s where s.project_id=pid;
 if assignee is not null then
   insert into public.project_members(project_id,organization_member_id,project_role,organization_id,user_id,role,status)
   select pid,m.id,'editor',p.organization_id,assignee,'editor','active' from public.organization_members m
   where m.organization_id=p.organization_id and m.user_id=assignee and m.status='active'
   on conflict(project_id,user_id) do nothing returning id into member_id;
   if member_id is not null then added:=array_append(added,member_id); end if;
 end if;
 if previous_settings is null then
   -- Preserve already assigned legacy scopes when the project first opts in.
   update public.project_work_packages set direct_assignee=true,revision=revision+1,updated_at=now()
   where project_id=pid and department_id is null and not direct_assignee;
   insert into public.project_management_settings(project_id) values(pid);
 end if;
 update public.projects set assignments_enforced=true where id=pid and not assignments_enforced;
 perform scipx_assignment_internal.capture_deadlines(pid);
 -- Clear narrower overrides only when the manager explicitly selected that option.
 if replace_overrides then
   for target in select value from jsonb_array_elements(normalized) where value->>'scope_type'<>'post' loop
     select * into r from public.project_requirements where id=(target->>'scope_value')::uuid and project_id=pid;
     update public.project_work_packages w set assigned_to=null,department_id=null,assignment_mode='inherit',
       direct_assignee=true,revision=w.revision+1,updated_at=now()
     from public.project_requirements a where w.project_id=pid and a.project_id=pid and a.id::text=w.scope_value
       and w.assignment_mode<>'inherit' and (
       (target->>'scope_type'='pdf_chapter' and w.scope_type in ('post','main_post') and public.requirement_chapter_key(a)=public.requirement_chapter_key(r))
       or (target->>'scope_type'='main_post' and ((w.scope_type='post' and a.id=r.id) or (w.scope_type in ('post','main_post') and r.id=any(public.post_ancestor_ids(a.id))))));
   end loop;
 end if;
 for target in select value from jsonb_array_elements(normalized) loop
   kind:=target->>'scope_type'; scope:=target->>'scope_value';
   select * into old_w from public.project_work_packages where project_id=pid and scope_type=kind and scope_value=scope;
   insert into public.project_work_packages(project_id,organization_id,scope_type,scope_value,assigned_to,department_id,due_date,assignment_mode,direct_assignee)
   values(pid,p.organization_id,kind,scope,assignee,null,old_w.due_date,assignment_mode,true)
   on conflict(project_id,scope_type,scope_value) do update set assigned_to=excluded.assigned_to,department_id=null,
     assignment_mode=excluded.assignment_mode,direct_assignee=true,revision=project_work_packages.revision+1,updated_at=now();
 end loop;
 perform scipx_assignment_internal.capture_deadlines(pid);
 version_after:=scipx_assignment_internal.version(pid);
 insert into scipx_assignment_internal.actions(project_id,actor_id,before_packages,before_deadlines,before_settings,before_enforced,added_members,after_version)
 values(pid,auth.uid(),previous_packages,previous_deadlines,previous_settings,p.assignments_enforced,added,version_after) returning id into action_id;
 perform public.write_audit_log(p.organization_id,'project.direct_assignment','project',pid,null,null,
   jsonb_build_object('action_id',action_id,'targets',normalized,'assignee',assignee,'mode',assignment_mode,'replace_overrides',replace_overrides));
 if assignee is not null then perform public.pm_notify(pid,null,array[assignee],'assignment','Du har fått nye tildelinger',jsonb_array_length(normalized)); end if;
 return jsonb_build_object('saved',true,'undoToken',action_id,'assignmentVersion',version_after);
end $$;
revoke all on function scipx_assignment_internal.assign(uuid,jsonb,uuid,text,boolean,text) from public,anon;
grant execute on function scipx_assignment_internal.assign(uuid,jsonb,uuid,text,boolean,text) to authenticated;

create function scipx_assignment_internal.undo(pid uuid,action_id uuid,expected_version text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; a scipx_assignment_internal.actions; prior public.project_work_packages; recipient uuid; recipients uuid[];
begin
 select * into p from public.projects where id=pid and deleted_at is null for update;
 if not found or auth.uid() is null or not public.is_delivery_manager(pid) then raise exception 'Manager access required' using errcode='42501'; end if;
 select * into a from scipx_assignment_internal.actions where id=action_id and project_id=pid and actor_id=auth.uid() and undone_at is null for update;
 if not found then raise exception 'Undo is no longer available' using errcode='40001'; end if;
 if expected_version is distinct from a.after_version or a.after_version is distinct from scipx_assignment_internal.version(pid)
 then raise exception 'Assignments changed; reload' using errcode='40001'; end if;
 select array_agg(distinct assigned_to) into recipients from public.project_work_packages where project_id=pid and assigned_to is not null;
 -- Preserve monotonic revisions and new-row tombstones against stale older clients.
 update public.project_work_packages w set assigned_to=null,department_id=null,assignment_mode='inherit',direct_assignee=true,
   revision=w.revision+1,updated_at=now()
 where w.project_id=pid and not exists(select 1 from jsonb_array_elements(a.before_packages) old where old->>'id'=w.id::text);
 for prior in select * from jsonb_populate_recordset(null::public.project_work_packages,a.before_packages) loop
   update public.project_work_packages w set assigned_to=prior.assigned_to,department_id=prior.department_id,
     assignment_mode=prior.assignment_mode,direct_assignee=prior.direct_assignee,due_date=prior.due_date,
     revision=w.revision+1,updated_at=now()
   where w.id=prior.id and w.project_id=pid and
     (w.assigned_to,w.department_id,w.assignment_mode,w.direct_assignee,w.due_date) is distinct from
     (prior.assigned_to,prior.department_id,prior.assignment_mode,prior.direct_assignee,prior.due_date);
 end loop;
 -- No deadline/settings/member writes can have intervened: they are in the version token.
 delete from public.project_work_deadlines d where d.project_id=pid
 and not exists(select 1 from jsonb_array_elements(a.before_deadlines) old where old->>'requirement_id'=d.requirement_id::text);
 update public.project_work_deadlines d set inherited_date=old.inherited_date,captured=old.captured,revision=d.revision+1
 from jsonb_populate_recordset(null::public.project_work_deadlines,a.before_deadlines) old
 where d.project_id=pid and d.requirement_id=old.requirement_id and (d.inherited_date,d.captured) is distinct from (old.inherited_date,old.captured);
 delete from public.project_members where project_id=pid and id=any(a.added_members);
 if a.before_settings is null then delete from public.project_management_settings where project_id=pid; end if;
 update public.projects set assignments_enforced=a.before_enforced where id=pid and assignments_enforced is distinct from a.before_enforced;
 update scipx_assignment_internal.actions set undone_at=now() where id=a.id;
 perform public.write_audit_log(p.organization_id,'project.direct_assignment_undone','project',pid,null,null,jsonb_build_object('action_id',a.id));
 for recipient in select distinct unnest(recipients) loop
   perform public.pm_notify(pid,null,array[recipient],'assignment','En tildeling er angret');
 end loop;
 return jsonb_build_object('saved',true,'assignmentVersion',scipx_assignment_internal.version(pid));
end $$;
revoke all on function scipx_assignment_internal.undo(uuid,uuid,text) from public,anon;
grant execute on function scipx_assignment_internal.undo(uuid,uuid,text) to authenticated;

create function public.assign_project_work_direct(pid uuid,targets jsonb,assignee uuid,assignment_mode text,replace_overrides boolean,expected_version text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select scipx_assignment_internal.assign(pid,targets,assignee,assignment_mode,replace_overrides,expected_version);
$$;
create function public.undo_project_work_assignment(pid uuid,action_id uuid,expected_version text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select scipx_assignment_internal.undo(pid,action_id,expected_version);
$$;
revoke all on function public.assign_project_work_direct(uuid,jsonb,uuid,text,boolean,text),public.undo_project_work_assignment(uuid,uuid,text) from public,anon;
grant execute on function public.assign_project_work_direct(uuid,jsonb,uuid,text,boolean,text),public.undo_project_work_assignment(uuid,uuid,text) to authenticated;

alter function public.read_project_management(uuid) rename to read_project_management_before_direct;
revoke all on function public.read_project_management_before_direct(uuid) from public,anon,authenticated;
create function scipx_assignment_internal.read(pid uuid) returns jsonb
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
   select r.*,public.work_package_for_requirement(r.id) as work_id,public.requirement_chapter_key(r) as chapter_key,
   case when coalesce(nullif(r.value_json->>'parentRequirementId',''),nullif(r.value_json->>'parentSourcePostId',''),nullif(r.value_json->>'parentPostNumber','')) is null
     and not (coalesce(r.value_json->'reviewFlags','[]') ?| array['unassigned-source-text','unverified-post-source']) then r.id else public.post_main_id(r.id) end as main_id,
   case when coalesce(nullif(r.value_json->>'parentRequirementId',''),nullif(r.value_json->>'parentSourcePostId',''),nullif(r.value_json->>'parentPostNumber','')) is null
     and not (coalesce(r.value_json->'reviewFlags','[]') ?| array['unassigned-source-text','unverified-post-source']) then false else public.post_needs_hierarchy_review(r.id) end as hierarchy_review
   from public.project_requirements r where r.project_id=pid and r.deleted_at is null and r.status not in ('superseded','rejected')
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
revoke all on function scipx_assignment_internal.read(uuid) from public,anon;
grant execute on function scipx_assignment_internal.read(uuid) to authenticated;
create function public.read_project_management(pid uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$ select scipx_assignment_internal.read(pid); $$;
revoke all on function public.read_project_management(uuid) from public,anon;
grant execute on function public.read_project_management(uuid) to authenticated;

-- Direct assignment can enable a large project. Reuse resolved scopes in the
-- cross-project overview instead of repeating access and deadline RPCs per row.
create or replace function public.project_management_overview(oid uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with visible_projects as materialized (
   select p.id,p.name,s.deadline,public.is_delivery_manager(p.id) as manager,
     (public.has_permission(p.organization_id,'project.requirement.view') or public.has_permission(p.organization_id,'project.product_suggestion.view')) as can_read
   from public.projects p join public.project_management_settings s on s.project_id=p.id
   where p.organization_id=oid and p.deleted_at is null and public.can_access_project(p.id)
   and exists(select 1 from public.organization_members m where m.organization_id=oid and m.user_id=auth.uid() and m.status='active')
 ), visible_posts as materialized (
   select r.id,r.project_id,public.requirement_chapter_key(r) as chapter_key,public.work_package_for_requirement(r.id) as work_id
   from visible_projects p join public.project_requirements r on r.project_id=p.id
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
create or replace function public.work_package_for_requirement(rid uuid) returns uuid language sql stable security definer set search_path=pg_catalog as $$
 select w.id from public.project_requirements r join public.project_work_packages w on w.project_id=r.project_id
 left join public.project_requirements anchor on w.scope_type in ('pdf_chapter','main_post') and anchor.id::text=w.scope_value and anchor.project_id=r.project_id
 where r.id=rid and r.deleted_at is null and r.status not in ('superseded','rejected') and public.can_access_project(r.project_id)
 and w.assignment_mode<>'inherit' and (not public.pm_enabled(r.project_id) or w.department_id is not null or w.direct_assignee or w.assignment_mode='unassigned') and (
 (w.scope_type='post' and w.scope_value=r.id::text) or
 (w.scope_type='main_post' and anchor.deleted_at is null and anchor.status not in ('superseded','rejected') and (anchor.id=r.id or anchor.id=any(public.post_ancestor_ids(r.id)))) or
 (w.scope_type='pdf_chapter' and anchor.deleted_at is null and anchor.status not in ('superseded','rejected') and public.requirement_chapter_key(anchor)=public.requirement_chapter_key(r)) or
 (w.scope_type='chapter' and (r.value_json->>'postNumber'=w.scope_value or starts_with(r.value_json->>'postNumber',w.scope_value||'.'))) or
 (w.scope_type='group' and r.category=w.scope_value))
 order by case w.scope_type when 'post' then 5 when 'main_post' then 4 when 'pdf_chapter' then 3 when 'chapter' then 2 else 1 end desc,
 case when w.scope_type='main_post' then coalesce(array_position(public.post_ancestor_ids(r.id),anchor.id),0) else 0 end,
 length(w.scope_value) desc,w.id limit 1;
$$;


create or replace function public.save_project_management(pid uuid,payload jsonb,expected_revision bigint) returns void language plpgsql security definer set search_path=pg_catalog as $$
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


