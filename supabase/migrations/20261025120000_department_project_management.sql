-- Opt-in department workflow. Apply only in an isolated environment until publication is authorized.
create table public.project_management_settings (
 project_id uuid primary key references public.projects(id) on delete cascade,
 deadline date, allow_later_post_deadline boolean not null default true check(allow_later_post_deadline),
 multiple_help_requests boolean not null default true check(multiple_help_requests), assignment_email text not null default 'batch' check(assignment_email='batch'),
 revision bigint not null default 0
);
create table public.project_work_departments (
 project_id uuid not null references public.project_management_settings(project_id) on delete cascade,
 department_id uuid not null references public.teams(id), supervisor_id uuid not null references auth.users(id),
 primary key(project_id,department_id)
);
alter table public.project_work_packages add column department_id uuid references public.teams(id);
create index on public.project_work_packages(project_id,department_id);
create table public.project_work_deadlines (
 requirement_id uuid primary key references public.project_requirements(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 due_date date, inherited_date date, captured boolean not null default false, revision bigint not null default 0
);
create table public.project_task_states (
 requirement_id uuid primary key references public.project_requirements(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 done boolean not null default false, revision bigint not null default 0,
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table public.project_help_requests (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 requirement_id uuid not null references public.project_requirements(id) on delete cascade,
 description text not null check(length(btrim(description)) between 1 and 4000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 resolved_at timestamptz, resolved_by uuid references auth.users(id), revision bigint not null default 0
);
create index on public.project_help_requests(requirement_id) where resolved_at is null;
create table public.project_work_messages (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 requirement_id uuid not null references public.project_requirements(id) on delete cascade,
 help_id uuid references public.project_help_requests(id) on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 4000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index on public.project_work_messages(requirement_id,created_at,id);
create table public.project_work_notifications (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 requirement_id uuid references public.project_requirements(id) on delete cascade,
 recipient_id uuid not null references auth.users(id), kind text not null check(kind in ('assignment','help','reply','resolved','deadline')),
 title text not null, created_at timestamptz not null default now(), read_at timestamptz
);
create index on public.project_work_notifications(recipient_id,created_at desc);
-- An outbox row is one email, not one post. It contains no PDF text or help description.
create table public.project_work_email_outbox (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 recipient_id uuid not null references auth.users(id), kind text not null, item_count integer not null default 1,
 available_at timestamptz not null default now(), sent_at timestamptz, attempts integer not null default 0,
 lease uuid, lease_until timestamptz, last_error text, first_attempt_at timestamptz, delivery_email text,
 created_at timestamptz not null default now()
);
create index on public.project_work_email_outbox(available_at) where sent_at is null;

create function public.pm_enabled(pid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.project_management_settings where project_id=pid);
$$;
create function public.pm_active_member(pid uuid,uid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id
 join public.project_members pm on pm.project_id=p.id and pm.user_id=m.user_id
 where p.id=pid and p.deleted_at is null and m.user_id=uid and m.status='active' and pm.status='active' and pm.role in ('editor','reviewer','project_manager'));
$$;
create function public.pm_in_department(pid uuid,did uuid,uid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select public.pm_active_member(pid,uid) and exists(select 1 from public.project_work_departments d
 join public.projects p on p.id=d.project_id join public.teams t on t.id=d.department_id and t.organization_id=p.organization_id and t.status='active'
 join public.team_members tm on tm.team_id=t.id join public.organization_members m on m.id=tm.organization_member_id
 where d.project_id=pid and d.department_id=did and m.user_id=uid and m.organization_id=p.organization_id and m.status='active');
$$;
create function public.pm_is_supervisor(pid uuid,did uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select public.pm_in_department(pid,did,auth.uid()) and exists(select 1 from public.project_work_departments where project_id=pid and department_id=did and supervisor_id=auth.uid());
$$;
create or replace function public.is_delivery_manager(pid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and public.can_access_project(pid) and exists(select 1 from public.projects p
 join public.organization_members m on m.organization_id=p.organization_id and m.user_id=auth.uid() and m.status='active'
 where p.id=pid and p.deleted_at is null and public.has_permission(p.organization_id,'project.update') and
 (public.is_organization_admin(p.organization_id) or auth.uid() in (p.owner_user_id,p.owner_id,p.created_by,p.project_manager_id)
 or exists(select 1 from public.project_members pm where pm.project_id=pid and pm.user_id=auth.uid() and pm.status='active' and pm.role='project_manager')));
$$;
create or replace function public.work_package_for_requirement(rid uuid) returns uuid language sql stable security definer set search_path=pg_catalog as $$
 select w.id from public.project_requirements r join public.project_work_packages w on w.project_id=r.project_id
 left join public.project_requirements anchor on w.scope_type='pdf_chapter' and anchor.id::text=w.scope_value and anchor.project_id=r.project_id
 where r.id=rid and public.can_access_project(r.project_id) and (not public.pm_enabled(r.project_id) or w.department_id is not null) and (
 (w.scope_type='post' and w.scope_value=r.id::text) or
 (w.scope_type='pdf_chapter' and anchor.deleted_at is null and anchor.status<>'superseded' and public.requirement_chapter_key(anchor)=public.requirement_chapter_key(r)) or
 (w.scope_type='chapter' and (r.value_json->>'postNumber'=w.scope_value or left(r.value_json->>'postNumber',length(w.scope_value)+1)=w.scope_value||'.')) or
 (w.scope_type='group' and r.category=w.scope_value))
 order by case w.scope_type when 'post' then 4 when 'pdf_chapter' then 3 when 'chapter' then 2 else 1 end desc,length(w.scope_value) desc,w.id limit 1;
$$;
create function public.pm_can_read(rid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.project_requirements r where r.id=rid and public.can_access_project(r.project_id)
 and (not public.pm_enabled(r.project_id) or public.has_permission(r.organization_id,'project.requirement.view') or public.has_permission(r.organization_id,'project.product_suggestion.view'))
 and (not public.pm_enabled(r.project_id) or public.is_delivery_manager(r.project_id) or exists(select 1 from public.project_work_packages w
 where w.id=public.work_package_for_requirement(r.id) and public.pm_in_department(r.project_id,w.department_id,auth.uid()))));
$$;
create function public.pm_full_project_read(pid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select not public.pm_enabled(pid) or public.is_delivery_manager(pid);
$$;
create or replace function public.can_edit_project_requirement(rid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from public.project_requirements r join public.projects p on p.id=r.project_id
 where r.id=rid and r.deleted_at is null and r.status<>'superseded' and public.can_access_project(p.id) and
 (public.is_delivery_manager(p.id) or (public.has_permission(p.organization_id,'project.product_suggestion.create') and
 case when public.pm_enabled(p.id) then exists(select 1 from public.project_work_packages w where w.id=public.work_package_for_requirement(r.id)
 and public.pm_in_department(p.id,w.department_id,auth.uid()) and (w.assigned_to=auth.uid() or public.pm_is_supervisor(p.id,w.department_id)))
 else not exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=auth.uid() and (m.status<>'active' or m.role='viewer'))
 and (not p.assignments_enforced or exists(select 1 from public.project_work_packages w join public.organization_members m on m.user_id=w.assigned_to and m.organization_id=p.organization_id and m.status='active'
 where w.id=public.work_package_for_requirement(r.id) and w.assigned_to=auth.uid() and public.pm_active_member(p.id,auth.uid()))) end)));
$$;
create function public.pm_due_date(rid uuid) returns date language sql stable security definer set search_path=pg_catalog as $$
 select case when d.due_date is not null then d.due_date when d.captured then d.inherited_date else coalesce(w.due_date,c.due_date,s.deadline) end from public.project_requirements r
 join public.project_management_settings s on s.project_id=r.project_id
 left join public.project_work_deadlines d on d.requirement_id=r.id
 left join public.project_work_packages w on w.id=public.work_package_for_requirement(r.id)
 left join lateral(select cw.due_date from public.project_work_packages cw join public.project_requirements a on a.id::text=cw.scope_value and a.project_id=r.project_id
 where cw.project_id=r.project_id and cw.scope_type='pdf_chapter' and a.deleted_at is null and a.status<>'superseded' and public.requirement_chapter_key(a)=public.requirement_chapter_key(r) order by cw.id limit 1)c on true
 where r.id=rid and public.pm_can_read(rid);
$$;

-- Legacy routes still use these tables: restrictions apply there, not just in the new screen.
create policy pm_requirement_scope on public.project_requirements as restrictive for select to authenticated using(public.pm_can_read(id));
create function public.pm_preserve_post_scope() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is not null and public.pm_enabled(old.project_id) and not public.is_delivery_manager(old.project_id)
 and (public.requirement_chapter_key(new) is distinct from public.requirement_chapter_key(old)
 or new.source_document_id is distinct from old.source_document_id or new.source_technical_description_document_id is distinct from old.source_technical_description_document_id) then
 raise exception 'Only managers may change the chapter or source document' using errcode='42501'; end if;
 return new;
end $$;
create trigger pm_preserve_post_scope before update on public.project_requirements for each row execute function public.pm_preserve_post_scope();
create policy pm_package_scope on public.project_work_packages as restrictive for select to authenticated using(public.pm_full_project_read(project_id) or public.pm_in_department(project_id,department_id,auth.uid()));
do $$ declare t record; begin
 for t in select c.table_name from information_schema.columns c join information_schema.columns p on p.table_schema=c.table_schema and p.table_name=c.table_name and p.column_name='project_id'
 where c.table_schema='public' and c.column_name='requirement_id' and c.table_name not in ('project_work_notifications')
 and exists(select 1 from information_schema.tables tbl where tbl.table_schema=c.table_schema and tbl.table_name=c.table_name and tbl.table_type='BASE TABLE') loop
 execute format('create policy pm_post_scope on public.%I as restrictive for select to authenticated using(public.pm_can_read(requirement_id))',t.table_name);
 end loop;
 -- Raw PDFs, extraction results and project snapshots may contain other departments' text.
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='project_id' and table_name in
 ('project_documents','technical_description_documents','technical_description_material_lines','technical_description_rule_hints','technical_description_versions','technical_description_jobs','technical_description_checkpoints','project_versions','project_requirement_conflicts','project_decisions','project_document_controls','document_pages','extraction_runs','requirement_candidates','requirement_sets','match_runs','match_candidates','material_list_versions','material_lists','analyses','material_estimates') loop
 execute format('create policy pm_raw_scope on public.%I as restrictive for select to authenticated using(public.pm_full_project_read(project_id))',t.table_name);
 end loop;
 for t in select table_name from information_schema.tables where table_schema='public' and table_name in ('technical_description_material_lines','technical_description_rule_hints') loop
 execute format('create policy pm_source_document_scope on public.%I as restrictive for select to authenticated using(exists(select 1 from public.technical_description_documents d where d.id=%I.document_id))',t.table_name,t.table_name);
 end loop;
 if to_regclass('public.material_estimate_items') is not null then
 execute 'create policy pm_estimate_items_scope on public.material_estimate_items as restrictive for select to authenticated using(exists(select 1 from public.material_estimates e where e.id=material_estimate_items.estimate_id))';
 end if;
 if to_regclass('public.material_list_items') is not null then
 execute 'create policy pm_material_items_scope on public.material_list_items as restrictive for select to authenticated using(exists(select 1 from public.material_lists l where l.id=material_list_items.material_list_id))';
 end if;
end $$;

-- Prevent direct Storage API downloads from bypassing project-document RLS.
do $$ begin
 if to_regclass('storage.objects') is not null then
 execute $policy$create policy pm_source_files_scope on storage.objects as restrictive for select to authenticated using (
 bucket_id<>'project-files' or case when split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then public.pm_full_project_read(split_part(name,'/',2)::uuid) else true end)$policy$;
 end if;
end $$;

alter function public.save_work_package(uuid,jsonb,bigint) rename to save_legacy_work_package;
revoke all on function public.save_legacy_work_package(uuid,jsonb,bigint) from public,anon,authenticated;
create function public.save_work_package(pid uuid,payload jsonb,expected_revision bigint default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if public.pm_enabled(pid) then raise exception 'Use department project management' using errcode='22023'; end if;
 return public.save_legacy_work_package(pid,payload,expected_revision);
end $$;

create function public.pm_capture_deadlines(pid uuid) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 -- Capture only visible assigned rows. Later chapter/project changes never move these dates.
 insert into public.project_work_deadlines(requirement_id,project_id,inherited_date,captured)
 select r.id,pid,coalesce(w.due_date,c.due_date,s.deadline),true from public.project_requirements r
 left join public.project_work_deadlines d on d.requirement_id=r.id
 join public.project_management_settings s on s.project_id=pid
 join public.project_work_packages w on w.id=public.work_package_for_requirement(r.id)
 left join lateral(select cw.due_date from public.project_work_packages cw join public.project_requirements a on a.id::text=cw.scope_value
 where cw.project_id=pid and cw.scope_type='pdf_chapter' and a.deleted_at is null and a.status<>'superseded' and public.requirement_chapter_key(a)=public.requirement_chapter_key(r) order by cw.id limit 1)c on true
 where r.project_id=pid and r.deleted_at is null and r.status<>'superseded' and not coalesce(d.captured,false)
 and public.pm_can_read(r.id) and w.assigned_to is not null
 on conflict(requirement_id) do update set inherited_date=excluded.inherited_date,captured=true,revision=project_work_deadlines.revision+1;
end $$;

create function public.pm_notify(pid uuid,rid uuid,recipients uuid[],event_kind text,event_title text,items integer default 1) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid;
begin
 for uid in select distinct unnest(recipients) loop
 if uid is null or uid=auth.uid() or not public.pm_active_member(pid,uid) then continue; end if;
 insert into public.project_work_notifications(project_id,requirement_id,recipient_id,kind,title) values(pid,rid,uid,event_kind,event_title);
 insert into public.project_work_email_outbox(project_id,recipient_id,kind,item_count) values(pid,uid,event_kind,items);
 end loop;
end $$;

create function public.save_project_management(pid uuid,payload jsonb,expected_revision bigint) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; current_revision bigint; d jsonb; did uuid; lead uuid; v_deadline date;
begin
 select * into p from public.projects where id=pid for update;
 if not public.is_delivery_manager(pid) then raise exception 'Manager access required' using errcode='42501'; end if;
 select revision into current_revision from public.project_management_settings where project_id=pid;
 if coalesce(current_revision,-1) is distinct from expected_revision then raise exception 'Settings changed; reload' using errcode='40001'; end if;
 if jsonb_typeof(payload->'departments') is distinct from 'array' or jsonb_array_length(payload->'departments') not between 1 and 100 then raise exception 'Choose project departments' using errcode='22023'; end if;
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

create function public.assign_project_work(pid uuid,changes jsonb) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; e jsonb; r public.project_requirements; w public.project_work_packages; saved public.project_work_packages;
 did uuid; uid uuid; lead uuid; scope text; kind text; v_due date; manager boolean; recipients uuid[]:='{}'; recipient uuid; n integer;
begin
 select * into p from public.projects where id=pid for update;
 if not public.pm_enabled(pid) or not public.can_access_project(pid) then raise exception 'Project access denied' using errcode='42501'; end if;
 manager:=public.is_delivery_manager(pid);
 if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) not between 1 and 500 then raise exception 'Select 1 to 500 assignments' using errcode='22023'; end if;
 perform public.pm_capture_deadlines(pid);
 for e in select value from jsonb_array_elements(changes) loop
 kind:=e->>'scope_type'; scope:=e->>'scope_value'; did:=(e->>'department_id')::uuid;
 if coalesce(kind,'') not in ('post','pdf_chapter') then raise exception 'Invalid scope' using errcode='22023'; end if;
 select * into r from public.project_requirements where id=scope::uuid and project_id=pid and deleted_at is null and status<>'superseded';
 if not found then raise exception 'Post not found' using errcode='22023'; end if;
 if kind='pdf_chapter' then
 select cw.scope_value into scope from public.project_work_packages cw join public.project_requirements a on a.id::text=cw.scope_value where cw.project_id=pid and cw.scope_type=kind and a.deleted_at is null and a.status<>'superseded' and public.requirement_chapter_key(a)=public.requirement_chapter_key(r) order by cw.id limit 1;
 if scope is null then select min(a.id::text) into scope from public.project_requirements a where a.project_id=pid and a.deleted_at is null and a.status<>'superseded' and public.requirement_chapter_key(a)=public.requirement_chapter_key(r); end if;
 end if;
 select * into w from public.project_work_packages where project_id=pid and scope_type=kind and scope_value=scope;
 if coalesce(w.revision,-1) is distinct from (e->>'revision')::bigint then raise exception 'Assignment changed; reload' using errcode='40001'; end if;
 select supervisor_id into lead from public.project_work_departments where project_id=pid and department_id=did;
 if lead is null then raise exception 'Choose a project department' using errcode='22023'; end if;
 if manager then
 -- Managers distribute to supervisors. Changing only the deadline preserves the employee assignment.
 uid:=case when e->>'operation'='deadline' and w.id is not null then w.assigned_to else lead end;
 if e->>'operation'='deadline' and (w.id is null or w.department_id is distinct from did) then raise exception 'Assign work before changing its deadline' using errcode='22023'; end if;
 v_due:=nullif(e->>'due_date','')::date;
 else
 if not public.pm_is_supervisor(pid,did) then raise exception 'Department supervisor required' using errcode='42501'; end if;
 if (kind='pdf_chapter' and (w.id is null or w.department_id is distinct from did)) or (kind='post' and not exists(select 1 from public.project_work_packages current_w where current_w.id=public.work_package_for_requirement(r.id) and current_w.department_id=did)) then raise exception 'Department scope denied' using errcode='42501'; end if;
 if e ? 'due_date' then raise exception 'Only managers set deadlines' using errcode='42501'; end if;
 uid:=(e->>'assigned_to')::uuid; v_due:=w.due_date;
 end if;
 if not public.pm_in_department(pid,did,uid) then raise exception 'Active member of the department required' using errcode='22023'; end if;
 insert into public.project_work_packages(project_id,organization_id,scope_type,scope_value,assigned_to,department_id,due_date)
 values(pid,p.organization_id,kind,scope,uid,did,v_due)
 on conflict(project_id,scope_type,scope_value) do update set assigned_to=excluded.assigned_to,department_id=excluded.department_id,due_date=excluded.due_date,revision=project_work_packages.revision+1,updated_at=now() returning * into saved;
 recipients:=array_append(recipients,uid);
 perform public.write_audit_log(p.organization_id,'project.department_assignment','project_work_package',saved.id,to_jsonb(w),to_jsonb(saved),'{}');
 end loop;
 perform public.pm_capture_deadlines(pid);
 for recipient in select distinct unnest(recipients) loop
 select count(*) into n from unnest(recipients) x where x=recipient;
 perform public.pm_notify(pid,null,array[recipient],'assignment',format('%s tildelinger er oppdatert',n),n);
 end loop;
end $$;

create function public.update_project_task(pid uuid,rid uuid,expected_revision bigint,mark_done boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare rev bigint; org uuid;
begin
 select organization_id into org from public.projects where id=pid for update;
 if not public.pm_enabled(pid) or not exists(select 1 from public.project_requirements where id=rid and project_id=pid) or not public.can_edit_project_requirement(rid) then raise exception 'Post edit denied' using errcode='42501'; end if;
 select revision into rev from public.project_task_states where requirement_id=rid;
 if coalesce(rev,-1) is distinct from expected_revision then raise exception 'Task changed; reload' using errcode='40001'; end if;
 if mark_done and exists(select 1 from public.project_help_requests where requirement_id=rid and resolved_at is null) then raise exception 'Resolve help before completing the post' using errcode='22023'; end if;
 insert into public.project_task_states(requirement_id,project_id,done,updated_by) values(rid,pid,mark_done,auth.uid())
 on conflict(requirement_id) do update set done=excluded.done,revision=project_task_states.revision+1,updated_by=auth.uid(),updated_at=now();
 perform public.write_audit_log(org,'project.task_status','project_requirement',rid,null,null,jsonb_build_object('done',mark_done));
end $$;

create function public.write_project_message(pid uuid,rid uuid,payload jsonb) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare h public.project_help_requests; w public.project_work_packages; lead uuid; kind text; message text; hid uuid;
begin
 perform 1 from public.projects where id=pid for update;
 if not public.pm_enabled(pid) or not exists(select 1 from public.project_requirements where id=rid and project_id=pid) or not public.can_edit_project_requirement(rid) then raise exception 'Post edit denied' using errcode='42501'; end if;
 select * into w from public.project_work_packages where id=public.work_package_for_requirement(rid);
 select supervisor_id into lead from public.project_work_departments where project_id=pid and department_id=w.department_id;
 kind:=payload->>'kind'; message:=btrim(payload->>'body'); hid:=nullif(payload->>'help_id','')::uuid;
 if hid is not null then
 select * into h from public.project_help_requests where id=hid and project_id=pid and requirement_id=rid;
 if not found then raise exception 'Help request not found' using errcode='22023'; end if;
 end if;
 if kind='resolve' then
 if hid is null or h.resolved_at is not null or h.revision is distinct from (payload->>'revision')::bigint then raise exception 'Help request changed; reload' using errcode='40001'; end if;
 update public.project_help_requests set resolved_at=now(),resolved_by=auth.uid(),revision=revision+1 where id=hid;
 perform public.pm_notify(pid,rid,array[w.assigned_to,lead,h.created_by],'resolved','Hjelpebehovet er løst');
 elsif kind='help' then
 if message is null or length(message) not between 1 and 4000 or hid is not null then raise exception 'Describe the help needed' using errcode='22023'; end if;
 if exists(select 1 from public.project_task_states where requirement_id=rid and done) then raise exception 'Reopen the post before requesting help' using errcode='22023'; end if;
 insert into public.project_help_requests(project_id,requirement_id,description,created_by) values(pid,rid,message,auth.uid());
 perform public.pm_notify(pid,rid,array[lead,w.assigned_to],'help','En post trenger hjelp');
 elsif kind='reply' then
 if message is null or length(message) not between 1 and 4000 or (hid is not null and h.resolved_at is not null) then raise exception 'Write a reply to an open request' using errcode='22023'; end if;
 insert into public.project_work_messages(project_id,requirement_id,help_id,body,created_by) values(pid,rid,hid,message,auth.uid());
 perform public.pm_notify(pid,rid,array[lead,w.assigned_to,h.created_by],'reply','Nytt spørsmål eller svar på en post');
 else raise exception 'Invalid message action' using errcode='22023'; end if;
end $$;

create function public.read_project_management(pid uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare p public.projects; manager boolean; result jsonb;
begin
 select * into p from public.projects where id=pid and deleted_at is null;
 if not found or not public.can_access_project(pid) or not (public.has_permission(p.organization_id,'project.requirement.view') or public.has_permission(p.organization_id,'project.product_suggestion.view')) then raise exception 'Project access denied' using errcode='42501'; end if;
 manager:=public.is_delivery_manager(pid);
 select jsonb_build_object('projectId',pid,'name',p.name,'userId',auth.uid(),'manager',manager,
 'settings',(select to_jsonb(s) from public.project_management_settings s where project_id=pid),
 'departments',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'supervisorId',d.supervisor_id)) from public.teams t left join public.project_work_departments d on d.department_id=t.id and d.project_id=pid where t.organization_id=p.organization_id and t.status='active' and (manager or public.pm_in_department(pid,t.id,auth.uid()))),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'departmentId',tm.team_id,'name',coalesce(pr.display_name,pr.email,m.user_id::text))) from public.team_members tm join public.teams t on t.id=tm.team_id and t.organization_id=p.organization_id and t.status='active' join public.organization_members m on m.id=tm.organization_member_id and m.organization_id=p.organization_id and m.status='active' left join public.profiles pr on pr.id=m.user_id where manager or public.pm_in_department(pid,t.id,auth.uid())),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(to_jsonb(w)) from public.project_work_packages w where w.project_id=pid and (manager or public.pm_in_department(pid,w.department_id,auth.uid()))),'[]'::jsonb),
 'posts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',r.value_json->>'postNumber','title',left(coalesce(r.value_text,''),200),'chapter',coalesce(r.value_json#>>'{sourceChapter,title}','Kapittel uten navn'),
 'chapterKey',public.requirement_chapter_key(r),'assignmentId',public.work_package_for_requirement(r.id),'dueDate',public.pm_due_date(r.id),'ownDeadline',d.due_date,'deadlineRevision',coalesce(d.revision,-1),'canEdit',public.can_edit_project_requirement(r.id),
 'done',coalesce(ts.done,false),'revision',coalesce(ts.revision,-1),'openHelp',(select count(*) from public.project_help_requests h where h.requirement_id=r.id and h.resolved_at is null)))
 from public.project_requirements r left join public.project_task_states ts on ts.requirement_id=r.id left join public.project_work_deadlines d on d.requirement_id=r.id where r.project_id=pid and r.deleted_at is null and r.status<>'superseded' and public.pm_can_read(r.id)),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.read_project_work_thread(pid uuid,rid uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not public.pm_enabled(pid) or not exists(select 1 from public.project_requirements where id=rid and project_id=pid) or not public.pm_can_read(rid) then raise exception 'Post access denied' using errcode='42501'; end if;
 return jsonb_build_object('help',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at,h.id) from public.project_help_requests h where requirement_id=rid),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from public.project_work_messages m where requirement_id=rid),'[]'::jsonb));
