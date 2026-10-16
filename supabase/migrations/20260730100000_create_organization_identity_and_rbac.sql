create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.email is
  'Display/cache value only. auth.users is authoritative for authentication email.';

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  organization_number text,
  status text not null default 'active'
    check (status in ('pending', 'active', 'suspended', 'disabled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organizations_number_unique
  on public.organizations (organization_number)
  where organization_number is not null;

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null,
  category text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  is_system_role boolean not null default false,
  seat_type text not null default 'full_user'
    check (seat_type in ('admin', 'full_user', 'mini_user', 'read_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_slug_format_check check (
    slug ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  constraint roles_system_ownership_check check (
    (is_system_role and organization_id is null)
    or
    (not is_system_role and organization_id is not null)
  ),
  constraint roles_custom_reserved_slug_check check (
    is_system_role
    or slug not in (
      'organization_owner',
      'organization_admin',
      'full_user',
      'mini_user',
      'read_only',
      'platform_admin'
    )
  )
);

create unique index if not exists roles_system_slug_unique
  on public.roles (slug)
  where organization_id is null;

create unique index if not exists roles_organization_slug_unique
  on public.roles (organization_id, slug)
  where organization_id is not null;

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'disabled')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id, status);

create index if not exists organization_members_org_role_idx
  on public.organization_members (organization_id, role_id, status);

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations(id) on delete cascade,
  plan_key text not null default 'trial',
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  retention_days integer check (retention_days is null or retention_days >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_seat_limits (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  seat_type text not null
    check (seat_type in ('admin', 'full_user', 'mini_user', 'read_only')),
  seat_limit integer not null check (seat_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, seat_type)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role_id uuid not null references public.roles(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  token_hash text not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_invitations_pending_email_unique
  on public.organization_invitations (organization_id, lower(email))
  where status = 'pending';

create unique index if not exists organization_invitations_token_hash_unique
  on public.organization_invitations (token_hash);

insert into public.permissions (key, description, category)
values
  ('organization.view', 'View organization information.', 'organization'),
  ('organization.update', 'Update operational organization settings.', 'organization'),
  ('organization.manage_billing', 'Manage billing settings.', 'organization'),
  ('organization.transfer_ownership', 'Transfer organization ownership.', 'organization'),
  ('member.view', 'View organization members.', 'member'),
  ('member.invite', 'Invite organization members.', 'member'),
  ('member.disable', 'Suspend or disable organization members.', 'member'),
  ('member.change_role', 'Change organization member roles.', 'member'),
  ('team.view', 'View teams and team members.', 'team'),
  ('team.create', 'Create teams.', 'team'),
  ('team.update', 'Update teams.', 'team'),
  ('team.delete', 'Disable or delete teams.', 'team'),
  ('team.manage_members', 'Add and remove team members.', 'team'),
  ('project.view_own', 'View owned or explicitly assigned projects.', 'project'),
  ('project.view_team', 'View projects assigned to a member team.', 'project'),
  ('project.view_organization', 'View organization-visible projects.', 'project'),
  ('project.view_all', 'View all organization projects.', 'project'),
  ('project.create', 'Create projects.', 'project'),
  ('project.update', 'Update accessible projects.', 'project'),
  ('project.delete', 'Move eligible projects to trash.', 'project'),
  ('project.restore', 'Restore eligible projects from trash.', 'project'),
  ('project.permanent_delete', 'Permanently delete projects.', 'project'),
  ('project.manage_members', 'Manage explicit project members.', 'project'),
  ('document.view', 'View accessible project documents.', 'document'),
  ('document.upload', 'Upload project documents.', 'document'),
  ('document.delete', 'Soft-delete project documents.', 'document'),
  ('analysis.view', 'View analyses.', 'analysis'),
  ('analysis.create', 'Start analyses.', 'analysis'),
  ('analysis.update', 'Update analysis metadata.', 'analysis'),
  ('material_list.view', 'View material lists.', 'material_list'),
  ('material_list.create', 'Create material lists.', 'material_list'),
  ('material_list.update', 'Update material lists.', 'material_list'),
  ('material_list.export', 'Export material lists.', 'material_list'),
  ('product.search', 'Search the product catalog.', 'product'),
  ('product.view', 'View products and datasheets.', 'product'),
  ('product.manage', 'Manage product data and review workflows.', 'product'),
  ('news.view', 'View FlowX and industry news.', 'news'),
  ('news.manage', 'Manage FlowX and industry news.', 'news'),
  ('audit_log.view', 'View allowed organization audit events.', 'audit'),
  ('subscription.view', 'View subscription and seat usage.', 'subscription'),
  ('subscription.manage', 'Manage subscription and seat limits.', 'subscription')
on conflict (key) do update
set
  description = excluded.description,
  category = excluded.category;

insert into public.roles (
  id,
  organization_id,
  name,
  slug,
  description,
  is_system_role,
  seat_type
)
values
  (
    '00000000-0000-4000-8000-000000000001',
    null,
    'Organization owner',
    'organization_owner',
    'Highest customer authority within an organization.',
    true,
    'admin'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    null,
    'Organization admin',
    'organization_admin',
    'Operational organization administrator.',
    true,
    'admin'
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    null,
    'Full user',
    'full_user',
    'Standard project and analysis user.',
    true,
    'full_user'
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    null,
    'Mini user',
    'mini_user',
    'Product and news access without project access.',
    true,
    'mini_user'
  ),
  (
    '00000000-0000-4000-8000-000000000005',
    null,
    'Read-only user',
    'read_only',
    'Read-only access to explicitly assigned project information.',
    true,
    'read_only'
  )
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  is_system_role = excluded.is_system_role,
  seat_type = excluded.seat_type,
  updated_at = now();

delete from public.role_permissions
where role_id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005'
);

insert into public.role_permissions (role_id, permission_id)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  permission.id
from public.permissions permission;

with role_permission_map(role_id, permission_key) as (
  values
    ('00000000-0000-4000-8000-000000000002'::uuid, 'organization.view'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'organization.update'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'member.view'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'member.invite'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'member.disable'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'member.change_role'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'team.view'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'team.create'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'team.update'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'team.delete'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'team.manage_members'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'project.view_all'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'project.create'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'project.update'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'project.delete'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'project.restore'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'project.manage_members'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'document.view'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'document.upload'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'document.delete'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'analysis.view'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'analysis.create'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'analysis.update'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'material_list.view'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'material_list.create'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'material_list.update'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'material_list.export'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'product.search'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'product.view'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'product.manage'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'news.view'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'audit_log.view'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'subscription.view'),

    ('00000000-0000-4000-8000-000000000003'::uuid, 'organization.view'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'project.view_own'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'project.view_team'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'project.view_organization'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'project.create'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'project.update'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'project.delete'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'document.view'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'document.upload'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'document.delete'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'analysis.view'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'analysis.create'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'analysis.update'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'material_list.view'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'material_list.create'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'material_list.update'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'material_list.export'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'product.search'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'product.view'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'news.view'),

    ('00000000-0000-4000-8000-000000000004'::uuid, 'product.search'),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'product.view'),
    ('00000000-0000-4000-8000-000000000004'::uuid, 'news.view'),

    ('00000000-0000-4000-8000-000000000005'::uuid, 'organization.view'),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'project.view_own'),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'document.view'),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'analysis.view'),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'material_list.view'),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'product.search'),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'product.view'),
    ('00000000-0000-4000-8000-000000000005'::uuid, 'news.view')
)
insert into public.role_permissions (role_id, permission_id)
select role_permission_map.role_id, permission.id
from role_permission_map
join public.permissions permission
  on permission.key = role_permission_map.permission_key
