-- Source-backed main-post grouping and inheritable department assignments.
-- Local/development migration; production remains frozen.
alter table public.project_work_packages drop constraint project_work_packages_scope_type_check;
alter table public.project_work_packages add constraint project_work_packages_scope_type_check check(scope_type in ('chapter','group','pdf_chapter','main_post','post'));
alter table public.project_work_packages alter column assigned_to drop not null;
alter table public.project_work_packages add column assignment_mode text not null default 'explicit' check(assignment_mode in ('explicit','unassigned','inherit'));
alter table public.project_work_packages add constraint work_assignment_mode check(
 (assignment_mode='explicit' and assigned_to is not null) or
 (assignment_mode in ('unassigned','inherit') and assigned_to is null and department_id is null));

create function public.post_hierarchy_scope(r public.project_requirements) returns text language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_array(coalesce(r.source_technical_description_document_id::text,r.source_document_id::text,''),coalesce(r.value_json->>'postScope',''))::text;
$$;
create or replace function public.requirement_chapter_key(r public.project_requirements) returns text language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_array(coalesce(r.source_technical_description_document_id::text,r.source_document_id::text,''),
 lower(regexp_replace(btrim(coalesce(nullif(r.value_json#>>'{sourceChapter,title}',''),'Kapitel saknas i PDF')),'\s+',' ','g')),
 coalesce(r.value_json->>'postScope',''),coalesce(r.value_json#>>'{sourceChapter,occurrenceId}',''))::text;
$$;
create function public.post_is_source_chapter(r public.project_requirements) returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(r.value_json->>'chapterInformation'='true',false) or
 (coalesce(r.value_json->>'postNumber','')<>'' and starts_with(coalesce(r.value_json#>>'{sourceChapter,title}',''),(r.value_json->>'postNumber')||' '));
$$;
create index project_post_source_address on public.project_requirements(project_id,(value_json->>'sourcePostId')) where deleted_at is null;
create index project_post_number_address on public.project_requirements(project_id,(value_json->>'postNumber')) where deleted_at is null;
create function public.post_parent_id(rid uuid) returns uuid language plpgsql stable security definer set search_path=pg_catalog as $$
declare r public.project_requirements; p public.project_requirements; candidates uuid[]; address text; mode text;
begin
 select * into r from public.project_requirements where id=rid and deleted_at is null and status not in ('superseded','rejected');
 if not found then return null; end if;
 if nullif(r.value_json->>'parentRequirementId','') is not null then mode:='id';address:=r.value_json->>'parentRequirementId';
 elsif nullif(r.value_json->>'parentSourcePostId','') is not null then mode:='source';address:=r.value_json->>'parentSourcePostId';
 else mode:='number';address:=nullif(r.value_json->>'parentPostNumber',''); end if;
 if address is null then return null; end if;
 select array_agg(a.id) into candidates from public.project_requirements a where a.project_id=r.project_id
 and a.deleted_at is null and a.status not in ('superseded','rejected') and public.post_hierarchy_scope(a)=public.post_hierarchy_scope(r)
 and case mode when 'id' then a.id::text=address when 'source' then a.value_json->>'sourcePostId'=address else a.value_json->>'postNumber'=address end;
 if cardinality(candidates) is distinct from 1 or candidates[1]=rid then return null; end if;
 select * into p from public.project_requirements where id=candidates[1];
 if coalesce(p.value_json->'reviewFlags','[]'::jsonb) ?| array['unassigned-source-text','unverified-post-source'] and not public.post_is_source_chapter(p) then return null; end if;
 -- UUID/source IDs are authoritative links. Legacy numbers also need source order.
 if mode='number' and not (
   coalesce((to_jsonb(p)->>'source_page')::int,0)<coalesce((to_jsonb(r)->>'source_page')::int,0) or
   (coalesce((to_jsonb(p)->>'source_page')::int,0)=coalesce((to_jsonb(r)->>'source_page')::int,0)
    and coalesce(p.value_json->>'sourceOrder','0') ~ '^\d+(\.\d+)?$' and coalesce(r.value_json->>'sourceOrder','0') ~ '^\d+(\.\d+)?$'
    and coalesce(p.value_json->>'sourceOrder','0')::numeric<coalesce(r.value_json->>'sourceOrder','0')::numeric)) then return null; end if;
 return p.id;
end $$;
create function public.post_ancestor_ids(rid uuid) returns uuid[] language plpgsql stable security definer set search_path=pg_catalog as $$
declare result uuid[]:='{}'; next_id uuid:=public.post_parent_id(rid);
begin
 while next_id is not null loop
 if next_id=rid or next_id=any(result) or cardinality(result)>=128 then return '{}'; end if;
 result:=array_append(result,next_id);next_id:=public.post_parent_id(next_id);
 end loop;
 return result;
end $$;
create function public.post_needs_hierarchy_review(rid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.project_requirements r where r.id=any(array_prepend(rid,public.post_ancestor_ids(rid))) and
 ((coalesce(nullif(r.value_json->>'parentRequirementId',''),nullif(r.value_json->>'parentSourcePostId',''),nullif(r.value_json->>'parentPostNumber','')) is not null and public.post_parent_id(r.id) is null)
 or (coalesce(r.value_json->'reviewFlags','[]'::jsonb) ?| array['unassigned-source-text','unverified-post-source'] and not public.post_is_source_chapter(r))))
 or (public.post_parent_id(rid) is not null and cardinality(public.post_ancestor_ids(rid))=0);
$$;
create function public.post_main_id(rid uuid) returns uuid language sql stable security definer set search_path=pg_catalog as $$
 select case when public.post_needs_hierarchy_review(rid) then null else coalesce((select a.id from unnest(public.post_ancestor_ids(rid)) with ordinality x(id,position)
 join public.project_requirements a on a.id=x.id where not public.post_is_source_chapter(a) order by x.position limit 1),rid) end;
$$;
create or replace function public.work_package_for_requirement(rid uuid) returns uuid language sql stable security definer set search_path=pg_catalog as $$
 select w.id from public.project_requirements r join public.project_work_packages w on w.project_id=r.project_id
 left join public.project_requirements anchor on w.scope_type in ('pdf_chapter','main_post') and anchor.id::text=w.scope_value and anchor.project_id=r.project_id
 where r.id=rid and r.deleted_at is null and r.status not in ('superseded','rejected') and public.can_access_project(r.project_id)
 and w.assignment_mode<>'inherit' and (not public.pm_enabled(r.project_id) or w.department_id is not null or w.assignment_mode='unassigned') and (
 (w.scope_type='post' and w.scope_value=r.id::text) or
 (w.scope_type='main_post' and anchor.deleted_at is null and anchor.status not in ('superseded','rejected') and (anchor.id=r.id or anchor.id=any(public.post_ancestor_ids(r.id)))) or
 (w.scope_type='pdf_chapter' and anchor.deleted_at is null and anchor.status not in ('superseded','rejected') and public.requirement_chapter_key(anchor)=public.requirement_chapter_key(r)) or
 (w.scope_type='chapter' and (r.value_json->>'postNumber'=w.scope_value or starts_with(r.value_json->>'postNumber',w.scope_value||'.'))) or
 (w.scope_type='group' and r.category=w.scope_value))
 order by case w.scope_type when 'post' then 5 when 'main_post' then 4 when 'pdf_chapter' then 3 when 'chapter' then 2 else 1 end desc,
 case when w.scope_type='main_post' then coalesce(array_position(public.post_ancestor_ids(r.id),anchor.id),0) else 0 end,
 length(w.scope_value) desc,w.id limit 1;
$$;

create or replace function public.assign_project_work(pid uuid,changes jsonb) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; e jsonb; r public.project_requirements; w public.project_work_packages; saved public.project_work_packages;
 did uuid; uid uuid; lead uuid; scope text; kind text; v_due date; manager boolean; recipients uuid[]:='{}'; recipient uuid; n integer; assignment_mode text;
begin
 select * into p from public.projects where id=pid for update;
 if not public.pm_enabled(pid) or not public.can_access_project(pid) then raise exception 'Project access denied' using errcode='42501'; end if;
 manager:=public.is_delivery_manager(pid);
 if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) not between 1 and 500 then raise exception 'Select 1 to 500 assignments' using errcode='22023'; end if;
 perform public.pm_capture_deadlines(pid);
 for e in select value from jsonb_array_elements(changes) loop
 assignment_mode:=coalesce(e->>'assignment_mode','explicit');
 if assignment_mode not in ('explicit','unassigned','inherit') then raise exception 'Invalid assignment mode' using errcode='22023'; end if;
 kind:=e->>'scope_type'; scope:=e->>'scope_value'; did:=(e->>'department_id')::uuid;
 if coalesce(kind,'') not in ('post','pdf_chapter','main_post') then raise exception 'Invalid scope' using errcode='22023'; end if;
 select * into r from public.project_requirements where id=scope::uuid and project_id=pid and deleted_at is null and status<>'superseded';
 if not found then raise exception 'Post not found' using errcode='22023'; end if;
 if kind='main_post' and (public.post_needs_hierarchy_review(r.id) or public.post_is_source_chapter(r)) then raise exception 'Verified main post required' using errcode='22023'; end if;
 if kind='pdf_chapter' and coalesce(btrim(r.value_json#>>'{sourceChapter,title}'),'')='' then raise exception 'Verified PDF chapter required' using errcode='22023'; end if;
 if kind='pdf_chapter' then
 select cw.scope_value into scope from public.project_work_packages cw join public.project_requirements a on a.id::text=cw.scope_value where cw.project_id=pid and cw.scope_type=kind and a.deleted_at is null and a.status<>'superseded' and public.requirement_chapter_key(a)=public.requirement_chapter_key(r) order by cw.id limit 1;
 if scope is null then select min(a.id::text) into scope from public.project_requirements a where a.project_id=pid and a.deleted_at is null and a.status<>'superseded' and public.requirement_chapter_key(a)=public.requirement_chapter_key(r); end if;
 end if;
 select * into w from public.project_work_packages where project_id=pid and scope_type=kind and scope_value=scope;
 if coalesce(w.revision,-1) is distinct from (e->>'revision')::bigint then raise exception 'Assignment changed; reload' using errcode='40001'; end if;
 if assignment_mode in ('unassigned','inherit') then
 if not manager then raise exception 'Manager access required to clear an assignment' using errcode='42501'; end if;
 insert into public.project_work_packages(project_id,organization_id,scope_type,scope_value,assigned_to,department_id,due_date,assignment_mode)
 values(pid,p.organization_id,kind,scope,null,null,w.due_date,assignment_mode)
 on conflict(project_id,scope_type,scope_value) do update set assigned_to=null,department_id=null,assignment_mode=excluded.assignment_mode,revision=project_work_packages.revision+1,updated_at=now() returning * into saved;
 perform public.write_audit_log(p.organization_id,'project.department_assignment','project_work_package',saved.id,to_jsonb(w),to_jsonb(saved),'{}');
 continue;
 end if;
 select supervisor_id into lead from public.project_work_departments where project_id=pid and department_id=did;
 if lead is null then raise exception 'Choose a project department' using errcode='22023'; end if;
 if manager then
 -- Managers distribute to supervisors. Changing only the deadline preserves the employee assignment.
 uid:=case when e->>'operation'='deadline' and w.id is not null then w.assigned_to else lead end;
 if e->>'operation'='deadline' and (w.id is null or w.department_id is distinct from did) then raise exception 'Assign work before changing its deadline' using errcode='22023'; end if;
 v_due:=nullif(e->>'due_date','')::date;
 else
 if not public.pm_is_supervisor(pid,did) then raise exception 'Department supervisor required' using errcode='42501'; end if;
 if (kind='pdf_chapter' and (w.id is null or w.department_id is distinct from did)) or (kind in ('post','main_post') and not exists(select 1 from public.project_work_packages current_w where current_w.id=public.work_package_for_requirement(r.id) and current_w.department_id=did)) then raise exception 'Department scope denied' using errcode='42501'; end if;
 if kind='main_post' and exists(select 1 from public.project_requirements child
 where child.project_id=pid and child.deleted_at is null and child.status not in ('superseded','rejected') and r.id=any(public.post_ancestor_ids(child.id))
 and not exists(select 1 from public.project_work_packages cw where cw.id=public.work_package_for_requirement(child.id) and cw.department_id=did))
 then raise exception 'Department scope denied' using errcode='42501'; end if;
 if e ? 'due_date' then raise exception 'Only managers set deadlines' using errcode='42501'; end if;
 uid:=(e->>'assigned_to')::uuid; v_due:=w.due_date;
 end if;
 if not public.pm_in_department(pid,did,uid) then raise exception 'Active member of the department required' using errcode='22023'; end if;
 insert into public.project_work_packages(project_id,organization_id,scope_type,scope_value,assigned_to,department_id,due_date,assignment_mode)
 values(pid,p.organization_id,kind,scope,uid,did,v_due,assignment_mode)
 on conflict(project_id,scope_type,scope_value) do update set assignment_mode=excluded.assignment_mode,assigned_to=excluded.assigned_to,department_id=excluded.department_id,due_date=excluded.due_date,revision=project_work_packages.revision+1,updated_at=now() returning * into saved;
 recipients:=array_append(recipients,uid);
 perform public.write_audit_log(p.organization_id,'project.department_assignment','project_work_package',saved.id,to_jsonb(w),to_jsonb(saved),'{}');
 end loop;
 perform public.pm_capture_deadlines(pid);
 for recipient in select distinct unnest(recipients) loop
 select count(*) into n from unnest(recipients) x where x=recipient;
 perform public.pm_notify(pid,null,array[recipient],'assignment',format('%s tildelinger er oppdatert',n),n);
 end loop;
end $$;

-- Keep revision tombstones for inherited assignments; deleting an override must
-- not reset optimistic concurrency and allow an old request to resurrect it.
alter function public.read_project_management(uuid) rename to read_project_management_before_hierarchy;
revoke all on function public.read_project_management_before_hierarchy(uuid) from public,anon,authenticated;
create function public.read_project_management(pid uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb; posts jsonb;
begin
 result:=public.read_project_management_before_hierarchy(pid);
 select coalesce(jsonb_agg(item.value || jsonb_build_object(
 'sourcePage',to_jsonb(r)->'source_page','sourceOrder',r.value_json->'sourceOrder',
 'documentId',coalesce(r.source_technical_description_document_id,r.source_document_id),
 'chapterKey',public.requirement_chapter_key(r),'assignmentMode',w.assignment_mode,
 'hierarchyReview',public.post_needs_hierarchy_review(r.id),
 'mainPost',case when main.id is not null then jsonb_build_object('id',main.id,'number',main.value_json->>'postNumber','title',left(coalesce(main.value_text,''),200),'standalone',main.id=r.id) else null end,
 'measurement',jsonb_build_object('unit',r.value_json->'unit','quantity',r.value_json->'quantity','pdfColumnValues',r.value_json->'pdfColumnValues','quantityText',r.value_json->'quantityText'),
 'sourceChapter',r.value_json->'sourceChapter'
 ) order by coalesce((to_jsonb(r)->>'source_page')::int,0),item.ordinality),'[]'::jsonb) into posts
 from jsonb_array_elements(result->'posts') with ordinality item(value,ordinality)
 join public.project_requirements r on r.id::text=item.value->>'id'
 left join public.project_requirements main on main.id=public.post_main_id(r.id)
 left join public.project_work_packages w on w.id=public.work_package_for_requirement(r.id);
 result:=jsonb_set(result,'{assignments}',coalesce((select jsonb_agg(item.value || case when w.scope_type='pdf_chapter' then jsonb_build_object('chapter_key',public.requirement_chapter_key(a)) else '{}'::jsonb end)
 from jsonb_array_elements(result->'assignments') item(value) join public.project_work_packages w on w.id::text=item.value->>'id'
 left join public.project_requirements a on a.id::text=w.scope_value and a.project_id=pid),'[]'::jsonb));
 return jsonb_set(result,'{posts}',posts);
end $$;
revoke all on function public.post_hierarchy_scope(public.project_requirements),public.post_is_source_chapter(public.project_requirements),public.post_parent_id(uuid),public.post_ancestor_ids(uuid),public.post_needs_hierarchy_review(uuid),public.post_main_id(uuid) from public,anon,authenticated;
revoke all on function public.read_project_management(uuid) from public,anon;
grant execute on function public.read_project_management(uuid) to authenticated;

create or replace function public.save_legacy_work_package(pid uuid,payload jsonb,expected_revision bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; saved public.project_work_packages; target public.project_requirements;
  wid uuid; assignee uuid; scope_kind text; scope text;
begin
  if not public.is_delivery_manager(pid) then raise exception 'Manager access required' using errcode='42501'; end if;
  select * into p from public.projects where id=pid for update;
  assignee:=(payload->>'assigned_to')::uuid;
  wid:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
  scope_kind:=payload->>'scope_type'; scope:=btrim(payload->>'scope_value');
  if not exists(select 1 from public.organization_members m where m.organization_id=p.organization_id and m.user_id=assignee and m.status='active') then
    raise exception 'Active organization member required' using errcode='22023'; end if;
  if scope_kind not in ('chapter','group','pdf_chapter','main_post','post') or scope is null or length(scope) not between 1 and 160 then
    raise exception 'Invalid assignment scope' using errcode='22023'; end if;
  if scope_kind='main_post' and public.post_needs_hierarchy_review(scope::uuid) then raise exception 'Verified main post required' using errcode='22023'; end if;
  if scope_kind='chapter' and scope !~ '^\d+(\.\d+)*$' then raise exception 'Invalid chapter' using errcode='22023'; end if;
  if scope_kind in ('post','pdf_chapter','main_post') then
    select * into target from public.project_requirements r where r.id::text=scope and r.project_id=pid and r.deleted_at is null and r.status<>'superseded';
    if not found then raise exception 'Post does not belong to this project' using errcode='22023'; end if;
    if scope_kind='pdf_chapter' then
      -- Reuse an existing anchor even when newly imported rows sort before it.
      select w.scope_value into scope from public.project_work_packages w join public.project_requirements r on r.id::text=w.scope_value
        where w.project_id=pid and w.scope_type='pdf_chapter' and r.project_id=pid and r.deleted_at is null and r.status<>'superseded'
          and public.requirement_chapter_key(r)=public.requirement_chapter_key(target) order by w.id limit 1;
      if not found then
        select min(r.id::text) into scope from public.project_requirements r where r.project_id=pid and r.deleted_at is null and r.status<>'superseded'
          and public.requirement_chapter_key(r)=public.requirement_chapter_key(target);
      end if;
    end if;
  end if;
  if exists(select 1 from public.project_work_packages where id=wid) then
    update public.project_work_packages set assigned_to=assignee,due_date=nullif(payload->>'due_date','')::date,note=coalesce(payload->>'note',''),revision=revision+1,updated_at=now()
    where id=wid and project_id=pid and revision=expected_revision and scope_type=scope_kind and scope_value=scope returning * into saved;
    if not found then raise exception 'Assignment changed; reload' using errcode='40001'; end if;
  else
    if payload->>'id' is not null then raise exception 'Assignment changed; reload' using errcode='40001'; end if;
    if exists(select 1 from public.project_work_packages where project_id=pid and scope_type=scope_kind and scope_value=scope) then
      raise exception 'Assignment changed; reload' using errcode='40001'; end if;
    insert into public.project_work_packages(project_id,organization_id,scope_type,scope_value,assigned_to,due_date,note)
      values(pid,p.organization_id,scope_kind,scope,assignee,nullif(payload->>'due_date','')::date,coalesce(payload->>'note','')) returning * into saved;
  end if;
  update public.projects set assignments_enforced=true where id=pid;
  insert into public.project_members(project_id,organization_member_id,project_role,organization_id,user_id,role,status)
    select pid,m.id,'editor',p.organization_id,assignee,'editor','active' from public.organization_members m
    where m.organization_id=p.organization_id and m.user_id=assignee and m.status='active'
    on conflict(project_id,user_id) do update set role=case when project_members.role='project_manager' then 'project_manager' else 'editor' end,status='active';
  perform public.write_audit_log(p.organization_id,'project.assignment_saved','project_work_package',saved.id,null,null,to_jsonb(saved));
  return to_jsonb(saved);
end $$;

-- Department users need the ancestor labels of their own products, including
-- when a product override belongs to a different department than its parent.
-- Raw sibling text, quantities, choices and workflow data are never projected.
create function public.read_post_hierarchy_context(pid uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not public.can_access_project(pid) then raise exception 'Project access denied' using errcode='42501'; end if;
 if not public.pm_enabled(pid) or public.is_delivery_manager(pid) then return '[]'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'value_text',left(coalesce(a.value_text,''),200),
 'source_document_id',a.source_document_id,'source_technical_description_document_id',a.source_technical_description_document_id,
 'source_page',to_jsonb(a)->'source_page','status',a.status,'contextOnly',true,
 'value_json',jsonb_build_object('postNumber',a.value_json->'postNumber','sourcePostId',a.value_json->'sourcePostId',
 'parentRequirementId',a.value_json->'parentRequirementId','parentSourcePostId',a.value_json->'parentSourcePostId','parentPostNumber',a.value_json->'parentPostNumber',
 'postScope',a.value_json->'postScope','sourceOrder',a.value_json->'sourceOrder','sourceChapter',a.value_json->'sourceChapter',
 'chapterInformation',a.value_json->'chapterInformation')))
 from public.project_requirements a where a.project_id=pid and a.id in (
 select unnest(public.post_ancestor_ids(r.id)) from public.project_requirements r where r.project_id=pid and r.deleted_at is null and r.status not in ('superseded','rejected') and public.pm_can_read(r.id))),'[]');
end $$;
revoke all on function public.read_post_hierarchy_context(uuid) from public,anon;
grant execute on function public.read_post_hierarchy_context(uuid) to authenticated;
do $$ begin
 if to_regclass('public.document_pages') is not null then
 execute 'create policy pm_chapter_raw_pages on public.document_pages as restrictive for select to authenticated using(public.pm_full_project_read(project_id))';
 end if;
end $$;