end $$;

-- RLS for new tables. Mutations are available only through the checked RPCs.
do $$ declare t text; begin
 foreach t in array array['project_management_settings','project_work_departments','project_work_deadlines','project_task_states','project_help_requests','project_work_messages','project_work_notifications','project_work_email_outbox'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;
grant select on public.project_management_settings,public.project_work_departments,public.project_work_deadlines,public.project_task_states,public.project_help_requests,public.project_work_messages,public.project_work_notifications to authenticated;
create policy pm_deadlines_read on public.project_work_deadlines for select to authenticated using(public.pm_can_read(requirement_id));
create policy pm_settings_read on public.project_management_settings for select to authenticated using(public.can_access_project(project_id));
create policy pm_departments_read on public.project_work_departments for select to authenticated using(public.is_delivery_manager(project_id) or public.pm_in_department(project_id,department_id,auth.uid()));
create policy pm_tasks_read on public.project_task_states for select to authenticated using(public.pm_can_read(requirement_id));
create policy pm_help_read on public.project_help_requests for select to authenticated using(public.pm_can_read(requirement_id));
create policy pm_messages_read on public.project_work_messages for select to authenticated using(public.pm_can_read(requirement_id));
create policy pm_notifications_read on public.project_work_notifications for select to authenticated using(recipient_id=auth.uid() and public.can_access_project(project_id) and (requirement_id is null or public.pm_can_read(requirement_id)));
create function public.read_project_notification(nid uuid) returns void language sql security definer set search_path=pg_catalog as $$
 update public.project_work_notifications set read_at=coalesce(read_at,now()) where id=nid and recipient_id=auth.uid() and public.can_access_project(project_id);
$$;

-- Worker-only lease RPCs. Expired leases retry with the same provider idempotency key.
create function public.claim_project_work_emails() returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 with picked as (select id from public.project_work_email_outbox where sent_at is null and attempts<8 and available_at<=now() and (lease_until is null or lease_until<now()) and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours') and public.pm_active_member(project_id,recipient_id) order by available_at,id for update skip locked limit 8),
 claimed as (update public.project_work_email_outbox o set lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),delivery_email=coalesce(delivery_email,(select email from auth.users where id=o.recipient_id)) from picked where o.id=picked.id returning o.*)
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('email',c.delivery_email)), '[]'::jsonb) into result from claimed c;
 return result;
