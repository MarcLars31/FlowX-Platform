-- Public supplier responses only; customer PDF content is never cached here.
create table public.ahlsell_outbound_budget (
  id boolean primary key default true check (id), window_started timestamptz not null default now(),
  used integer not null default 0, blocked_until timestamptz not null default now()
);
insert into public.ahlsell_outbound_budget(id) values(true);
create table public.ahlsell_shared_responses (
  key text primary key check(length(key) = 64), lease_id uuid, lease_until timestamptz,
  expires_at timestamptz, response jsonb
);
alter table public.ahlsell_outbound_budget enable row level security;
alter table public.ahlsell_shared_responses enable row level security;
revoke all on public.ahlsell_outbound_budget, public.ahlsell_shared_responses from anon, authenticated;

create function public.claim_ahlsell_request(requested_key text, requested_lease uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare budget public.ahlsell_outbound_budget; cached public.ahlsell_shared_responses;
begin
  -- One short transaction serializes admission across all server instances.
  select * into budget from public.ahlsell_outbound_budget where id for update;
  select * into cached from public.ahlsell_shared_responses where key = requested_key;
  if cached.expires_at > now() and cached.response is not null then
    return jsonb_build_object('state','cached','response',cached.response);
  end if;
  if cached.lease_until > now() then return jsonb_build_object('state','pending','retryAfter',1); end if;
  if budget.blocked_until > now() then
    return jsonb_build_object('state','limited','retryAfter',greatest(1,ceil(extract(epoch from budget.blocked_until-now()))));
  end if;
  if budget.window_started < now() - interval '1 minute' then
    update public.ahlsell_outbound_budget set used = 0, window_started = now() where id;
    budget.used := 0;
  end if;
  if budget.used >= 120 or (select count(*) from public.ahlsell_shared_responses where lease_until > now()) >= 6 then
    return jsonb_build_object('state','limited','retryAfter',5);
  end if;
  update public.ahlsell_outbound_budget set used = used + 1 where id;
  delete from public.ahlsell_shared_responses where coalesce(expires_at,lease_until) < now()
    and (lease_until is null or lease_until <= now());
  if (select count(*) from public.ahlsell_shared_responses) >= 64 then
    delete from public.ahlsell_shared_responses where key in (
      select key from public.ahlsell_shared_responses where lease_until is null or lease_until<=now()
      order by expires_at nulls first limit 1
    );
  end if;
  insert into public.ahlsell_shared_responses(key,lease_id,lease_until)
    values(requested_key,requested_lease,now()+interval '20 seconds')
    on conflict(key) do update set lease_id = excluded.lease_id, lease_until = excluded.lease_until, expires_at = null, response = null;
  return jsonb_build_object('state','acquired');
end; $$;
create function public.finish_ahlsell_request(requested_key text, requested_lease uuid, requested_response jsonb, requested_backoff integer default 0)
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform id from public.ahlsell_outbound_budget where id for update;
  if requested_response is not null and octet_length(requested_response::text)>140000 then requested_response := null; end if;
  update public.ahlsell_shared_responses set response = requested_response, expires_at = now()+interval '2 minutes', lease_until = null
    where key = requested_key and lease_id = requested_lease and lease_until > now();
  if requested_backoff > 0 then
    update public.ahlsell_outbound_budget set blocked_until = greatest(blocked_until,now()+make_interval(secs=>least(requested_backoff,300))) where id;
  end if;
end; $$;
revoke all on function public.claim_ahlsell_request(text,uuid) from public,anon,authenticated;
revoke all on function public.finish_ahlsell_request(text,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.claim_ahlsell_request(text,uuid) to service_role;
grant execute on function public.finish_ahlsell_request(text,uuid,jsonb,integer) to service_role;
