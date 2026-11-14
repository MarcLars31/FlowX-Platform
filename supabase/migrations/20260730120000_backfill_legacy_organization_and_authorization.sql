insert into public.profiles (
  id,
  first_name,
  last_name,
  display_name,
  email,
  avatar_url
)
select
  auth_user.id,
  auth_user.raw_user_meta_data ->> 'first_name',
  auth_user.raw_user_meta_data ->> 'last_name',
  coalesce(
    nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
    nullif(auth_user.raw_user_meta_data ->> 'display_name', '')
  ),
  auth_user.email,
  auth_user.raw_user_meta_data ->> 'avatar_url'
from auth.users auth_user
on conflict (id) do update
set
  email = excluded.email,
  display_name = coalesce(public.profiles.display_name, excluded.display_name),
  avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
  updated_at = now();

do $$
declare
  legacy_organization_id constant uuid :=
    '00000000-0000-4000-8000-00000000f10a';
  first_user_id uuid;
  legacy_organization_name text;
begin
  if exists (select 1 from auth.users)
    or exists (
      select 1
      from public.projects project
      where project.organization_id is null
    ) then
    select auth_user.id
    into first_user_id
    from auth.users auth_user
    order by auth_user.created_at, auth_user.id
    limit 1;

    select coalesce(
      nullif(auth_user.raw_user_meta_data ->> 'company_name', ''),
      'FlowX Legacy Organization'
    )
    into legacy_organization_name
    from auth.users auth_user
    order by auth_user.created_at, auth_user.id
    limit 1;

    insert into public.organizations (
      id,
      name,
      status,
      created_by
    )
    values (
      legacy_organization_id,
      coalesce(legacy_organization_name, 'FlowX Legacy Organization'),
      'active',
      first_user_id
    )
    on conflict (id) do nothing;

    insert into public.organization_subscriptions (
      organization_id,
      plan_key,
      status,
      current_period_start
    )
    values (
      legacy_organization_id,
      'legacy',
      'active',
      now()
    )
    on conflict (organization_id) do nothing;

    insert into public.organization_seat_limits (
      organization_id,
      seat_type,
      seat_limit
    )
    values
      (legacy_organization_id, 'admin', 2),
      (
        legacy_organization_id,
        'full_user',
        greatest(50, (select greatest(count(*) - 1, 0)::integer from auth.users))
      ),
      (legacy_organization_id, 'mini_user', 300),
      (legacy_organization_id, 'read_only', 50)
    on conflict (organization_id, seat_type) do update
    set
      seat_limit = greatest(
        public.organization_seat_limits.seat_limit,
        excluded.seat_limit
      ),
      updated_at = now();

    insert into public.organization_members (
      organization_id,
      user_id,
      role_id,
      status,
      invited_by,
      joined_at
    )
    select
      legacy_organization_id,
      auth_user.id,
      case
        when auth_user.id = first_user_id
          then '00000000-0000-4000-8000-000000000001'::uuid
        else '00000000-0000-4000-8000-000000000003'::uuid
      end,
      'active',
      first_user_id,
      coalesce(auth_user.created_at, now())
    from auth.users auth_user
    where not exists (
      select 1
      from public.organization_members existing_member
      where existing_member.user_id = auth_user.id
    )
    on conflict (organization_id, user_id) do nothing;

    update public.projects
    set
      organization_id = legacy_organization_id,
      created_by = coalesce(created_by, owner_id, first_user_id),
      owner_id = coalesce(owner_id, created_by, first_user_id),
      access_level = coalesce(access_level, 'own'),
      updated_at = coalesce(updated_at, now())
    where organization_id is null;

    insert into public.project_members (
      project_id,
      organization_member_id,
      project_role
    )
    select
      project.id,
      member.id,
      'owner'
    from public.projects project
    join public.organization_members member
      on member.organization_id = project.organization_id
      and member.user_id = project.created_by
      and member.status = 'active'
    where project.created_by is not null
    on conflict (project_id, organization_member_id) do nothing;
  end if;
end;
$$;

insert into public.organization_subscriptions (
  organization_id,
  plan_key,
  status,
  current_period_start
)
select organization.id, 'trial', 'trial', now()
from public.organizations organization
on conflict (organization_id) do nothing;

insert into public.organization_seat_limits (
  organization_id,
  seat_type,
  seat_limit
)
select organization.id, default_limit.seat_type, default_limit.seat_limit
from public.organizations organization
cross join (
  values
    ('admin'::text, 2),
    ('full_user'::text, 50),
    ('mini_user'::text, 300),
    ('read_only'::text, 50)
) as default_limit(seat_type, seat_limit)
on conflict (organization_id, seat_type) do nothing;

do $$
begin
  if exists (
    select 1
    from public.projects project
    where project.organization_id is null
  ) then
    raise exception
      'Project organization backfill is incomplete. organization_id cannot be enforced.';
  end if;
end;
$$;

alter table public.projects
  alter column organization_id set not null;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role' in ('platform_admin', 'admin'),
    false
  );
$$;

