alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.organization_seat_limits enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_documents enable row level security;
alter table public.analyses enable row level security;
alter table public.material_lists enable row level security;
alter table public.material_list_items enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_select_shared_organization on public.profiles;
create policy profiles_select_shared_organization
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members viewer
    join public.organization_members subject
      on subject.organization_id = viewer.organization_id
    where viewer.user_id = auth.uid()
      and viewer.status = 'active'
      and subject.user_id = profiles.id
      and subject.status = 'active'
      and public.has_permission(viewer.organization_id, 'member.view')
  )
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
on public.organizations
for select
to authenticated
using (public.is_organization_member(id));

drop policy if exists organizations_insert_platform_admin on public.organizations;
create policy organizations_insert_platform_admin
on public.organizations
for insert
to authenticated
with check (
  public.is_platform_admin()
  and created_by = auth.uid()
);

drop policy if exists organizations_update_authorized on public.organizations;
create policy organizations_update_authorized
on public.organizations
for update
to authenticated
using (public.has_permission(id, 'organization.update'))
with check (public.has_permission(id, 'organization.update'));

drop policy if exists permissions_select_authenticated on public.permissions;
create policy permissions_select_authenticated
on public.permissions
for select
to authenticated
using (true);

drop policy if exists roles_select_visible on public.roles;
create policy roles_select_visible
on public.roles
for select
to authenticated
using (
  organization_id is null
  or public.is_organization_member(organization_id)
);

drop policy if exists role_permissions_select_visible
  on public.role_permissions;
create policy role_permissions_select_visible
on public.role_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.roles role
    where role.id = role_permissions.role_id
      and (
        role.organization_id is null
        or public.is_organization_member(role.organization_id)
      )
  )
);

drop policy if exists organization_members_select_authorized
  on public.organization_members;
create policy organization_members_select_authorized
on public.organization_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_permission(organization_id, 'member.view')
);

drop policy if exists organization_subscriptions_select_authorized
  on public.organization_subscriptions;
create policy organization_subscriptions_select_authorized
on public.organization_subscriptions
for select
to authenticated
using (
  public.has_permission(organization_id, 'subscription.view')
);

drop policy if exists organization_seat_limits_select_authorized
  on public.organization_seat_limits;
create policy organization_seat_limits_select_authorized
on public.organization_seat_limits
for select
to authenticated
using (
  public.has_permission(organization_id, 'subscription.view')
);

drop policy if exists organization_invitations_select_authorized
  on public.organization_invitations;
create policy organization_invitations_select_authorized
on public.organization_invitations
for select
to authenticated
using (
  public.has_permission(organization_id, 'member.view')
  or public.has_permission(organization_id, 'member.invite')
);

drop policy if exists teams_select_authorized on public.teams;
create policy teams_select_authorized
on public.teams
for select
to authenticated
using (
  public.has_permission(organization_id, 'team.view')
  or public.is_team_member(id)
);

drop policy if exists teams_insert_authorized on public.teams;
create policy teams_insert_authorized
on public.teams
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.has_permission(organization_id, 'team.create')
);

drop policy if exists teams_update_authorized on public.teams;
create policy teams_update_authorized
on public.teams
for update
to authenticated
using (
  public.has_permission(organization_id, 'team.update')
)
with check (
  public.has_permission(organization_id, 'team.update')
);

drop policy if exists team_members_select_authorized on public.team_members;
create policy team_members_select_authorized
on public.team_members
for select
to authenticated
using (
  exists (
    select 1
    from public.teams team
    where team.id = team_members.team_id
      and public.has_permission(team.organization_id, 'team.view')
  )
);

drop policy if exists team_members_insert_authorized on public.team_members;
create policy team_members_insert_authorized
on public.team_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.teams team
    where team.id = team_members.team_id
      and public.has_permission(team.organization_id, 'team.manage_members')
  )
);

drop policy if exists team_members_update_authorized on public.team_members;
create policy team_members_update_authorized
on public.team_members
for update
to authenticated
using (
  exists (
    select 1
    from public.teams team
    where team.id = team_members.team_id
      and public.has_permission(team.organization_id, 'team.manage_members')
  )
)
with check (
  exists (
    select 1
    from public.teams team
    where team.id = team_members.team_id
      and public.has_permission(team.organization_id, 'team.manage_members')
  )
);

