-- Keep existing assignments while adding exact posts and document-scoped PDF chapters.
alter table public.project_work_packages drop constraint project_work_packages_scope_type_check;
alter table public.project_work_packages add constraint project_work_packages_scope_type_check
  check(scope_type in ('chapter','group','pdf_chapter','post'));

create function public.requirement_chapter_key(r public.project_requirements) returns text
language sql immutable set search_path=pg_catalog as $$
  select jsonb_build_array(
    coalesce(r.source_technical_description_document_id::text,r.source_document_id::text,''),
    lower(coalesce(nullif(regexp_replace(btrim(r.value_json#>>'{sourceChapter,title}'),'\s+',' ','g'),''),'Kapitel saknas i PDF'))
  )::text;
$$;
revoke all on function public.requirement_chapter_key(public.project_requirements) from public,anon,authenticated;

create or replace function public.work_package_for_requirement(rid uuid) returns uuid
language sql stable security definer set search_path=pg_catalog as $$
  select w.id from public.project_requirements r
  join public.project_work_packages w on w.project_id=r.project_id
  left join public.project_requirements anchor on w.scope_type='pdf_chapter' and anchor.id::text=w.scope_value and anchor.project_id=r.project_id
  where r.id=rid and public.can_access_project(r.project_id) and (
    (w.scope_type='post' and w.scope_value=r.id::text)
    or (w.scope_type='pdf_chapter' and anchor.deleted_at is null and anchor.status<>'superseded'
      and public.requirement_chapter_key(anchor)=public.requirement_chapter_key(r))
    or (w.scope_type='chapter' and (r.value_json->>'postNumber'=w.scope_value or left(r.value_json->>'postNumber',length(w.scope_value)+1)=w.scope_value||'.'))
    or (w.scope_type='group' and r.category=w.scope_value)
  ) order by case w.scope_type when 'post' then 4 when 'pdf_chapter' then 3 when 'chapter' then 2 else 1 end desc,
    length(w.scope_value) desc,w.id limit 1;
$$;

create or replace function public.save_work_package(pid uuid,payload jsonb,expected_revision bigint default null) returns jsonb
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
  if scope_kind not in ('chapter','group','pdf_chapter','post') or scope is null or length(scope) not between 1 and 160 then
    raise exception 'Invalid assignment scope' using errcode='22023'; end if;
  if scope_kind='chapter' and scope !~ '^\d+(\.\d+)*$' then raise exception 'Invalid chapter' using errcode='22023'; end if;
  if scope_kind in ('post','pdf_chapter') then
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
