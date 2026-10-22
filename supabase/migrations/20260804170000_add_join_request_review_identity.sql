-- Store the requester identity needed by an organization administrator's
-- review queue. This avoids broadening profiles RLS for users who are not
-- members yet; auth.users remains authoritative for authentication.

alter table public.organization_join_requests
  add column if not exists requester_email text,
  add column if not exists requester_display_name text;

update public.organization_join_requests request_row
set
  requester_email = lower(auth_user.email),
  requester_display_name = coalesce(
    nullif(profile.display_name, ''),
    nullif(
      btrim(concat_ws(' ', auth_user.raw_user_meta_data ->> 'first_name', auth_user.raw_user_meta_data ->> 'last_name')),
      ''
    ),
    lower(auth_user.email)
  )
from auth.users auth_user
left join public.profiles profile on profile.id = auth_user.id
where request_row.user_id = auth_user.id
  and (request_row.requester_email is null or request_row.requester_display_name is null);

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
  requester_email_value text;
  requester_display_name_value text;
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

  select
    lower(auth_user.email),
    coalesce(
      nullif(profile.display_name, ''),
      nullif(
        btrim(concat_ws(' ', auth_user.raw_user_meta_data ->> 'first_name', auth_user.raw_user_meta_data ->> 'last_name')),
        ''
      ),
      lower(auth_user.email)
    )
  into requester_email_value, requester_display_name_value
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_user_id;

  insert into public.organization_join_requests (
    id,
    organization_id,
    user_id,
    requester_email,
    requester_display_name,
    message,
    status
  )
  values (
    request_id,
    requested_organization_id,
    actor_user_id,
    requester_email_value,
    requester_display_name_value,
    normalized_message,
    'pending'
  );

  perform public.write_audit_log(
    requested_organization_id,
    'organization.join_request_created',
    'organization_join_request',
    request_id,
    null,
    jsonb_build_object(
      'user_id', actor_user_id,
      'requester_email', requester_email_value,
      'message', normalized_message
    )
  );

  return request_id;
end;
$$;

comment on column public.organization_join_requests.requester_email is
  'Snapshot used by organization reviewers; auth.users remains authoritative.';