drop policy if exists team_members_delete_authorized on public.team_members;
create policy team_members_delete_authorized
on public.team_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.teams team
    where team.id = team_members.team_id
      and public.has_permission(team.organization_id, 'team.manage_members')
  )
);

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
  loop
    execute format(
      'drop policy if exists %I on public.projects',
      existing_policy.policyname
    );
  end loop;
end;
$$;

create policy projects_select_accessible
on public.projects
for select
to authenticated
using (
  public.can_access_project(id)
  or public.can_access_deleted_project(id)
);

drop policy if exists projects_insert_authorized on public.projects;
create policy projects_insert_authorized
on public.projects
for insert
to authenticated
with check (
  created_by = auth.uid()
  and owner_id = auth.uid()
  and deleted_at is null
  and public.has_permission(organization_id, 'project.create')
  and (
    team_id is null
    or exists (
      select 1
      from public.team_members team_member
      where team_member.team_id = projects.team_id
        and team_member.organization_member_id =
          public.current_organization_member_id(projects.organization_id)
    )
    or public.is_organization_admin(organization_id)
  )
);

drop policy if exists projects_update_authorized on public.projects;
create policy projects_update_authorized
on public.projects
for update
to authenticated
using (
  public.can_manage_project(id, 'project.update')
)
with check (
  deleted_at is null
  and public.has_permission(organization_id, 'project.update')
);

drop policy if exists project_members_select_accessible
  on public.project_members;
create policy project_members_select_accessible
on public.project_members
for select
to authenticated
using (public.can_access_project(project_id));

drop policy if exists project_members_insert_authorized
  on public.project_members;
create policy project_members_insert_authorized
on public.project_members
for insert
to authenticated
with check (
  public.can_manage_project(project_id, 'project.manage_members')
);

drop policy if exists project_members_update_authorized
  on public.project_members;
create policy project_members_update_authorized
on public.project_members
for update
to authenticated
using (
  public.can_manage_project(project_id, 'project.manage_members')
)
with check (
  public.can_manage_project(project_id, 'project.manage_members')
);

drop policy if exists project_members_delete_authorized
  on public.project_members;
create policy project_members_delete_authorized
on public.project_members
for delete
to authenticated
using (
  public.can_manage_project(project_id, 'project.manage_members')
);

drop policy if exists project_documents_select_accessible
  on public.project_documents;
create policy project_documents_select_accessible
on public.project_documents
for select
to authenticated
using (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'document.view')
);

drop policy if exists project_documents_insert_authorized
  on public.project_documents;
create policy project_documents_insert_authorized
on public.project_documents
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and public.can_access_project(project_id)
  and public.has_permission(organization_id, 'document.upload')
);

drop policy if exists project_documents_update_authorized
  on public.project_documents;
create policy project_documents_update_authorized
on public.project_documents
for update
to authenticated
using (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'document.delete')
)
with check (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'document.delete')
);

drop policy if exists analyses_select_accessible on public.analyses;
create policy analyses_select_accessible
on public.analyses
for select
to authenticated
using (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'analysis.view')
);

drop policy if exists analyses_insert_authorized on public.analyses;
create policy analyses_insert_authorized
on public.analyses
for insert
to authenticated
with check (
  requested_by = auth.uid()
  and public.can_access_project(project_id)
  and public.has_permission(organization_id, 'analysis.create')
);

drop policy if exists analyses_update_authorized on public.analyses;
create policy analyses_update_authorized
on public.analyses
for update
to authenticated
using (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'analysis.update')
)
with check (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'analysis.update')
);

drop policy if exists material_lists_select_accessible
  on public.material_lists;
create policy material_lists_select_accessible
on public.material_lists
for select
to authenticated
using (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'material_list.view')
);

drop policy if exists material_lists_insert_authorized
  on public.material_lists;
create policy material_lists_insert_authorized
on public.material_lists
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_project(project_id)
  and public.has_permission(organization_id, 'material_list.create')
);

drop policy if exists material_lists_update_authorized
  on public.material_lists;