create or replace function public.current_organization_member_id(
  requested_organization_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select member.id
  from public.organization_members member
  where member.organization_id = requested_organization_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;
$$;

create or replace function public.is_organization_member(
  requested_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = requested_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  );
$$;

create or replace function public.has_organization_role(
  requested_organization_id uuid,
  requested_role_slug text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.roles role on role.id = member.role_id
    where member.organization_id = requested_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and role.slug = requested_role_slug
      and (
        role.organization_id is null
        or role.organization_id = member.organization_id
      )
  );
$$;

create or replace function public.has_permission(
  requested_organization_id uuid,
  requested_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.roles role on role.id = member.role_id
    join public.role_permissions role_permission
      on role_permission.role_id = role.id
    join public.permissions permission
      on permission.id = role_permission.permission_id
    where member.organization_id = requested_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and permission.key = requested_permission_key
      and (
        role.organization_id is null
        or role.organization_id = member.organization_id
      )
  );
$$;

create or replace function public.is_organization_admin(
  requested_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    public.has_organization_role(
      requested_organization_id,
      'organization_owner'
    )
    or public.has_organization_role(
      requested_organization_id,
      'organization_admin'
    );
$$;

create or replace function public.is_explicit_project_member(
  requested_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.project_members project_member
    join public.organization_members member
      on member.id = project_member.organization_member_id
    where project_member.project_id = requested_project_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  );
$$;

create or replace function public.is_team_member(
  requested_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.team_members team_member
    join public.organization_members member
      on member.id = team_member.organization_member_id
    where team_member.team_id = requested_team_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  );
$$;

create or replace function public.can_access_project(
  requested_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.projects project
    join public.organization_members member
      on member.organization_id = project.organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
    where project.id = requested_project_id
      and project.deleted_at is null
      and (
        public.is_organization_admin(project.organization_id)
        or public.has_permission(project.organization_id, 'project.view_all')
        or (
          public.is_explicit_project_member(project.id)
          and public.has_permission(project.organization_id, 'project.view_own')
        )
        or (
          project.access_level = 'organization'
          and public.has_permission(
            project.organization_id,
            'project.view_organization'
          )
        )
        or (
          project.access_level = 'team'
          and public.has_permission(project.organization_id, 'project.view_team')
          and exists (
            select 1
            from public.team_members team_member
            where team_member.team_id = project.team_id
              and team_member.organization_member_id = member.id
          )
        )
        or (
          project.access_level = 'own'
          and public.has_permission(project.organization_id, 'project.view_own')
          and (
            project.created_by = auth.uid()
            or project.assigned_to = auth.uid()
            or public.is_explicit_project_member(project.id)
          )
        )
        or (
          project.access_level = 'restricted'
          and public.is_explicit_project_member(project.id)
          and (
            public.has_permission(project.organization_id, 'project.view_own')
            or public.has_permission(project.organization_id, 'project.view_all')
          )
        )
      )
  );
$$;

create or replace function public.can_access_deleted_project(
  requested_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.projects project
    join public.organization_members member
      on member.organization_id = project.organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
    where project.id = requested_project_id
      and project.deleted_at is not null
      and public.has_permission(project.organization_id, 'project.restore')
      and (
        public.is_organization_admin(project.organization_id)
        or public.has_permission(project.organization_id, 'project.view_all')
        or project.created_by = auth.uid()
        or project.assigned_to = auth.uid()
        or public.is_explicit_project_member(project.id)
      )
  );
$$;

create or replace function public.can_manage_project(
  requested_project_id uuid,
  requested_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.projects project
    where project.id = requested_project_id
      and public.has_permission(
        project.organization_id,
        requested_permission_key
      )
      and (
        public.can_access_project(project.id)
        or public.can_access_deleted_project(project.id)
      )
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.current_organization_member_id(uuid)
  from public, anon;
revoke all on function public.is_organization_member(uuid) from public, anon;
revoke all on function public.has_organization_role(uuid, text)
  from public, anon;
revoke all on function public.has_permission(uuid, text) from public, anon;
revoke all on function public.is_organization_admin(uuid) from public, anon;
revoke all on function public.is_explicit_project_member(uuid)
  from public, anon;
revoke all on function public.is_team_member(uuid) from public, anon;
revoke all on function public.can_access_project(uuid) from public, anon;
revoke all on function public.can_access_deleted_project(uuid)
  from public, anon;
revoke all on function public.can_manage_project(uuid, text)
  from public, anon;

grant execute on function public.is_platform_admin()
  to authenticated, service_role;
grant execute on function public.current_organization_member_id(uuid)
  to authenticated, service_role;
grant execute on function public.is_organization_member(uuid)
  to authenticated, service_role;
grant execute on function public.has_organization_role(uuid, text)
  to authenticated, service_role;
grant execute on function public.has_permission(uuid, text)
  to authenticated, service_role;
grant execute on function public.is_organization_admin(uuid)
  to authenticated, service_role;
grant execute on function public.is_explicit_project_member(uuid)
  to authenticated, service_role;
grant execute on function public.is_team_member(uuid)
  to authenticated, service_role;
grant execute on function public.can_access_project(uuid)
  to authenticated, service_role;
grant execute on function public.can_access_deleted_project(uuid)
  to authenticated, service_role;
grant execute on function public.can_manage_project(uuid, text)
  to authenticated, service_role;
