-- Delivery review, scoped editing and explicit document activation. Existing
-- projects retain their edit policy until a manager creates the first assignment.
alter table public.projects add column if not exists assignments_enforced boolean not null default false;
create table public.project_work_packages (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 organization_id uuid not null references public.organizations(id), scope_type text not null check(scope_type in ('chapter','group')),
 scope_value text not null check(length(scope_value) between 1 and 160), assigned_to uuid not null references auth.users(id),
 due_date date, note text not null default '' check(length(note)<=2000), revision bigint not null default 0,
 created_by uuid not null default auth.uid() references auth.users(id), updated_at timestamptz not null default now(),
 unique(project_id,scope_type,scope_value)
);
create table public.project_post_workflows (
 requirement_id uuid primary key references public.project_requirements(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, organization_id uuid not null references public.organizations(id),
 review jsonb not null default '{}' check(jsonb_typeof(review)='object' and octet_length(review::text)<100000),
 revision bigint not null default 0, product_revision bigint not null, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table public.project_document_controls (
 document_id uuid primary key references public.technical_description_documents(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, organization_id uuid not null references public.organizations(id),
 role text not null default 'specification' check(role in ('specification','offer','quantity','reference')),
 revision_label text not null default '' check(length(revision_label)<=120),
 state text not null default 'pending' check(state in ('pending','active','superseded')),
 replaces_document_id uuid references public.technical_description_documents(id), revision bigint not null default 0,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 check(document_id is distinct from replaces_document_id)
);
create index on public.project_work_packages(project_id,assigned_to);
create index on public.project_post_workflows(project_id);
create index on public.project_document_controls(project_id,state);

create function public.is_delivery_manager(pid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and public.can_access_project(pid) and exists(select 1 from public.projects p where p.id=pid and public.has_permission(p.organization_id,'project.update') and
 (public.is_organization_admin(p.organization_id) or auth.uid() in (p.owner_user_id,p.owner_id,p.created_by) or exists(select 1 from public.project_members m where m.project_id=pid and m.user_id=auth.uid() and m.status='active' and m.role='project_manager')));
$$;
create function public.work_package_for_requirement(rid uuid) returns uuid language sql stable security definer set search_path=pg_catalog as $$
 select w.id from public.project_requirements r join public.project_work_packages w on w.project_id=r.project_id
 where r.id=rid and public.can_access_project(r.project_id) and
 ((w.scope_type='chapter' and (r.value_json->>'postNumber'=w.scope_value or left(r.value_json->>'postNumber',length(w.scope_value)+1)=w.scope_value||'.'))
 or (w.scope_type='group' and r.category=w.scope_value))
 order by (w.scope_type='chapter') desc,length(w.scope_value) desc,w.id limit 1;
$$;
create function public.can_edit_project_requirement(rid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from public.project_requirements r join public.projects p on p.id=r.project_id
 where r.id=rid and r.deleted_at is null and r.status<>'superseded' and public.can_access_project(p.id)
 and (public.is_delivery_manager(p.id) or (public.has_permission(p.organization_id,'project.product_suggestion.create')
 and not exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=auth.uid() and (m.status<>'active' or m.role='viewer'))
 and (not p.assignments_enforced or exists(select 1 from public.project_work_packages w join public.organization_members m on m.user_id=w.assigned_to and m.organization_id=p.organization_id and m.status='active'
 where w.id=public.work_package_for_requirement(r.id) and w.assigned_to=auth.uid()
 and exists(select 1 from public.project_members pm where pm.project_id=p.id and pm.user_id=auth.uid() and pm.status='active' and pm.role in ('editor','reviewer','project_manager')))))));
$$;

-- Triggers also protect existing SECURITY DEFINER product-choice functions and
-- direct REST writes; UI hiding alone is not an authorization boundary.
create function public.guard_requirement_assignment() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
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
 if not public.is_delivery_manager(pid) and (rid is null or not public.can_edit_project_requirement(rid)) then raise exception 'This post is assigned to another person' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.project_id is distinct from old.project_id or new.organization_id is distinct from old.organization_id) then raise exception 'Project scope is immutable' using errcode='42501'; end if;
 if tg_op='UPDATE' and tg_table_name<>'project_requirements' then
   if new.requirement_id is distinct from old.requirement_id and not public.can_edit_project_requirement(new.requirement_id) then raise exception 'Post scope denied' using errcode='42501'; end if;
 end if;
 return coalesce(new,old);
end $$;
create trigger delivery_requirement_guard before insert or update or delete on public.project_requirements for each row execute function public.guard_requirement_assignment();
create trigger delivery_product_guard before insert or update or delete on public.project_product_suggestions for each row execute function public.guard_requirement_assignment();
create trigger delivery_comment_guard before insert or update or delete on public.product_post_comments for each row execute function public.guard_requirement_assignment();

create function public.guard_assigned_project_settings() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is not null and old.assignments_enforced and not public.is_delivery_manager(old.id)
 and ((to_jsonb(new)-'current_stage'-'updated_at') is distinct from (to_jsonb(old)-'current_stage'-'updated_at') or (new.current_stage='completed' and old.current_stage is distinct from new.current_stage)) then
   raise exception 'Only the project manager can change project settings' using errcode='42501';
 end if;
 if (new.status='completed' and old.status is distinct from new.status or new.current_stage='completed' and old.current_stage is distinct from new.current_stage)
 and (old.assignments_enforced or exists(select 1 from public.project_post_workflows where project_id=old.id))
 and exists(select 1 from public.project_product_suggestions s join public.project_requirements r on r.id=s.requirement_id
 left join public.project_post_workflows w on w.requirement_id=r.id
 where s.project_id=old.id and s.status='selected' and r.deleted_at is null and r.status<>'superseded'
 and (w.requirement_id is null or w.review->>'state' is distinct from 'ready' or w.product_revision<>r.edit_revision)) then
   raise exception 'Complete the delivery reviews before finishing the project' using errcode='PDC01';
 end if;
 return new;
end $$;
create trigger delivery_project_settings_guard before update on public.projects for each row execute function public.guard_assigned_project_settings();

create function public.save_work_package(pid uuid, payload jsonb, expected_revision bigint default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects; saved public.project_work_packages; wid uuid; assignee uuid;
begin
 if not public.is_delivery_manager(pid) then raise exception 'Manager access required' using errcode='42501'; end if;
 select * into p from public.projects where id=pid for update;
 assignee:=(payload->>'assigned_to')::uuid; wid:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 if not exists(select 1 from public.organization_members m where m.organization_id=p.organization_id and m.user_id=assignee and m.status='active') then raise exception 'Active organization member required' using errcode='22023'; end if;
 if payload->>'scope_type'='chapter' and payload->>'scope_value' !~ '^\d+(\.\d+)*$' then raise exception 'Invalid chapter' using errcode='22023'; end if;
 if exists(select 1 from public.project_work_packages where id=wid) then
   update public.project_work_packages set assigned_to=assignee,due_date=nullif(payload->>'due_date','')::date,note=coalesce(payload->>'note',''),revision=revision+1,updated_at=now()
   where id=wid and project_id=pid and revision=expected_revision returning * into saved;
   if not found then raise exception 'Assignment changed; reload' using errcode='40001'; end if;
 else
   insert into public.project_work_packages(project_id,organization_id,scope_type,scope_value,assigned_to,due_date,note)
   values(pid,p.organization_id,payload->>'scope_type',btrim(payload->>'scope_value'),assignee,nullif(payload->>'due_date','')::date,coalesce(payload->>'note','')) returning * into saved;
 end if;
 update public.projects set assignments_enforced=true where id=pid;
 -- Assignees can view the complete project, including restricted projects.
 insert into public.project_members(project_id,organization_member_id,project_role,organization_id,user_id,role,status)
 select pid,m.id,'editor',p.organization_id,assignee,'editor','active' from public.organization_members m where m.organization_id=p.organization_id and m.user_id=assignee and m.status='active'
 on conflict(project_id,user_id) do update set role=case when project_members.role='project_manager' then 'project_manager' else 'editor' end,status='active';
 perform public.write_audit_log(p.organization_id,'project.assignment_saved','project_work_package',saved.id,null,null,to_jsonb(saved));
 return to_jsonb(saved);
end $$;

create function public.save_post_delivery(pid uuid,rid uuid,expected_revision bigint,expected_product_revision bigint,payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r public.project_requirements; saved public.project_post_workflows; part jsonb; selection jsonb; selected_numbers text[]; actual_quantity numeric; actual_unit text;
begin
 if not public.can_edit_project_requirement(rid) then raise exception 'Post edit denied' using errcode='42501'; end if;
 select * into r from public.project_requirements where id=rid and project_id=pid for update;
 if not found or r.edit_revision<>expected_product_revision then raise exception 'Product post changed; reload' using errcode='40001'; end if;
 if payload->>'state' not in ('draft','ready') or jsonb_typeof(payload->'components') is distinct from 'array' or jsonb_typeof(payload->'deviations') is distinct from 'array' or jsonb_typeof(payload->'alternatives') is distinct from 'array' or jsonb_typeof(payload->'calculations') is distinct from 'array' then raise exception 'Invalid delivery review' using errcode='22023'; end if;
 select product_snapshot into selection from public.project_product_suggestions where requirement_id=rid and project_id=pid and status='selected' order by updated_at desc limit 1;
 select array_agg(item->>'productNumber') into selected_numbers from jsonb_array_elements(coalesce(selection->'accessories','[]')) item;
 if payload->>'state'='ready' then
   if selection is null then raise exception 'Save the product choice first' using errcode='22023'; end if;
   for part in select * from jsonb_array_elements(payload->'components') loop
     if part->>'status' not in ('missing','included','separate','excluded') or (part->>'status'='missing' and coalesce((part->>'optional')::boolean,false)=false)
       or (part->>'status' in ('included','excluded') and coalesce(btrim(part->>'note'),'')='')
       or (part->>'status'='separate' and not coalesce(part->>'productNumber'=any(selected_numbers),false)) then raise exception 'Unresolved delivery component' using errcode='22023'; end if;
   end loop;
   for part in select * from jsonb_array_elements(payload->'deviations') loop
     if part->>'decision' not in ('accepted','rejected') or coalesce(btrim(part->>'owner'),'')='' or coalesce(btrim(part->>'reason'),'')='' then raise exception 'Unresolved deviation' using errcode='22023'; end if;
   end loop;
   for part in select * from jsonb_array_elements(payload->'calculations') loop
     if part->>'reviewed' is distinct from 'true' or coalesce(btrim(part->>'source'),'')='' or (part->>'base')::numeric<=0 or (part->>'factor')::numeric<=0 then raise exception 'Unreviewed quantity calculation' using errcode='22023'; end if;
     if part->>'target'=selection->>'productNumber' then
       actual_quantity:=coalesce((selection->'orderQuantity'->>'quantity')::numeric,(r.value_json->>'quantity')::numeric);
       actual_unit:=coalesce(selection->'orderQuantity'->>'unit',r.value_json->>'unit');
     else
       select (a->>'quantity')::numeric,a->>'unit' into actual_quantity,actual_unit from jsonb_array_elements(coalesce(selection->'accessories','[]')) a where a->>'productNumber'=part->>'target' and a->>'quantityBasis'='total';
     end if;
     if actual_quantity is null or abs(actual_quantity-(part->>'base')::numeric*(part->>'factor')::numeric)>0.000001 or actual_unit is distinct from part->>'unit' then raise exception 'Apply and save the calculated quantity first' using errcode='22023'; end if;
   end loop;
 end if;
 insert into public.project_post_workflows(requirement_id,project_id,organization_id,review,product_revision,updated_by)
 values(rid,pid,r.organization_id,payload,r.edit_revision,auth.uid()) on conflict(requirement_id) do update set review=excluded.review,product_revision=excluded.product_revision,revision=project_post_workflows.revision+1,updated_by=auth.uid(),updated_at=now()
 where project_post_workflows.revision=expected_revision returning * into saved;
 if not found or (saved.revision=0 and expected_revision<>-1) then raise exception 'Delivery review changed; reload' using errcode='40001'; end if;
 perform public.write_audit_log(r.organization_id,'project.delivery_review_saved','project_requirement',rid,null,null,jsonb_build_object('state',payload->>'state','revision',saved.revision));
 return to_jsonb(saved);
end $$;

-- All old documents remain active. Newly added documents await classification
-- and activation, so a revised PDF cannot silently duplicate an offer.
insert into public.project_document_controls(document_id,project_id,organization_id,state)
select id,project_id,organization_id,'active' from public.technical_description_documents where project_id is not null;
create function public.register_delivery_document() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.project_id is not null then
   perform 1 from public.projects where id=new.project_id for update;
   insert into public.project_document_controls(document_id,project_id,organization_id,state)
   values(new.id,new.project_id,new.organization_id,case when exists(select 1 from public.project_document_controls where project_id=new.project_id) then 'pending' else 'active' end);
 end if; return new;
end $$;
create trigger delivery_document_register after insert on public.technical_description_documents for each row execute function public.register_delivery_document();
create function public.stage_delivery_requirement() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from public.project_document_controls c where c.document_id=new.source_technical_description_document_id and (c.state<>'active' or c.role<>'specification')) then
   new.value_json:=coalesce(new.value_json,'{}')||jsonb_build_object('documentOriginalStatus',new.status); new.status:='superseded';
 end if; return new;
end $$;
create trigger delivery_requirement_staging before insert on public.project_requirements for each row execute function public.stage_delivery_requirement();

create function public.activate_delivery_document(pid uuid,did uuid,expected_revision bigint,payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare control public.project_document_controls; old_id uuid;
begin
 if not public.is_delivery_manager(pid) then raise exception 'Manager access required' using errcode='42501'; end if;
 perform 1 from public.projects where id=pid for update;
 select * into control from public.project_document_controls where document_id=did and project_id=pid for update;
 if not found or control.revision<>expected_revision then raise exception 'Document changed; reload' using errcode='40001'; end if;
 old_id:=nullif(payload->>'replaces_document_id','')::uuid;
 if old_id is not null and (old_id=did or not exists(select 1 from public.project_document_controls where document_id=old_id and project_id=pid and state='active')) then raise exception 'Invalid source revision' using errcode='22023'; end if;
 if not exists(select 1 from public.technical_description_documents d where d.id=did and d.status in ('extracted','review_required')) then raise exception 'Document extraction is not complete' using errcode='22023'; end if;
 if not exists(select 1 from public.project_documents p join public.technical_description_documents d on p.file_sha256=d.file_sha256 and p.project_id=d.project_id
   where d.id=did and p.project_id=pid and p.processing_status in ('completed','requires_review') and p.deleted_at is null) then raise exception 'Document extraction is still running' using errcode='22023'; end if;
 if old_id is not null then
   -- Product approvals belong to a specific source revision. Preserve them as
   -- rejected history; no alternative or old quantity enters the active export.
   update public.project_product_suggestions set status='rejected' where requirement_id in(select id from public.project_requirements where project_id=pid and source_technical_description_document_id=old_id) and status='selected';
   update public.project_requirements set status='superseded' where project_id=pid and source_technical_description_document_id=old_id;
   update public.project_document_controls set state='superseded',revision=revision+1,updated_at=now(),updated_by=auth.uid() where document_id=old_id;
 end if;
 if payload->>'role'<>'specification' then
   update public.project_product_suggestions set status='rejected' where requirement_id in(select id from public.project_requirements where project_id=pid and source_technical_description_document_id=did) and status='selected';
 end if;
 update public.project_requirements set status=case when payload->>'role'='specification' then 'extracted_unreviewed' else 'superseded' end
 where project_id=pid and source_technical_description_document_id=did;
 update public.project_document_controls set role=payload->>'role',state='active',revision_label=coalesce(payload->>'revision_label',''),replaces_document_id=old_id,revision=revision+1,updated_by=auth.uid(),updated_at=now() where document_id=did returning * into control;
 perform public.write_audit_log(control.organization_id,'project.document_activated','technical_description_document',did,null,null,to_jsonb(control));
 return to_jsonb(control);
end $$;

alter table public.project_work_packages enable row level security;
alter table public.project_post_workflows enable row level security;
alter table public.project_document_controls enable row level security;
create policy delivery_packages_read on public.project_work_packages for select to authenticated using(public.can_access_project(project_id));
create policy delivery_reviews_read on public.project_post_workflows for select to authenticated using(public.can_access_project(project_id));
create policy delivery_documents_read on public.project_document_controls for select to authenticated using(public.can_access_project(project_id));
revoke all on public.project_work_packages,public.project_post_workflows,public.project_document_controls from anon,authenticated;
grant select on public.project_work_packages,public.project_post_workflows,public.project_document_controls to authenticated;
-- Mutations only through the scoped, audited, optimistic-locking RPCs above.
revoke all on function public.is_delivery_manager(uuid),public.work_package_for_requirement(uuid),public.can_edit_project_requirement(uuid),public.save_work_package(uuid,jsonb,bigint),public.save_post_delivery(uuid,uuid,bigint,bigint,jsonb),public.activate_delivery_document(uuid,uuid,bigint,jsonb),public.guard_requirement_assignment(),public.register_delivery_document(),public.stage_delivery_requirement() from public,anon;
revoke all on function public.guard_assigned_project_settings() from public,anon;
grant execute on function public.is_delivery_manager(uuid),public.work_package_for_requirement(uuid),public.can_edit_project_requirement(uuid),public.save_work_package(uuid,jsonb,bigint),public.save_post_delivery(uuid,uuid,bigint,bigint,jsonb),public.activate_delivery_document(uuid,uuid,bigint,jsonb) to authenticated;