end $$;
create function public.finish_project_work_email(eid uuid,token uuid,succeeded boolean,failure text default null) returns void language sql security definer set search_path=pg_catalog as $$
 update public.project_work_email_outbox set sent_at=case when succeeded then now() else null end,lease=null,lease_until=null,last_error=case when succeeded then null else left(failure,120) end,
 available_at=case when succeeded then available_at else now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)) end where id=eid and lease=token and sent_at is null;
$$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pm_%' or p.proname in ('save_project_management','assign_project_work','update_project_task','write_project_message','read_project_management','read_project_work_thread','read_project_notification','claim_project_work_emails','finish_project_work_email','save_work_package')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.proname not in ('pm_notify','pm_capture_deadlines','claim_project_work_emails','finish_project_work_email') then execute format('grant execute on function %s to authenticated',f.sig); end if;
 end loop;
end $$;
grant execute on function public.claim_project_work_emails(),public.finish_project_work_email(uuid,uuid,boolean,text) to service_role;

create function public.set_project_work_deadline(pid uuid,rid uuid,expected_revision bigint,deadline date) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare rev bigint; recipient uuid; org uuid;
begin
 select organization_id into org from public.projects where id=pid for update;
 if not public.pm_enabled(pid) or not public.is_delivery_manager(pid) then raise exception 'Manager access required' using errcode='42501'; end if;
 if not exists(select 1 from public.project_requirements where id=rid and project_id=pid and deleted_at is null and status<>'superseded') then raise exception 'Post not found' using errcode='22023'; end if;
 select revision into rev from public.project_work_deadlines where requirement_id=rid;
 if coalesce(rev,-1) is distinct from expected_revision then raise exception 'Deadline changed; reload' using errcode='40001'; end if;
 insert into public.project_work_deadlines(requirement_id,project_id,due_date) values(rid,pid,deadline)
 on conflict(requirement_id) do update set due_date=excluded.due_date,revision=project_work_deadlines.revision+1;
 select assigned_to into recipient from public.project_work_packages where id=public.work_package_for_requirement(rid);
 perform public.pm_notify(pid,rid,array[recipient],'deadline','Fristen for en post er endret');
 perform public.write_audit_log(org,'project.post_deadline','project_requirement',rid,null,null,jsonb_build_object('deadline',deadline));
