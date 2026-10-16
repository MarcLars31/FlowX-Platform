-- Source originals live for the project's lifetime. A durable outbox makes
-- Storage deletion retryable without changing post data or keeping PDF bytes in SQL.
create table public.project_pdf_cleanup (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  document_id uuid not null,
  storage_bucket text not null check (storage_bucket = 'project-files'),
  storage_path text not null,
  available_at timestamptz not null default now(),
  lease_id uuid,
  attempts integer not null default 0,
  unique(storage_bucket,storage_path),
  check (starts_with(storage_path,organization_id::text || '/' || project_id::text || '/'))
);
alter table public.project_pdf_cleanup enable row level security;
revoke all on public.project_pdf_cleanup from public,anon,authenticated;
grant select,insert,update,delete on public.project_pdf_cleanup to service_role;
create index project_pdf_cleanup_due on public.project_pdf_cleanup(available_at);

create function public.queue_project_pdf_cleanup() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.projects;
begin
  if tg_table_name='projects' then
    if tg_op='DELETE' then p:=old; else p:=new; end if;
  else
    select * into p from public.projects where id=new.project_id and organization_id=new.organization_id for share;
  end if;
  if p.id is null or (tg_op<>'DELETE' and p.deleted_at is null and coalesce(p.current_stage,'')<>'completed'
    and coalesce(p.status,'') not in ('completed','archived')) then return null; end if;
  insert into public.project_pdf_cleanup(organization_id,project_id,document_id,storage_bucket,storage_path)
    select d.organization_id,d.project_id,d.id,d.storage_bucket,d.storage_path
    from public.project_documents d
    where d.project_id=p.id and d.organization_id=p.organization_id
      and d.document_type='technical_description' and d.storage_bucket='project-files'
      and starts_with(d.storage_path,p.organization_id::text || '/' || p.id::text || '/')
    on conflict(storage_bucket,storage_path) do nothing;
  if tg_op='DELETE' then return old; end if;
  return null;
end;
$$;
revoke all on function public.queue_project_pdf_cleanup() from public,anon,authenticated;
create trigger project_originals_closed after update of current_stage,status,deleted_at on public.projects
  for each row execute function public.queue_project_pdf_cleanup();
-- Before a permanent delete, queue paths while their document metadata still exists.
create trigger project_originals_deleted before delete on public.projects
  for each row execute function public.queue_project_pdf_cleanup();
-- Also cover an import finishing at the same time that the project is closed.
create trigger project_originals_late_import after insert or update of storage_path on public.project_documents
  for each row when (new.storage_path is not null) execute function public.queue_project_pdf_cleanup();

create function public.claim_project_pdf_cleanup(requested_project_id uuid default null)
returns setof public.project_pdf_cleanup language sql security definer set search_path=pg_catalog as $$
  update public.project_pdf_cleanup q set lease_id=gen_random_uuid(),available_at=now()+interval '2 minutes',attempts=q.attempts+1
  where q.id in (select c.id from public.project_pdf_cleanup c where c.available_at<=now()
    and (requested_project_id is null or c.project_id=requested_project_id)
    order by c.available_at limit 10 for update skip locked) returning q.*;
$$;
create function public.finish_project_pdf_cleanup(requested_id uuid,requested_lease uuid,successful boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare item public.project_pdf_cleanup;
begin
  select * into item from public.project_pdf_cleanup where id=requested_id and lease_id=requested_lease for update;
  if not found then return; end if;
  if successful then
    update public.project_documents set storage_bucket=null,storage_path=null
      where project_id=item.project_id and organization_id=item.organization_id
        and storage_bucket=item.storage_bucket and storage_path=item.storage_path and document_type='technical_description';
    delete from public.project_pdf_cleanup where id=item.id;
  else
    update public.project_pdf_cleanup set lease_id=null,available_at=now()+interval '1 minute' where id=item.id;
  end if;
end;
$$;
revoke all on function public.claim_project_pdf_cleanup(uuid),public.finish_project_pdf_cleanup(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_project_pdf_cleanup(uuid),public.finish_project_pdf_cleanup(uuid,uuid,boolean) to service_role;

-- Reuse the existing authenticated scheduler, and only wake it for pending work.
do $migration$ begin
  if to_regclass('cron.job') is not null then
    execute $sql$select cron.alter_job((select jobid from cron.job where jobname='scipx-import-worker'),command:=$job$
      select net.http_post(url:='https://www.scipx.ai/api/internal/import-worker',
        headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='scipx_import_scheduler')),
        body:='{}'::jsonb,timeout_milliseconds:=5000)
      where exists(select 1 from public.technical_description_jobs where next_attempt_at<=now() and (status='queued' or (status='running' and lease_until<now())))
        or exists(select 1 from public.project_pdf_cleanup where available_at<=now());
    $job$)$sql$;
  end if;
end $migration$;