on conflict (role_id, permission_id) do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    email,
    avatar_url
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'display_name', '')
    ),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.bootstrap_organization_subscription()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.organization_subscriptions (
    organization_id,
    plan_key,
    status,
    current_period_start
  )
  values (new.id, 'trial', 'trial', now())
  on conflict (organization_id) do nothing;

  insert into public.organization_seat_limits (
    organization_id,
    seat_type,
    seat_limit
  )
  values
    (new.id, 'admin', 2),
    (new.id, 'full_user', 50),
    (new.id, 'mini_user', 300),
    (new.id, 'read_only', 50)
  on conflict (organization_id, seat_type) do nothing;

  return new;
end;
$$;

drop trigger if exists organizations_bootstrap_subscription
  on public.organizations;
create trigger organizations_bootstrap_subscription
after insert on public.organizations
for each row execute function public.bootstrap_organization_subscription();

create or replace function public.enforce_organization_member_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  old_role_slug text;
  new_role_slug text;
  new_role_organization_id uuid;
  new_role_is_system boolean;
  new_seat_type text;
  active_owner_count integer;
  active_seat_count integer;
  allowed_seats integer;
  subscription_status text;
  actor_user_id uuid := auth.uid();
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select role.slug
    into old_role_slug
    from public.roles role
    where role.id = old.role_id;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'active' and old_role_slug = 'organization_owner' then
      select count(*)
      into active_owner_count
      from public.organization_members member
      join public.roles role on role.id = member.role_id
      where member.organization_id = old.organization_id
        and member.status = 'active'
        and role.slug = 'organization_owner';

      if active_owner_count <= 1 then
        raise exception 'The last active organization owner cannot be removed.';
      end if;
    end if;

    return old;
  end if;

  select
    role.slug,
    role.organization_id,
    role.is_system_role,
    role.seat_type
  into
    new_role_slug,
    new_role_organization_id,
    new_role_is_system,
    new_seat_type
  from public.roles role
  where role.id = new.role_id;

  if new_role_slug is null then
    raise exception 'The selected organization role does not exist.';
  end if;

  if not new_role_is_system
    and new_role_organization_id is distinct from new.organization_id then
    raise exception 'A custom role must belong to the same organization.';
  end if;

  if new_role_slug = 'platform_admin' then
    raise exception 'platform_admin is not an assignable customer role.';
  end if;

  if tg_op = 'UPDATE'
    and actor_user_id = old.user_id
    and (
      new.role_id is distinct from old.role_id
      or new.status is distinct from old.status
    ) then
    raise exception 'A member cannot change their own role or membership status.';
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'active'
    and old_role_slug = 'organization_owner'
    and (
      new.status <> 'active'
      or new_role_slug <> 'organization_owner'
    ) then
    select count(*)
    into active_owner_count
    from public.organization_members member
    join public.roles role on role.id = member.role_id
    where member.organization_id = old.organization_id
      and member.status = 'active'
      and role.slug = 'organization_owner';

    if active_owner_count <= 1 then
      raise exception
        'Assign another active organization owner before changing the last owner.';
    end if;
  end if;

  if new.status = 'active'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.role_id is distinct from new.role_id
    ) then
    select subscription.status
    into subscription_status
    from public.organization_subscriptions subscription
    where subscription.organization_id = new.organization_id;

    if subscription_status is null then
      raise exception 'The organization has no subscription record.';
    end if;

    if subscription_status not in ('trial', 'active') then
      raise exception 'The organization subscription is not active.';
    end if;

    select seat_limit.seat_limit
    into allowed_seats
    from public.organization_seat_limits seat_limit
    where seat_limit.organization_id = new.organization_id
      and seat_limit.seat_type = new_seat_type;

    if allowed_seats is null then
      raise exception 'No seat limit is configured for %.', new_seat_type;
    end if;

    select count(*)
    into active_seat_count
    from public.organization_members member
    join public.roles role on role.id = member.role_id
    where member.organization_id = new.organization_id
      and member.status = 'active'
      and role.seat_type = new_seat_type
      and member.id is distinct from new.id;

    if active_seat_count >= allowed_seats then
      raise exception 'The organization seat limit for % has been reached.',
        new_seat_type;
    end if;
  end if;

  if new.status = 'active' and new.joined_at is null then
    new.joined_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists organization_members_enforce_rules
  on public.organization_members;
create trigger organization_members_enforce_rules
before insert or update or delete on public.organization_members
for each row execute function public.enforce_organization_member_rules();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists roles_set_updated_at on public.roles;
create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

drop trigger if exists organization_members_set_updated_at
  on public.organization_members;
create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

drop trigger if exists organization_subscriptions_set_updated_at
  on public.organization_subscriptions;
create trigger organization_subscriptions_set_updated_at
before update on public.organization_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists organization_seat_limits_set_updated_at
  on public.organization_seat_limits;
create trigger organization_seat_limits_set_updated_at
before update on public.organization_seat_limits
for each row execute function public.set_updated_at();

drop trigger if exists organization_invitations_set_updated_at
  on public.organization_invitations;
create trigger organization_invitations_set_updated_at
before update on public.organization_invitations
for each row execute function public.set_updated_at();

revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.bootstrap_organization_subscription() from public;
revoke all on function public.enforce_organization_member_rules() from public;
