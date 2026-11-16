create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists teams_organization_status_idx
  on public.teams (organization_id, status);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  organization_member_id uuid not null
    references public.organization_members(id) on delete cascade,
  team_role text,
  created_at timestamptz not null default now(),
  primary key (team_id, organization_member_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  customer text,
  address text,
  country text,
  standard text,
  system_type text,
  supplier text,
  status text not null default 'active',
  progress integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists customer text,
  add column if not exists address text,
  add column if not exists country text,
  add column if not exists standard text,
  add column if not exists system_type text,
  add column if not exists supplier text,
  add column if not exists progress integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists organization_id uuid
    references public.organizations(id) on delete restrict,
  add column if not exists team_id uuid
    references public.teams(id) on delete set null,
  add column if not exists description text,
  add column if not exists customer_name text,
  add column if not exists access_level text default 'own',
  add column if not exists created_by uuid
    references auth.users(id) on delete set null,
  add column if not exists assigned_to uuid
    references auth.users(id) on delete set null,
  add column if not exists status_before_delete text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid
    references auth.users(id) on delete set null,
  add column if not exists deletion_reason text;

alter table public.projects
  alter column owner_id drop not null;

do $$
declare
  owner_constraint record;
begin
  for owner_constraint in
    select foreign_key.conname
    from pg_constraint foreign_key
    join pg_attribute owner_attribute
      on owner_attribute.attrelid = foreign_key.conrelid
      and owner_attribute.attnum = any(foreign_key.conkey)
    where foreign_key.conrelid = 'public.projects'::regclass
      and foreign_key.confrelid = 'auth.users'::regclass
      and foreign_key.contype = 'f'
      and owner_attribute.attname = 'owner_id'
  loop
    execute format(
      'alter table public.projects drop constraint %I',
      owner_constraint.conname
    );
  end loop;
end;
$$;

alter table public.projects
  add constraint projects_owner_id_fkey
  foreign key (owner_id)
  references auth.users(id)
  on delete set null
  not valid;

alter table public.projects
  validate constraint projects_owner_id_fkey;

update public.projects
set
  created_by = coalesce(created_by, owner_id),
  customer_name = coalesce(customer_name, customer),
  access_level = coalesce(access_level, 'own'),
  progress = coalesce(progress, 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.projects
  alter column access_level set default 'own',
  alter column access_level set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_access_level_check'
  ) then
    alter table public.projects
      add constraint projects_access_level_check
      check (access_level in ('own', 'team', 'organization', 'restricted'))
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_team_access_requires_team_check'
  ) then
    alter table public.projects
      add constraint projects_team_access_requires_team_check
      check (access_level <> 'team' or team_id is not null)
      not valid;
  end if;
end;
$$;

alter table public.projects
  validate constraint projects_access_level_check,
  validate constraint projects_team_access_requires_team_check;

create index if not exists projects_organization_status_idx
  on public.projects (organization_id, status, updated_at desc);

create index if not exists projects_team_idx
  on public.projects (team_id)
  where team_id is not null;

create index if not exists projects_created_by_idx
  on public.projects (created_by);

create index if not exists projects_deleted_idx
  on public.projects (organization_id, deleted_at)
  where deleted_at is not null;

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_member_id uuid not null
    references public.organization_members(id) on delete cascade,
  project_role text not null default 'viewer'
    check (project_role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, organization_member_id)
);

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status text not null default 'active'
    check (status in ('active', 'deleted')),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (storage_bucket, storage_path)
);

create index if not exists project_documents_project_idx
  on public.project_documents (project_id, status, created_at desc);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid references public.project_documents(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  result_data jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analyses_project_idx
  on public.analyses (project_id, created_at desc);

create table if not exists public.material_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  analysis_id uuid references public.analyses(id) on delete set null,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approved', 'archived', 'deleted')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

create index if not exists material_lists_project_idx
  on public.material_lists (project_id, status, updated_at desc);

create table if not exists public.material_list_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  material_list_id uuid not null
    references public.material_lists(id) on delete cascade,
  product_id uuid,
  line_number integer not null check (line_number > 0),
  description text not null,
  quantity numeric,
  unit text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_list_id, line_number)
);