create policy material_lists_update_authorized
on public.material_lists
for update
to authenticated
using (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'material_list.update')
)
with check (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'material_list.update')
);

drop policy if exists material_list_items_select_accessible
  on public.material_list_items;
create policy material_list_items_select_accessible
on public.material_list_items
for select
to authenticated
using (
  exists (
    select 1
    from public.material_lists material_list
    where material_list.id = material_list_items.material_list_id
      and public.can_access_project(material_list.project_id)
      and public.has_permission(
        material_list.organization_id,
        'material_list.view'
      )
  )
);

drop policy if exists material_list_items_insert_authorized
  on public.material_list_items;
create policy material_list_items_insert_authorized
on public.material_list_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.material_lists material_list
    where material_list.id = material_list_items.material_list_id
      and public.can_access_project(material_list.project_id)
      and public.has_permission(
        material_list.organization_id,
        'material_list.update'
      )
  )
);

drop policy if exists material_list_items_update_authorized
  on public.material_list_items;
create policy material_list_items_update_authorized
on public.material_list_items
for update
to authenticated
using (
  exists (
    select 1
    from public.material_lists material_list
    where material_list.id = material_list_items.material_list_id
      and public.can_access_project(material_list.project_id)
      and public.has_permission(
        material_list.organization_id,
        'material_list.update'
      )
  )
)
with check (
  exists (
    select 1
    from public.material_lists material_list
    where material_list.id = material_list_items.material_list_id
      and public.can_access_project(material_list.project_id)
      and public.has_permission(
        material_list.organization_id,
        'material_list.update'
      )
  )
);

drop policy if exists material_list_items_delete_authorized
  on public.material_list_items;
create policy material_list_items_delete_authorized
on public.material_list_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.material_lists material_list
    where material_list.id = material_list_items.material_list_id
      and public.can_access_project(material_list.project_id)
      and public.has_permission(
        material_list.organization_id,
        'material_list.update'
      )
  )
);

drop policy if exists audit_logs_select_authorized on public.audit_logs;
create policy audit_logs_select_authorized
on public.audit_logs
for select
to authenticated
using (
  public.has_permission(organization_id, 'audit_log.view')
);

revoke all on table
  public.profiles,
  public.organizations,
  public.permissions,
  public.roles,
  public.role_permissions,
  public.organization_members,
  public.organization_subscriptions,
  public.organization_seat_limits,
  public.organization_invitations,
  public.teams,
  public.team_members,
  public.projects,
  public.project_members,
  public.project_documents,
  public.analyses,
  public.material_lists,
  public.material_list_items,
  public.audit_logs
from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (
  first_name,
  last_name,
  display_name,
  avatar_url
) on public.profiles to authenticated;
grant select, insert on public.organizations to authenticated;
grant update (
  name,
  organization_number
) on public.organizations to authenticated;
grant select on public.permissions to authenticated;
grant select on public.roles to authenticated;
grant select on public.role_permissions to authenticated;
grant select on public.organization_members to authenticated;
grant select on public.organization_subscriptions to authenticated;
grant select on public.organization_seat_limits to authenticated;
grant select (
  id,
  organization_id,
  email,
  role_id,
  status,
  invited_by,
  accepted_by,
  expires_at,
  accepted_at,
  created_at,
  updated_at
) on public.organization_invitations to authenticated;
grant select, insert on public.teams to authenticated;
grant update (name, description, status) on public.teams to authenticated;
grant select, insert, delete on public.team_members to authenticated;
grant select, insert on public.projects to authenticated;
grant update (
  team_id,
  name,
  description,
  customer,
  customer_name,
  address,
  country,
  standard,
  system_type,
  supplier,
  status,
  progress,
  access_level,
  assigned_to
) on public.projects to authenticated;
grant select, insert, delete on public.project_members to authenticated;
grant select, insert on public.project_documents to authenticated;
grant update (
  status,
  deleted_at,
  deleted_by
) on public.project_documents to authenticated;
grant select, insert on public.analyses to authenticated;
grant update (status) on public.analyses to authenticated;
grant select, insert on public.material_lists to authenticated;
grant update (
  name,
  status,
  updated_by,
  deleted_at,
  deleted_by
) on public.material_lists to authenticated;
grant select, insert, delete on public.material_list_items to authenticated;
grant update (
  product_id,
  line_number,
  description,
  quantity,
  unit,
  metadata
) on public.material_list_items to authenticated;
grant select on public.audit_logs to authenticated;

