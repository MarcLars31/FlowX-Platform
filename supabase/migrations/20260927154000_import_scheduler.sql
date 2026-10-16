-- Scheduler installation is separate from queue schema so the local test
-- database need not include network extensions. The job is enabled on release.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- The scheduler is an internal capability, never a public networking API.
revoke all on schema net, cron from public, anon, authenticated;
revoke all on all tables in schema net, cron from public, anon, authenticated;
revoke execute on all functions in schema net, cron from public, anon, authenticated;
do $$ begin
  if not exists(select 1 from vault.secrets where name='scipx_import_scheduler') then
    perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,'scipx_import_scheduler','Internal import scheduler capability');
  end if;
end $$;
create function public.authorize_import_scheduler(requested_token text) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from vault.decrypted_secrets where name='scipx_import_scheduler' and decrypted_secret=requested_token);
$$;
revoke all on function public.authorize_import_scheduler(text) from public,anon,authenticated;
grant execute on function public.authorize_import_scheduler(text) to service_role;
select cron.schedule('scipx-import-worker','* * * * *',$job$
  select net.http_post(
    url:='https://www.scipx.ai/api/internal/import-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='scipx_import_scheduler')),
    body:='{}'::jsonb,timeout_milliseconds:=5000
  ) where exists(select 1 from public.technical_description_jobs where next_attempt_at<=now() and
    (status='queued' or (status='running' and lease_until<now())));
$job$);
select cron.alter_job((select jobid from cron.job where jobname='scipx-import-worker'),active:=false);
