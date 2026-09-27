-- Align the canonical FlowX roles introduced in phase 1 with the existing
-- membership operations. Legacy role slugs remain assignable during the
-- transition so current organizations keep working without a data rewrite.

create or replace function public.create_organization_invitation(
  requested_organization_id uuid,
  requested_email text,
  requested_role_slug text,
  requested_token_hash text,
  requested_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  invitation_id uuid := gen_random_uuid();
  actor_is_owner boolean;
  actor_is_admin boolean;
  target_role_id uuid;
  target_role_organization_id uuid;
  target_role_is_system boolean;
  target_seat_type text;
  configured_seat_limit integer;
  reserved_seat_count integer;
  current_subscription_status text;
  normalized_email text := lower(btrim(coalesce(requested_email, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.has_permission(requested_organization_id, 'member.invite') then
    raise exception 'Member invitation permission is required.';
  end if;

  actor_is_owner := public.has_organization_role(
    requested_organization_id,
    'organization_owner'
  );
  actor_is_admin := public.has_organization_role(
    requested_organization_id,
    'organization_admin'
  ) or public.has_organization_role(
    requested_organization_id,
    'company_admin'
  );

  if not actor_is_owner and not actor_is_admin then
    raise exception 'Only organization owners and admins may invite members.';
  end if;

  select
    role.id,
    role.organization_id,
    role.is_system_role,
    role.seat_type
  into
    target_role_id,
    target_role_organization_id,
    target_role_is_system,
    target_seat_type
  from public.roles role
  where role.slug = requested_role_slug
    and (
      role.organization_id is null
      or role.organization_id = requested_organization_id
    )
  order by role.organization_id nulls first
  limit 1;

  if target_role_id is null
    or (
      not target_role_is_system
      and target_role_organization_id is distinct from requested_organization_id
    ) then
    raise exception 'The requested role is not assignable in this organization.';
  end if;

  if requested_role_slug = 'platform_admin' then
    raise exception 'platform_admin is not an assignable customer role.';
  end if;

  if actor_is_admin and (
    not target_role_is_system
    or requested_role_slug not in (
      'project_manager',
      'engineer',
      'viewer',
      'full_user',
      'mini_user',
      'read_only'
    )
  ) then
    raise exception 'Organization admins may only assign standard user roles.';
  end if;

  if position('@' in normalized_email) <= 1
    or length(normalized_email) > 320 then
    raise exception 'A valid email address is required.';
  end if;

  if coalesce(requested_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'A SHA-256 invitation token hash is required.';
  end if;

  if requested_expires_at <= now()
    or requested_expires_at > now() + interval '30 days' then
    raise exception 'Invitation expiry must be within the next 30 days.';
  end if;

  if exists (
    select 1
    from auth.users auth_user
    join public.organization_members member
      on member.user_id = auth_user.id
    where member.organization_id = requested_organization_id
      and lower(auth_user.email) = normalized_email
      and member.status in ('invited', 'active')
  ) then
    raise exception 'The user already has an active or invited membership.';
  end if;

  select subscription.status
  into current_subscription_status
  from public.organization_subscriptions subscription
  where subscription.organization_id = requested_organization_id;

  if current_subscription_status is null
    or current_subscription_status not in ('trial', 'active') then
    raise exception 'The organization subscription is not active.';
  end if;

  select seat_limit.seat_limit
  into configured_seat_limit
  from public.organization_seat_limits seat_limit
  where seat_limit.organization_id = requested_organization_id
    and seat_limit.seat_type = target_seat_type;

  if configured_seat_limit is null then
    raise exception 'No seat limit is configured for %.', target_seat_type;
  end if;

  select
    (
      select count(*)
      from public.organization_members member
      join public.roles role on role.id = member.role_id
      where member.organization_id = requested_organization_id
        and member.status = 'active'
        and role.seat_type = target_seat_type
    )
    +
    (
      select count(*)
      from public.organization_invitations invitation
      join public.roles role on role.id = invitation.role_id
      where invitation.organization_id = requested_organization_id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
        and role.seat_type = target_seat_type
    )
  into reserved_seat_count;

  if reserved_seat_count >= configured_seat_limit then
    raise exception 'The organization seat limit for % has been reached.',
      target_seat_type;
  end if;

  insert into public.organization_invitations (
    id,
    organization_id,
    email,
    role_id,
    status,
    token_hash,
    invited_by,
    expires_at
  )
  values (
    invitation_id,
    requested_organization_id,
    normalized_email,
    target_role_id,
    'pending',
    requested_token_hash,
    auth.uid(),
    requested_expires_at
  );

  perform public.write_audit_log(
    requested_organization_id,
    'member.invited',
    'organization_invitation',
    invitation_id,
    null,
    jsonb_build_object(
      'email', normalized_email,
      'role_slug', requested_role_slug,
      'expires_at', requested_expires_at
    )
  );

  return invitation_id;
end;
$$;

create or replace function public.change_organization_member_role(
  requested_member_id uuid,
  requested_role_slug text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_member public.organization_members;
  current_role_slug text;
  requested_role_id uuid;
  requested_role_organization_id uuid;
  requested_role_is_system boolean;
  actor_is_owner boolean;
  actor_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select member.*
  into target_member
  from public.organization_members member
  where member.id = requested_member_id
  for update;

  if target_member.id is null then
    raise exception 'Organization member not found.';
  end if;

  if target_member.user_id = auth.uid() then
    raise exception 'A member cannot change their own role.';
  end if;

  if not public.has_permission(
    target_member.organization_id,
    'member.change_role'
  ) then
    raise exception 'Role-change permission is required.';
  end if;

  actor_is_owner := public.has_organization_role(
    target_member.organization_id,
    'organization_owner'
  );
  actor_is_admin := public.has_organization_role(
    target_member.organization_id,
    'organization_admin'
  ) or public.has_organization_role(
    target_member.organization_id,
    'company_admin'
  );

  select role.slug
  into current_role_slug
  from public.roles role
  where role.id = target_member.role_id;

  select role.id, role.organization_id, role.is_system_role
  into
    requested_role_id,
    requested_role_organization_id,
    requested_role_is_system
  from public.roles role
  where role.slug = requested_role_slug
    and (
      role.organization_id is null
      or role.organization_id = target_member.organization_id
    )
  order by role.organization_id nulls first
  limit 1;

  if requested_role_id is null
    or (
      not requested_role_is_system
      and requested_role_organization_id
        is distinct from target_member.organization_id
    )
    or requested_role_slug = 'platform_admin' then
    raise exception 'The requested role is not assignable.';
  end if;

  if actor_is_admin and (
    current_role_slug in (
      'organization_owner',
      'organization_admin',
      'company_admin'
    )
    or not requested_role_is_system
    or requested_role_slug not in (
      'project_manager',
      'engineer',
      'viewer',
      'full_user',
      'mini_user',
      'read_only'
    )
  ) then
    raise exception 'Organization admins cannot change privileged roles.';
  end if;

  if not actor_is_owner and not actor_is_admin then
    raise exception 'Only organization owners and admins may change roles.';
  end if;

  update public.organization_members
  set role_id = requested_role_id
  where id = target_member.id;

  return target_member.id;
end;
$$;

create or replace function public.set_organization_member_status(
  requested_member_id uuid,
  requested_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_member public.organization_members;
  target_role_slug text;
  actor_is_owner boolean;
  actor_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if requested_status not in ('active', 'suspended', 'disabled') then
    raise exception 'Invalid membership status.';
  end if;

  select member.*
  into target_member
  from public.organization_members member
  where member.id = requested_member_id
  for update;

  if target_member.id is null then
    raise exception 'Organization member not found.';
  end if;

  select role.slug
  into target_role_slug
  from public.roles role
  where role.id = target_member.role_id;

  if target_member.user_id = auth.uid() then
    raise exception 'A member cannot change their own membership status.';
  end if;

  if not public.has_permission(
    target_member.organization_id,
    'member.disable'
  ) then
    raise exception 'Member status permission is required.';
  end if;

  actor_is_owner := public.has_organization_role(
    target_member.organization_id,
    'organization_owner'
  );
  actor_is_admin := public.has_organization_role(
    target_member.organization_id,
    'organization_admin'
  ) or public.has_organization_role(
    target_member.organization_id,
    'company_admin'
  );

  if actor_is_admin
    and target_role_slug in (
      'organization_owner',
      'organization_admin',
      'company_admin'
    ) then
    raise exception 'Organization admins cannot change privileged members.';
  end if;

  if not actor_is_owner and not actor_is_admin then
    raise exception 'Only organization owners and admins may change members.';
  end if;

  update public.organization_members
  set status = requested_status
  where id = target_member.id;

  return target_member.id;
end;
$$;

revoke all on function public.create_organization_invitation(
  uuid, text, text, text, timestamptz
) from public, anon;
revoke all on function public.change_organization_member_role(uuid, text)
  from public, anon;
revoke all on function public.set_organization_member_status(uuid, text)
  from public, anon;

grant execute on function public.create_organization_invitation(
  uuid, text, text, text, timestamptz
) to authenticated, service_role;
grant execute on function public.change_organization_member_role(uuid, text)
  to authenticated, service_role;
grant execute on function public.set_organization_member_status(uuid, text)
  to authenticated, service_role;
