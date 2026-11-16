create table public.login_rate_limits (key text primary key check(key ~ '^[a-f0-9]{64}$'), window_start timestamptz not null, attempts integer not null);
alter table public.login_rate_limits enable row level security;
revoke all on public.login_rate_limits from public,anon,authenticated;
grant all on public.login_rate_limits to service_role;
create index login_rate_limits_window on public.login_rate_limits(window_start);
create function public.consume_login_rate_limit(requested_ip_hash text,requested_account_hash text) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare subject text; used integer; cap integer;
begin
 if requested_ip_hash !~ '^[a-f0-9]{64}$' or requested_account_hash !~ '^[a-f0-9]{64}$' or requested_ip_hash is null or requested_account_hash is null then raise exception 'Invalid rate key'; end if;
 perform pg_advisory_xact_lock(121020261240);
 delete from public.login_rate_limits where key in (select key from public.login_rate_limits where window_start<now()-interval '5 minutes' order by window_start limit 100);
 foreach subject in array array[requested_ip_hash,requested_account_hash] loop
  cap:=case when subject=requested_ip_hash then 12 else 8 end;
  select attempts into used from public.login_rate_limits where key=subject and window_start>now()-interval '5 minutes';
  if coalesce(used,0)>=cap then return false; end if;
  if used is null and (select count(*) from public.login_rate_limits)>=20000 then return false; end if;
  insert into public.login_rate_limits(key,window_start,attempts) values(subject,now(),1)
  on conflict(key) do update set attempts=case when login_rate_limits.window_start<=now()-interval '5 minutes' then 1 else login_rate_limits.attempts+1 end,
  window_start=case when login_rate_limits.window_start<=now()-interval '5 minutes' then now() else login_rate_limits.window_start end;
 end loop;
 return true;
end; $$;
revoke all on function public.consume_login_rate_limit(text,text) from public,anon,authenticated;
grant execute on function public.consume_login_rate_limit(text,text) to service_role;