create or replace function public.write_audit_log(
  audited_organization_id uuid,
  audited_action text,
  audited_entity_type text,
  audited_entity_id uuid,
  audited_old_values jsonb default null,
  audited_new_values jsonb default null,
  audited_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  audit_id uuid := gen_random_uuid();
  audit_actor_type text := case
    when auth.uid() is null then 'system'
    when public.is_platform_admin() then 'platform_admin'
    else 'user'
  end;
begin
  if audited_organization_id is null then
    raise exception 'Audit organization_id is required.';
  end if;

  insert into public.audit_logs (
    id,
    organization_id,
    actor_user_id,
    actor_type,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    metadata
  )
  values (
    audit_id,
    audited_organization_id,
    auth.uid(),
    audit_actor_type,
    audited_action,
    audited_entity_type,
    audited_entity_id,
    audited_old_values,
    audited_new_values,
    coalesce(audited_metadata, '{}'::jsonb)
  );

  return audit_id;
end;
$$;

create or replace function public.audit_organization_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.write_audit_log(
    new.id,
    case when tg_op = 'INSERT'
      then 'organization.created'
      else 'organization.updated'
    end,
    'organization',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

create or replace function public.audit_member_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  audited_member public.organization_members;
  audited_action text;
begin
  if tg_op = 'DELETE' then
    audited_member := old;
  else
    audited_member := new;
  end if;

  audited_action := case
    when tg_op = 'INSERT' and new.status = 'invited' then 'member.invited'
    when tg_op = 'INSERT' then 'member.joined'
    when tg_op = 'DELETE' then 'member.disabled'
    when old.role_id is distinct from new.role_id then 'member.role_changed'
    when old.status is distinct from new.status and new.status = 'active'
      then 'member.joined'
    when old.status is distinct from new.status then 'member.disabled'
    else 'member.updated'
  end;

  perform public.write_audit_log(
    audited_member.organization_id,
    audited_action,
    'organization_member',
    audited_member.id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return audited_member;
end;
$$;

create or replace function public.audit_team_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  audited_team public.teams;
  audited_action text;
begin
  if tg_op = 'DELETE' then
    audited_team := old;
  else
    audited_team := new;
  end if;
  audited_action := case
    when tg_op = 'INSERT' then 'team.created'
    when tg_op = 'DELETE' then 'team.deleted'
    when old.status = 'active' and new.status = 'inactive' then 'team.deleted'
    else 'team.updated'
  end;

  perform public.write_audit_log(
    audited_team.organization_id,
    audited_action,
    'team',
    audited_team.id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return audited_team;
end;
$$;

create or replace function public.audit_team_member_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  audited_team_id uuid;
  audited_organization_id uuid;
begin
  if tg_op = 'DELETE' then
    audited_team_id := old.team_id;
  else
    audited_team_id := new.team_id;
  end if;

  select team.organization_id
  into audited_organization_id
  from public.teams team
  where team.id = audited_team_id;

  perform public.write_audit_log(
    audited_organization_id,
    case when tg_op = 'DELETE'
      then 'team.member_removed'
      else 'team.member_added'
    end,
    'team',
    audited_team_id,
    case when tg_op = 'DELETE' then to_jsonb(old) else null end,
    case when tg_op <> 'DELETE' then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.audit_project_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  audited_project public.projects;
  audited_action text;
begin
  if tg_op = 'DELETE' then
    audited_project := old;
  else
    audited_project := new;
  end if;
  audited_action := case
    when tg_op = 'INSERT' then 'project.created'
    when tg_op = 'DELETE' then 'project.permanently_deleted'
    when old.deleted_at is null and new.deleted_at is not null
      then 'project.deleted'
    when old.deleted_at is not null and new.deleted_at is null
      then 'project.restored'
    when old.access_level is distinct from new.access_level
      or old.team_id is distinct from new.team_id
      then 'project.access_changed'
    else 'project.updated'
  end;

  perform public.write_audit_log(
    audited_project.organization_id,
    audited_action,
    'project',
    audited_project.id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return audited_project;
end;
$$;

create or replace function public.audit_project_member_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  audited_project_id uuid;
  audited_organization_id uuid;
begin
  if tg_op = 'DELETE' then
    audited_project_id := old.project_id;
  else
    audited_project_id := new.project_id;
  end if;

  select project.organization_id
  into audited_organization_id
  from public.projects project
  where project.id = audited_project_id;

  if audited_organization_id is not null then
    perform public.write_audit_log(
      audited_organization_id,
      case when tg_op = 'DELETE'
        then 'project.member_removed'
        else 'project.member_added'
      end,
      'project',
      audited_project_id,
      case when tg_op = 'DELETE' then to_jsonb(old) else null end,
      case when tg_op <> 'DELETE' then to_jsonb(new) else null end
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.audit_document_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.write_audit_log(
    new.organization_id,
    case
      when tg_op = 'INSERT' then 'document.uploaded'
      when old.deleted_at is null and new.deleted_at is not null
        then 'document.deleted'
      else 'document.updated'
    end,
    'project_document',
    new.id,
    case when tg_op = 'UPDATE'
      then to_jsonb(old) - 'storage_path'
      else null
    end,
    to_jsonb(new) - 'storage_path'
  );

  return new;
end;
$$;

create or replace function public.audit_analysis_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  audited_action text;
begin
  audited_action := case
    when tg_op = 'INSERT' then 'analysis.started'
    when new.status = 'completed' and old.status is distinct from new.status
      then 'analysis.completed'
    when new.status = 'failed' and old.status is distinct from new.status
      then 'analysis.failed'
    else 'analysis.updated'
  end;

  perform public.write_audit_log(
    new.organization_id,
    audited_action,
    'analysis',
    new.id,
    case when tg_op = 'UPDATE'
      then to_jsonb(old) - 'result_data'
      else null
    end,
    to_jsonb(new) - 'result_data'
  );

  return new;
end;
$$;

create or replace function public.audit_material_list_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.write_audit_log(
    new.organization_id,
    case when tg_op = 'INSERT'
      then 'material_list.created'
      else 'material_list.updated'
    end,
    'material_list',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

drop trigger if exists organizations_audit_change on public.organizations;
create trigger organizations_audit_change
after insert or update on public.organizations
for each row execute function public.audit_organization_change();

drop trigger if exists organization_members_audit_change
  on public.organization_members;
create trigger organization_members_audit_change
after insert or update or delete on public.organization_members
for each row execute function public.audit_member_change();

drop trigger if exists teams_audit_change on public.teams;
create trigger teams_audit_change
after insert or update or delete on public.teams
for each row execute function public.audit_team_change();

drop trigger if exists team_members_audit_change on public.team_members;
create trigger team_members_audit_change
after insert or delete on public.team_members
for each row execute function public.audit_team_member_change();

drop trigger if exists projects_audit_change on public.projects;
create trigger projects_audit_change
after insert or update or delete on public.projects
for each row execute function public.audit_project_change();

drop trigger if exists project_members_audit_change on public.project_members;
create trigger project_members_audit_change
after insert or delete on public.project_members
for each row execute function public.audit_project_member_change();

drop trigger if exists project_documents_audit_change
  on public.project_documents;
create trigger project_documents_audit_change
after insert or update on public.project_documents
for each row execute function public.audit_document_change();

drop trigger if exists analyses_audit_change on public.analyses;
create trigger analyses_audit_change
after insert or update on public.analyses
for each row execute function public.audit_analysis_change();

drop trigger if exists material_lists_audit_change on public.material_lists;
create trigger material_lists_audit_change
after insert or update on public.material_lists
for each row execute function public.audit_material_list_change();

create or replace function public.soft_delete_project(
  requested_project_id uuid,
  requested_reason text,
  requested_confirmation text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_project public.projects;
  actor_user_id uuid := auth.uid();
  actor_is_project_owner boolean;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select project.*
  into target_project
  from public.projects project
  where project.id = requested_project_id
  for update;

  if target_project.id is null then
    raise exception 'Project not found.';
  end if;

  if target_project.deleted_at is not null then
    raise exception 'Project is already in trash.';
  end if;

  if btrim(coalesce(requested_confirmation, '')) <> target_project.name then
    raise exception 'Project name confirmation does not match.';
  end if;

  if length(btrim(coalesce(requested_reason, ''))) < 3 then
    raise exception 'A deletion reason of at least 3 characters is required.';
  end if;

  select exists (
    select 1
    from public.project_members project_member
    join public.organization_members member
      on member.id = project_member.organization_member_id
    where project_member.project_id = target_project.id
      and member.user_id = actor_user_id
      and member.status = 'active'
      and project_member.project_role = 'owner'
  )
  into actor_is_project_owner;

  if not (
    public.is_organization_admin(target_project.organization_id)
    or (
      public.has_permission(
        target_project.organization_id,
        'project.delete'
      )
      and (
        target_project.created_by = actor_user_id
        or actor_is_project_owner
      )
    )
  ) then
    raise exception 'Project delete permission is required.';
  end if;

  update public.projects
  set
    status_before_delete = status,
    status = 'deleted',
    deleted_at = now(),
    deleted_by = actor_user_id,
    deletion_reason = btrim(requested_reason)
  where id = target_project.id;

  return target_project.id;
end;
$$;

create or replace function public.restore_project(
  requested_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_project public.projects;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select project.*
  into target_project
  from public.projects project
  where project.id = requested_project_id
  for update;

  if target_project.id is null or target_project.deleted_at is null then
    raise exception 'Deleted project not found.';
  end if;

  if not public.can_manage_project(
    target_project.id,
    'project.restore'
  ) then
    raise exception 'Project restore permission is required.';
  end if;

  update public.projects
  set
    status = coalesce(nullif(status_before_delete, ''), 'active'),
    status_before_delete = null,
    deleted_at = null,
    deleted_by = null,
    deletion_reason = null
  where id = target_project.id;

  return target_project.id;
end;
$$;

create or replace function public.permanently_delete_project(
  requested_project_id uuid,
  requested_confirmation text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_project public.projects;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select project.*
  into target_project
  from public.projects project
  where project.id = requested_project_id
  for update;

  if target_project.id is null or target_project.deleted_at is null then
    raise exception 'Deleted project not found.';
  end if;

  if btrim(coalesce(requested_confirmation, '')) <> target_project.name then
    raise exception 'Project name confirmation does not match.';
  end if;

  if not public.has_organization_role(
    target_project.organization_id,
    'organization_owner'
  ) or not public.has_permission(
    target_project.organization_id,
    'project.permanent_delete'
  ) then
    raise exception 'Only an organization owner may permanently delete a project.';
  end if;

  delete from public.projects
  where id = target_project.id;

  return target_project.id;
end;
$$;

revoke all on function public.write_audit_log(
  uuid, text, text, uuid, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.write_audit_log(
  uuid, text, text, uuid, jsonb, jsonb, jsonb
) to service_role;

revoke all on function public.audit_organization_change()
  from public, anon, authenticated;
revoke all on function public.audit_member_change()
  from public, anon, authenticated;
revoke all on function public.audit_team_change()
  from public, anon, authenticated;
revoke all on function public.audit_team_member_change()
  from public, anon, authenticated;
revoke all on function public.audit_project_change()
  from public, anon, authenticated;
revoke all on function public.audit_project_member_change()
  from public, anon, authenticated;
revoke all on function public.audit_document_change()
  from public, anon, authenticated;
revoke all on function public.audit_analysis_change()
  from public, anon, authenticated;
revoke all on function public.audit_material_list_change()
  from public, anon, authenticated;

revoke all on function public.soft_delete_project(uuid, text, text)
  from public, anon;
revoke all on function public.restore_project(uuid)
  from public, anon;
revoke all on function public.permanently_delete_project(uuid, text)
  from public, anon;

grant execute on function public.soft_delete_project(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.restore_project(uuid)
  to authenticated, service_role;
grant execute on function public.permanently_delete_project(uuid, text)
  to authenticated, service_role;
