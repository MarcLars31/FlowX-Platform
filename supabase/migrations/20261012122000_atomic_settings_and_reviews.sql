-- Atomic settings writes preserve omitted fields; stale review edits are rejected.
create function public.update_project_settings_atomic(requested_project_id uuid,patch jsonb,preferences jsonb default '{}'::jsonb)
returns public.projects language plpgsql security invoker set search_path=pg_catalog as $$
declare original public.projects; changed public.projects; manufacturer text; distributor text;
begin
 select * into original from public.projects where id=requested_project_id and deleted_at is null for update;
 if not found or not public.has_permission(original.organization_id,'project.update') then raise exception 'Project update denied' using errcode='42501'; end if;
 if jsonb_typeof(patch)<>'object' or jsonb_typeof(preferences)<>'object' or exists(select 1 from jsonb_object_keys(patch) k where k not in ('name','project_number','description','customer_name','end_customer','address','country','standard','system_type','supplier','project_type','procurement_strategy','currency','delivery_country','warehouse_location','internal_comments','status','current_stage','expected_start_date','expected_delivery_date','technical_parameters'))
 or exists(select 1 from jsonb_object_keys(preferences) k where k not in ('manufacturer','distributor')) then raise exception 'Invalid settings' using errcode='22023'; end if;
 changed:=jsonb_populate_record(original,patch);
 update public.projects set name=changed.name,
 project_number=changed.project_number,
 description=changed.description,
 customer_name=changed.customer_name,
 end_customer=changed.end_customer,
 address=changed.address,
 country=changed.country,
 standard=changed.standard,
 system_type=changed.system_type,
 supplier=changed.supplier,
 project_type=changed.project_type,
 procurement_strategy=changed.procurement_strategy,
 currency=changed.currency,
 delivery_country=changed.delivery_country,
 warehouse_location=changed.warehouse_location,
 internal_comments=changed.internal_comments,
 status=changed.status,
 current_stage=changed.current_stage,
 expected_start_date=changed.expected_start_date,
 expected_delivery_date=changed.expected_delivery_date,
 technical_parameters=changed.technical_parameters where id=original.id returning * into changed;
 if preferences<>'{}'::jsonb then
  manufacturer:=case when preferences?'manufacturer' then preferences->>'manufacturer' else changed.supplier end;
  if preferences?'distributor' then distributor:=preferences->>'distributor';
  else select supplier_name into distributor from public.project_supplier_options where project_id=original.id and supplier_kind='distributor' and selection_role='preferred'; end if;
  perform public.set_project_supplier_preferences(original.id,manufacturer,distributor,changed.currency,changed.delivery_country,changed.warehouse_location);
 end if;
 select * into changed from public.projects where id=original.id;
 return changed;