end $$;
revoke all on function public.set_project_work_deadline(uuid,uuid,bigint,date) from public,anon;
grant execute on function public.set_project_work_deadline(uuid,uuid,bigint,date) to authenticated;

create function public.project_management_overview(oid uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'manager',public.is_delivery_manager(p.id),'deadline',s.deadline,
 'total',counts.total,'done',counts.done,'late',counts.late,'help',counts.help,'unassigned',counts.unassigned) order by p.name,p.id),'[]'::jsonb)
 from public.projects p join public.project_management_settings s on s.project_id=p.id
 cross join lateral(select count(*) as total,count(*) filter(where ts.done) as done,
 count(*) filter(where not coalesce(ts.done,false) and public.pm_due_date(r.id)<(now() at time zone 'Europe/Oslo')::date) as late,
 count(*) filter(where exists(select 1 from public.project_help_requests h where h.requirement_id=r.id and h.resolved_at is null)) as help,
 count(*) filter(where not exists(select 1 from public.project_work_packages w where w.id=public.work_package_for_requirement(r.id) and w.assigned_to is not null)) as unassigned
 from public.project_requirements r left join public.project_task_states ts on ts.requirement_id=r.id
 where r.project_id=p.id and r.deleted_at is null and r.status<>'superseded' and public.pm_can_read(r.id)) counts
 where p.organization_id=oid and p.deleted_at is null and public.can_access_project(p.id) and exists(select 1 from public.organization_members m where m.organization_id=oid and m.user_id=auth.uid() and m.status='active');
$$;
revoke all on function public.project_management_overview(uuid) from public,anon;
grant execute on function public.project_management_overview(uuid) to authenticated;
