-- Development-only until explicitly published. Preserve every existing assignment.
-- A department may own a queue before an individual is selected.
alter table public.project_work_packages drop constraint work_assignment_mode;
alter table public.project_work_packages add constraint work_assignment_mode check(
 (assignment_mode='explicit' and (assigned_to is not null or department_id is not null)) or
 (assignment_mode in ('unassigned','inherit') and assigned_to is null and department_id is null));

create function scipx_assignment_internal.assign_unified(
 pid uuid,targets jsonb,assignee uuid,assignment_mode text,replace_overrides boolean,expected_version text,
 department uuid,chapter_deadline date,update_deadline boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; target jsonb; r public.project_requirements; old_w public.project_work_packages;
 kind text; scope text; normalized jsonb:='[]'; previous_packages jsonb; previous_deadlines jsonb;
 previous_settings jsonb; added uuid[]:='{}'; member_id uuid; supervisor uuid; action_id uuid; version_after text;
begin
 select * into p from public.projects where id=pid and deleted_at is null for update;
 if not found or auth.uid() is null or not public.is_delivery_manager(pid)
 or not (public.has_permission(p.organization_id,'project.requirement.view') or public.has_permission(p.organization_id,'project.product_suggestion.view'))
 then raise exception 'Manager access required' using errcode='42501'; end if;
 if expected_version is distinct from scipx_assignment_internal.version(pid) then raise exception 'Assignments changed; reload' using errcode='40001'; end if;
 if jsonb_typeof(targets) is distinct from 'array' or jsonb_array_length(targets) not between 1 and 500
 or assignment_mode is null or assignment_mode not in ('explicit','inherit','unassigned') or replace_overrides is null
 or (assignment_mode='explicit' and assignee is null and department is null)
 or (assignment_mode<>'explicit' and (assignee is not null or department is not null))
 or update_deadline is null or (not update_deadline and chapter_deadline is not null)
 or (update_deadline and assignment_mode<>'explicit')
 then raise exception 'Invalid assignment' using errcode='22023'; end if;
 if assignee is not null and not exists(select 1 from scipx_assignment_internal.candidates(pid) c where c.id=assignee)
 then raise exception 'Active editable project member required' using errcode='22023'; end if;
 if department is not null then
   select d.supervisor_id into supervisor from public.project_work_departments d
   join public.teams t on t.id=d.department_id and t.organization_id=p.organization_id and t.status='active'
   where d.project_id=pid and d.department_id=department;
   if supervisor is null or not public.pm_in_department(pid,department,supervisor)
   then raise exception 'Active project department required' using errcode='22023'; end if;
   if assignee is not null and not public.pm_in_department(pid,department,assignee)
   then raise exception 'Active member of the department required' using errcode='22023'; end if;
 end if;
 -- Canonicalize and validate the whole batch before making any changes.
 for target in select value from jsonb_array_elements(targets) loop
   kind:=target->>'scope_type'; scope:=target->>'scope_value';
   if kind is null or kind not in ('post','main_post','pdf_chapter') then raise exception 'Invalid scope' using errcode='22023'; end if;
   select * into r from public.project_requirements where id=scope::uuid and project_id=pid and deleted_at is null and status not in ('superseded','rejected');
   if not found then raise exception 'Post does not belong to project' using errcode='22023'; end if;
   if update_deadline and kind<>'pdf_chapter' then raise exception 'Only chapter deadlines can be changed here' using errcode='22023'; end if;
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
   values(pid,p.organization_id,kind,scope,assignee,department,case when update_deadline then chapter_deadline else old_w.due_date end,assignment_mode,department is null)
   on conflict(project_id,scope_type,scope_value) do update set assigned_to=excluded.assigned_to,department_id=excluded.department_id,
     due_date=excluded.due_date,assignment_mode=excluded.assignment_mode,direct_assignee=excluded.direct_assignee,revision=project_work_packages.revision+1,updated_at=now();
 end loop;
 perform scipx_assignment_internal.capture_deadlines(pid);
 version_after:=scipx_assignment_internal.version(pid);
 insert into scipx_assignment_internal.actions(project_id,actor_id,before_packages,before_deadlines,before_settings,before_enforced,added_members,after_version)
 values(pid,auth.uid(),previous_packages,previous_deadlines,previous_settings,p.assignments_enforced,added,version_after) returning id into action_id;
 perform public.write_audit_log(p.organization_id,'project.unified_assignment','project',pid,null,null,
   jsonb_build_object('action_id',action_id,'targets',normalized,'assignee',assignee,'mode',assignment_mode,'replace_overrides',replace_overrides,'department',department,'update_deadline',update_deadline,'chapter_deadline',chapter_deadline));
 if assignee is null and department is not null then perform public.pm_notify(pid,null,array[supervisor],'assignment','Nytt arbeid i avdelingens kø',jsonb_array_length(normalized)); end if;
 if assignee is not null then perform public.pm_notify(pid,null,array[assignee],'assignment','Du har fått nye tildelinger',jsonb_array_length(normalized)); end if;
 return jsonb_build_object('saved',true,'undoToken',action_id,'assignmentVersion',version_after);
end $$;
revoke all on function scipx_assignment_internal.assign_unified(uuid,jsonb,uuid,text,boolean,text,uuid,date,boolean) from public,anon;
grant execute on function scipx_assignment_internal.assign_unified(uuid,jsonb,uuid,text,boolean,text,uuid,date,boolean) to authenticated;

create function public.assign_project_work_unified(
 pid uuid,targets jsonb,assignee uuid,assignment_mode text,replace_overrides boolean,expected_version text,
 department uuid,chapter_deadline date,update_deadline boolean
) returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select scipx_assignment_internal.assign_unified(pid,targets,assignee,assignment_mode,replace_overrides,expected_version,department,chapter_deadline,update_deadline);
$$;
revoke all on function public.assign_project_work_unified(uuid,jsonb,uuid,text,boolean,text,uuid,date,boolean) from public,anon;
grant execute on function public.assign_project_work_unified(uuid,jsonb,uuid,text,boolean,text,uuid,date,boolean) to authenticated;

-- Supervisors need the revision of an inherited override when assigning a post
-- again. Expose only empty revision tombstones for their already-visible scopes.
-- Authorization and all customer rows still come from the existing guarded read.
alter function public.read_project_management(uuid) rename to read_project_management_before_unified;
revoke all on function public.read_project_management_before_unified(uuid) from public,anon,authenticated;
create function scipx_assignment_internal.read_unified(pid uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb; tombstones jsonb; people jsonb;
begin
 if auth.uid() is null then raise exception 'Project access denied' using errcode='42501'; end if;
 result:=public.read_project_management_before_unified(pid);
 if not (result->>'manager')::boolean and exists(
   select 1 from public.project_work_departments d where d.project_id=pid and public.pm_is_supervisor(pid,d.department_id)
 ) then
   select coalesce(jsonb_agg(to_jsonb(w) order by w.id),'[]') into tombstones
   from public.project_work_packages w where w.project_id=pid and w.assignment_mode='inherit'
   and w.assigned_to is null and w.department_id is null
   and exists(select 1 from jsonb_array_elements(result->'posts') post
     where (w.scope_type='post' and w.scope_value=post->>'id')
        or (w.scope_type='main_post' and w.scope_value=post#>>'{mainPost,id}'))
   and not exists(select 1 from jsonb_array_elements(result->'assignments') a where a->>'id'=w.id::text);
   select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name,c.id),'[]') into people
   from scipx_assignment_internal.candidates(pid) c where exists(
     select 1 from public.project_work_departments d where d.project_id=pid
     and public.pm_is_supervisor(pid,d.department_id) and public.pm_in_department(pid,d.department_id,c.id));
   result:=result || jsonb_build_object('assignments',(result->'assignments') || tombstones,'assignees',people);
 end if;
 return result;
end $$;
revoke all on function scipx_assignment_internal.read_unified(uuid) from public,anon;
grant execute on function scipx_assignment_internal.read_unified(uuid) to authenticated;
create function public.read_project_management(pid uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
 select scipx_assignment_internal.read_unified(pid);
$$;
revoke all on function public.read_project_management(uuid) from public,anon;
grant execute on function public.read_project_management(uuid) to authenticated;