end; $$;
revoke all on function public.update_project_settings_atomic(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.update_project_settings_atomic(uuid,jsonb,jsonb) to authenticated;

create function public.update_organization_settings_atomic(requested_organization_id uuid,patch jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare organization_row public.organizations; subscription_row public.organization_subscriptions; retention integer;
begin
 if auth.uid() is null or jsonb_typeof(patch)<>'object' or exists(select 1 from jsonb_object_keys(patch) k where k not in ('name','organization_number','retention_days')) then raise exception 'Invalid settings' using errcode='22023'; end if;
 if patch?'retention_days' then
  if not public.has_permission(requested_organization_id,'subscription.manage') then raise exception 'Retention update denied' using errcode='42501'; end if;
  if jsonb_typeof(patch->'retention_days') not in ('number','null') then raise exception 'Invalid retention' using errcode='22023'; end if;
  retention:=(patch->>'retention_days')::integer;
  if retention<0 or retention>3650 or (patch->>'retention_days')::numeric is distinct from retention::numeric then raise exception 'Invalid retention' using errcode='22023'; end if;
 end if;
 if patch?'name' or patch?'organization_number' then
  if not public.has_permission(requested_organization_id,'organization.update') then raise exception 'Organization update denied' using errcode='42501'; end if;
  update public.organizations set name=case when patch?'name' then patch->>'name' else name end,
   organization_number=case when patch?'organization_number' then patch->>'organization_number' else organization_number end
   where id=requested_organization_id returning * into organization_row;
  if not found then raise exception 'Organization update denied' using errcode='42501'; end if;
 end if;
 if patch?'retention_days' then
  update public.organization_subscriptions set retention_days=retention where organization_id=requested_organization_id returning * into subscription_row;
  if not found then raise exception 'Subscription missing' using errcode='P0002'; end if;
 end if;
 return jsonb_build_object('organization',to_jsonb(organization_row),'subscription',jsonb_build_object('retention_days',subscription_row.retention_days));
end; $$;
revoke all on function public.update_organization_settings_atomic(uuid,jsonb) from public,anon;
grant execute on function public.update_organization_settings_atomic(uuid,jsonb) to authenticated;

create function public.review_project_requirement(requested_project_id uuid,requested_requirement_id uuid,expected_revision bigint,patch jsonb)
returns public.project_requirements language plpgsql security invoker set search_path=pg_catalog as $$
declare original public.project_requirements; changed public.project_requirements;
begin
 select * into original from public.project_requirements where id=requested_requirement_id and project_id=requested_project_id and deleted_at is null for update;
 if not found or not public.has_permission(original.organization_id,'project.requirement.update') or not public.can_edit_project_requirement(original.id) then raise exception 'Requirement update denied' using errcode='42501'; end if;
 if expected_revision is null or original.edit_revision<>expected_revision then raise exception 'The post has changed. Reload before saving.' using errcode='40001'; end if;
 if jsonb_typeof(patch)<>'object' or exists(select 1 from jsonb_object_keys(patch) k where k not in ('status','value_text','certainty','reviewer_comment')) then raise exception 'Invalid review' using errcode='22023'; end if;
 changed:=jsonb_populate_record(original,patch);
 update public.project_requirements set status=changed.status,value_text=changed.value_text,certainty=changed.certainty,
 reviewer_comment=changed.reviewer_comment,reviewed_by=auth.uid(),reviewed_at=now() where id=original.id returning * into changed;
 return changed;
end; $$;
revoke all on function public.review_project_requirement(uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.review_project_requirement(uuid,uuid,bigint,jsonb) to authenticated;

alter function public.permanently_delete_project(uuid,text) rename to permanently_delete_project_v1;
revoke all on function public.permanently_delete_project_v1(uuid,text) from public,anon,authenticated,service_role;
create function public.permanently_delete_project(requested_project_id uuid,requested_confirmation text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare project public.projects; retention integer;
begin
 select * into project from public.projects where id=requested_project_id for update;
 if auth.uid() is null or project.id is null or not public.has_organization_role(project.organization_id,'organization_owner')
 or not public.has_permission(project.organization_id,'project.permanent_delete') then raise exception 'Deletion denied' using errcode='42501'; end if;
 select retention_days into retention from public.organization_subscriptions where organization_id=project.organization_id;
 if project.deleted_at+coalesce(retention,0)*interval '1 day'>now() then raise exception 'Retention period has not elapsed' using errcode='55000'; end if;
 return public.permanently_delete_project_v1(requested_project_id,requested_confirmation);
end; $$;
revoke all on function public.permanently_delete_project(uuid,text) from public,anon;
grant execute on function public.permanently_delete_project(uuid,text) to authenticated;

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
 if not public.is_delivery_manager(pid) and (rid is null or not public.can_edit_project_requirement(rid)) then raise exception 'This post is assigned to another person' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.project_id is distinct from old.project_id or new.organization_id is distinct from old.organization_id) then raise exception 'Project scope is immutable' using errcode='42501'; end if;
 if tg_op='UPDATE' and tg_table_name<>'project_requirements' then
   if new.requirement_id is distinct from old.requirement_id and not public.can_edit_project_requirement(new.requirement_id) then raise exception 'Post scope denied' using errcode='42501'; end if;
 end if;
 return coalesce(new,old);
end $$;
