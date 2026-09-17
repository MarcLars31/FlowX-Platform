-- Complete the organization-owned identity model without replacing the
-- existing organizations, profiles or memberships tables.

alter table public.profiles
  add column if not exists job_title text,
  add column if not exists phone text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz;

alter table public.organizations
  add column if not exists country_code text,
  add column if not exists website text,
  add column if not exists email_domain text,
  add column if not exists deleted_at timestamptz;

alter table public.organizations
  drop constraint if exists organizations_country_code_check;
alter table public.organizations
  add constraint organizations_country_code_check
  check (country_code is null or country_code ~ '^[A-Z]{2}$');

alter table public.organizations
  drop constraint if exists organizations_status_check;
alter table public.organizations
  add constraint organizations_status_check
  check (status in ('pending', 'pending_verification', 'active', 'suspended', 'disabled', 'rejected'));

create unique index if not exists organizations_country_registration_unique
  on public.organizations (country_code, organization_number)
  where country_code is not null and organization_number is not null and deleted_at is null;

create index if not exists organizations_active_email_domain_idx
  on public.organizations (lower(email_domain))
  where deleted_at is null and email_domain is not null;

alter table public.organization_invitations
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

create table if not exists public.organization_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_join_requests_pending_unique
  on public.organization_join_requests (organization_id, user_id)
  where status = 'pending';

create index if not exists organization_join_requests_org_status_idx
  on public.organization_join_requests (organization_id, status, created_at desc);

create index if not exists organization_join_requests_user_status_idx
  on public.organization_join_requests (user_id, status, created_at desc);

drop trigger if exists organization_join_requests_set_updated_at
  on public.organization_join_requests;
create trigger organization_join_requests_set_updated_at
before update on public.organization_join_requests
for each row execute function public.set_updated_at();

create or replace function public.organization_can_receive_join_request(
  requested_organization_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.organizations organization_row
    where organization_row.id = requested_organization_id
      and organization_row.deleted_at is null
      and organization_row.status in ('pending', 'pending_verification', 'active')
  );
$$;

create or replace function public.create_organization_join_request(
  requested_organization_id uuid,
  requested_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  request_id uuid := gen_random_uuid();
  actor_user_id uuid := auth.uid();
  normalized_message text := nullif(btrim(coalesce(requested_message, '')), '');
begin
  if actor_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.organization_can_receive_join_request(requested_organization_id) then
    raise exception 'The requested organization cannot receive join requests.';
  end if;

  if exists (
    select 1
    from public.organization_members member
    where member.organization_id = requested_organization_id
      and member.user_id = actor_user_id
      and member.status in ('invited', 'active', 'suspended')
  ) then
    raise exception 'The user already belongs to this organization.';
  end if;

  if exists (
    select 1
    from public.organization_join_requests request_row
    where request_row.organization_id = requested_organization_id
      and request_row.user_id = actor_user_id
      and request_row.status = 'pending'
  ) then
    raise exception 'A join request is already pending.';
  end if;

  insert into public.organization_join_requests (
    id, organization_id, user_id, message, status
  )
  values (
    request_id, requested_organization_id, actor_user_id, normalized_message, 'pending'
  );

  perform public.write_audit_log(
    requested_organization_id,
    'organization.join_request_created',
    'organization_join_request',
    request_id,
    null,
    jsonb_build_object('user_id', actor_user_id, 'message', normalized_message)
  );

  return request_id;
end;
$$;

create or replace function public.review_organization_join_request(
  requested_request_id uuid,
  requested_decision text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  request_row public.organization_join_requests;
  full_user_role_id uuid;
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if requested_decision not in ('approved', 'rejected') then
    raise exception 'Join request decision must be approved or rejected.';
  end if;

  select request_record.*
  into request_row
  from public.organization_join_requests request_record
  where request_record.id = requested_request_id
  for update;

  if request_row.id is null then
    raise exception 'Join request not found.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Join request is no longer pending.';
  end if;

  if not public.has_permission(request_row.organization_id, 'member.invite') then
    raise exception 'Member approval permission is required.';
  end if;

  if requested_decision = 'approved' then
    select role.id
    into full_user_role_id
    from public.roles role
    where role.slug = 'full_user'
      and role.is_system_role = true
    limit 1;

    if full_user_role_id is null then
      raise exception 'The standard full_user role is not configured.';
    end if;

    insert into public.organization_members (
      organization_id, user_id, role_id, status, joined_at
    )
    values (
      request_row.organization_id,
      request_row.user_id,
      full_user_role_id,
      'active',
      now()
    );
  end if;

  update public.organization_join_requests
  set
    status = requested_decision,
    reviewed_by = actor_user_id,
    reviewed_at = now()
  where id = request_row.id;

  perform public.write_audit_log(
    request_row.organization_id,
    case when requested_decision = 'approved'
      then 'organization.join_request_approved'
      else 'organization.join_request_rejected'
    end,
    'organization_join_request',
    request_row.id,
    jsonb_build_object('status', request_row.status),
    jsonb_build_object('status', requested_decision, 'user_id', request_row.user_id)
  );

  return request_row.id;
end;
$$;

create or replace function public.cancel_organization_join_request(
  requested_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  request_row public.organization_join_requests;
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select request_record.*
  into request_row
  from public.organization_join_requests request_record
  where request_record.id = requested_request_id
  for update;

  if request_row.id is null or request_row.user_id <> actor_user_id then
    raise exception 'Join request not found.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Join request is no longer pending.';
  end if;

  update public.organization_join_requests
  set status = 'cancelled', reviewed_by = actor_user_id, reviewed_at = now()
  where id = request_row.id;

  perform public.write_audit_log(
    request_row.organization_id,
    'organization.join_request_cancelled',
    'organization_join_request',
    request_row.id,
    jsonb_build_object('status', request_row.status),
    jsonb_build_object('status', 'cancelled')
  );

  return request_row.id;
end;
$$;

alter table public.organization_join_requests enable row level security;

drop policy if exists organization_join_requests_select_authorized
  on public.organization_join_requests;
create policy organization_join_requests_select_authorized
on public.organization_join_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_permission(organization_id, 'member.view')
);

-- Join requests are written through the SECURITY DEFINER functions above so
-- the client cannot change organization_id, user_id or the review decision.
revoke all on table public.organization_join_requests from public, anon, authenticated;
grant select on public.organization_join_requests to authenticated;

revoke all on function public.organization_can_receive_join_request(uuid)
  from public, anon, authenticated;
revoke all on function public.create_organization_join_request(uuid, text)
  from public, anon;
revoke all on function public.review_organization_join_request(uuid, text)
  from public, anon;
revoke all on function public.cancel_organization_join_request(uuid)
  from public, anon;

grant execute on function public.create_organization_join_request(uuid, text)
  to authenticated;
grant execute on function public.review_organization_join_request(uuid, text)
  to authenticated;
grant execute on function public.cancel_organization_join_request(uuid)
  to authenticated;

comment on table public.organization_join_requests is
  'Approval workflow for self-registered users requesting access to an existing organization.';