comment on column public.material_list_items.product_id is
  'Optional global catalog product ID. FK is deferred until the catalog baseline is versioned.';

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'user'
    check (actor_type in ('user', 'platform_admin', 'system')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_organization_created_idx
  on public.audit_logs (organization_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.enforce_team_member_organization()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  team_organization_id uuid;
  member_organization_id uuid;
begin
  select team.organization_id
  into team_organization_id
  from public.teams team
  where team.id = new.team_id;

  select member.organization_id
  into member_organization_id
  from public.organization_members member
  where member.id = new.organization_member_id;

  if team_organization_id is distinct from member_organization_id then
    raise exception 'Team members must belong to the same organization as the team.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_team_scope()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'UPDATE'
    and auth.uid() is not null
    and (
      new.organization_id is distinct from old.organization_id
      or new.created_by is distinct from old.created_by
    ) then
    raise exception 'Team tenant and creator fields cannot be changed.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_project_scope()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  related_organization_id uuid;
  actor_user_id uuid := auth.uid();
begin
  if tg_op = 'UPDATE'
    and actor_user_id is not null
    and (
      new.organization_id is distinct from old.organization_id
      or new.created_by is distinct from old.created_by
      or new.owner_id is distinct from old.owner_id
    ) then
    raise exception 'Project tenant and creator fields cannot be changed.';
  end if;

  if new.team_id is not null then
    select team.organization_id
    into related_organization_id
    from public.teams team
    where team.id = new.team_id;

    if related_organization_id is distinct from new.organization_id then
      raise exception 'The project team must belong to the project organization.';
    end if;
  end if;

  if new.assigned_to is not null and not exists (
    select 1
    from public.organization_members member
    where member.organization_id = new.organization_id
      and member.user_id = new.assigned_to
      and member.status = 'active'
  ) then
    raise exception 'The assigned user must be an active organization member.';
  end if;

  if new.deleted_at is null then
    new.deleted_by = null;
    new.deletion_reason = null;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_project_member_organization()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  project_organization_id uuid;
  member_organization_id uuid;
begin
  select project.organization_id
  into project_organization_id
  from public.projects project
  where project.id = new.project_id;

  select member.organization_id
  into member_organization_id
  from public.organization_members member
  where member.id = new.organization_member_id;

  if project_organization_id is distinct from member_organization_id then
    raise exception
      'Project members must belong to the same organization as the project.';
  end if;

  return new;
end;
$$;

create or replace function public.add_project_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  creator_membership_id uuid;
begin
  select member.id
  into creator_membership_id
  from public.organization_members member
  where member.organization_id = new.organization_id
    and member.user_id = new.created_by
    and member.status = 'active'
  limit 1;

  if creator_membership_id is null then
    raise exception 'Project creator must be an active organization member.';
  end if;

  insert into public.project_members (
    project_id,
    organization_member_id,
    project_role
  )
  values (new.id, creator_membership_id, 'owner')
  on conflict (project_id, organization_member_id) do update
  set project_role = 'owner';

  return new;
end;
$$;

create or replace function public.enforce_project_artifact_organization()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  project_organization_id uuid;
begin
  select project.organization_id
  into project_organization_id
  from public.projects project
  where project.id = new.project_id;

  if project_organization_id is distinct from new.organization_id then
    raise exception 'Project artifact organization_id does not match its project.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_material_item_organization()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  list_organization_id uuid;
begin
  select material_list.organization_id
  into list_organization_id
  from public.material_lists material_list
  where material_list.id = new.material_list_id;

  if list_organization_id is distinct from new.organization_id then
    raise exception 'Material item organization_id does not match its list.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Audit logs are append-only.';
end;
$$;

drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

drop trigger if exists teams_enforce_scope on public.teams;
create trigger teams_enforce_scope
before update on public.teams
for each row execute function public.enforce_team_scope();

drop trigger if exists team_members_enforce_organization on public.team_members;
create trigger team_members_enforce_organization
before insert or update on public.team_members
for each row execute function public.enforce_team_member_organization();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists projects_enforce_scope on public.projects;
create trigger projects_enforce_scope
before insert or update on public.projects
for each row execute function public.enforce_project_scope();

drop trigger if exists projects_add_creator_membership on public.projects;
create trigger projects_add_creator_membership
after insert on public.projects
for each row execute function public.add_project_creator_membership();

drop trigger if exists project_members_enforce_organization
  on public.project_members;
create trigger project_members_enforce_organization
before insert or update on public.project_members
for each row execute function public.enforce_project_member_organization();

drop trigger if exists project_documents_set_updated_at
  on public.project_documents;
create trigger project_documents_set_updated_at
before update on public.project_documents
for each row execute function public.set_updated_at();

drop trigger if exists project_documents_enforce_organization
  on public.project_documents;
create trigger project_documents_enforce_organization
before insert or update on public.project_documents
for each row execute function public.enforce_project_artifact_organization();

drop trigger if exists analyses_set_updated_at on public.analyses;
create trigger analyses_set_updated_at
before update on public.analyses
for each row execute function public.set_updated_at();

drop trigger if exists analyses_enforce_organization on public.analyses;
create trigger analyses_enforce_organization
before insert or update on public.analyses
for each row execute function public.enforce_project_artifact_organization();

drop trigger if exists material_lists_set_updated_at on public.material_lists;
create trigger material_lists_set_updated_at
before update on public.material_lists
for each row execute function public.set_updated_at();

drop trigger if exists material_lists_enforce_organization
  on public.material_lists;
create trigger material_lists_enforce_organization
before insert or update on public.material_lists
for each row execute function public.enforce_project_artifact_organization();

drop trigger if exists material_list_items_set_updated_at
  on public.material_list_items;
create trigger material_list_items_set_updated_at
before update on public.material_list_items
for each row execute function public.set_updated_at();

drop trigger if exists material_list_items_enforce_organization
  on public.material_list_items;
create trigger material_list_items_enforce_organization
before insert or update on public.material_list_items
for each row execute function public.enforce_material_item_organization();

drop trigger if exists audit_logs_prevent_update on public.audit_logs;
create trigger audit_logs_prevent_update
before update on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();

drop trigger if exists audit_logs_prevent_delete on public.audit_logs;
create trigger audit_logs_prevent_delete
before delete on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();

revoke all on function public.enforce_team_member_organization() from public;
revoke all on function public.enforce_team_scope() from public;
revoke all on function public.enforce_project_scope() from public;
revoke all on function public.enforce_project_member_organization() from public;
revoke all on function public.add_project_creator_membership() from public;
revoke all on function public.enforce_project_artifact_organization() from public;
revoke all on function public.enforce_material_item_organization() from public;
revoke all on function public.prevent_audit_log_mutation() from public;
