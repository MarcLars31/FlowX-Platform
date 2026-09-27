-- Complete the invitation lifecycle. Auth remains authoritative for identity;
-- membership activation is performed only after the invited email has a valid
-- Auth session.

create or replace function public.revoke_organization_invitation(
  requested_invitation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  invitation_row public.organization_invitations;
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select invitation_record.*
  into invitation_row
  from public.organization_invitations invitation_record
  where invitation_record.id = requested_invitation_id
  for update;

  if invitation_row.id is null then
    raise exception 'Invitation not found.';
  end if;

  if not public.has_permission(invitation_row.organization_id, 'member.invite') then
    raise exception 'Member invitation permission is required.';
  end if;

  if invitation_row.status <> 'pending' then
    return invitation_row.id;
  end if;

  update public.organization_invitations
  set
    status = 'revoked',
    cancelled_at = now(),
    cancelled_by = actor_user_id,
    updated_at = now()
  where id = invitation_row.id;

  perform public.write_audit_log(
    invitation_row.organization_id,
    'member.invitation_revoked',
    'organization_invitation',
    invitation_row.id,
    jsonb_build_object('status', invitation_row.status),
    jsonb_build_object('status', 'revoked')
  );

  return invitation_row.id;
end;
$$;

create or replace function public.accept_organization_invitation(
  requested_invitation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  invitation_row public.organization_invitations;
  actor_user_id uuid := auth.uid();
  actor_email text;
  existing_member public.organization_members;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select invitation_record.*
  into invitation_row
  from public.organization_invitations invitation_record
  where invitation_record.id = requested_invitation_id
  for update;

  if invitation_row.id is null then
    raise exception 'Invitation not found.';
  end if;

  if invitation_row.status <> 'pending' then
    raise exception 'Invitation is no longer pending.';
  end if;

  if invitation_row.expires_at <= now() then
    update public.organization_invitations
    set status = 'expired', updated_at = now()
    where id = invitation_row.id;
    raise exception 'Invitation has expired.';
  end if;

  select lower(auth_user.email)
  into actor_email
  from auth.users auth_user
  where auth_user.id = actor_user_id;

  if actor_email is null or actor_email <> lower(invitation_row.email) then
    raise exception 'The signed-in email does not match the invitation.';
  end if;

  select member.*
  into existing_member
  from public.organization_members member
  where member.organization_id = invitation_row.organization_id
    and member.user_id = actor_user_id
  for update;

  if existing_member.id is not null and existing_member.status not in ('invited', 'disabled') then
    raise exception 'The user already has an active organization membership.';
  end if;

  -- The membership trigger intentionally prevents a user from changing their
  -- own active membership. Remove only a pre-created invited/disabled row and
  -- insert the approved active membership through the guarded trigger path.
  if existing_member.id is not null then
    delete from public.organization_members where id = existing_member.id;
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role_id,
    status,
    invited_by,
    joined_at
  )
  values (
    invitation_row.organization_id,
    actor_user_id,
    invitation_row.role_id,
    'active',
    invitation_row.invited_by,
    now()
  );

  update public.organization_invitations
  set
    status = 'accepted',
    accepted_by = actor_user_id,
    accepted_at = now(),
    updated_at = now()
  where id = invitation_row.id;

  perform public.write_audit_log(
    invitation_row.organization_id,
    'member.invitation_accepted',
    'organization_invitation',
    invitation_row.id,
    jsonb_build_object('status', invitation_row.status),
    jsonb_build_object('status', 'accepted', 'user_id', actor_user_id)
  );

  return invitation_row.id;
end;
$$;

revoke all on function public.revoke_organization_invitation(uuid)
  from public, anon;
revoke all on function public.accept_organization_invitation(uuid)
  from public, anon;
grant execute on function public.revoke_organization_invitation(uuid)
  to authenticated;
grant execute on function public.accept_organization_invitation(uuid)
  to authenticated;
