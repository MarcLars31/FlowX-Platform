-- Bounded, cancellable imports and durable cleanup of staging/checkpoint objects.
alter table public.technical_description_jobs drop constraint technical_description_jobs_status_check;
alter table public.technical_description_jobs add constraint technical_description_jobs_status_check
 check(status in ('queued','running','awaiting_ocr','completed','failed','cancelled'));
alter table public.technical_description_jobs drop constraint technical_description_jobs_project_id_fkey;
alter table public.technical_description_jobs add constraint technical_description_jobs_project_id_fkey
 foreign key(project_id) references public.projects(id) on delete cascade;
alter table public.technical_description_checkpoints drop constraint technical_description_checkpoints_job_id_fkey;
alter table public.technical_description_checkpoints add constraint technical_description_checkpoints_job_id_fkey
 foreign key(job_id) references public.technical_description_jobs(id) on delete cascade;

create table public.temporary_pdf_uploads (
 storage_path text primary key, organization_id uuid not null, user_id uuid not null, upload_id uuid not null,
 expires_at timestamptz not null default now()+interval '24 hours', cleanup_requested boolean not null default false,
 lease_until timestamptz, lease_id uuid,
 check(storage_path=organization_id::text||'/technical-description-uploads/'||user_id::text||'/'||upload_id::text||'.pdf')
);
alter table public.temporary_pdf_uploads enable row level security;
revoke all on public.temporary_pdf_uploads from public,anon,authenticated;
grant all on public.temporary_pdf_uploads to service_role;
create index temporary_pdf_uploads_expiry on public.temporary_pdf_uploads(expires_at);
-- Include files created before upload registration existed.
insert into public.temporary_pdf_uploads(storage_path,organization_id,user_id,upload_id,expires_at)
 select name,split_part(name,'/',1)::uuid,split_part(name,'/',3)::uuid,replace(split_part(name,'/',4),'.pdf','')::uuid,now()+interval '24 hours'
 from storage.objects where bucket_id='project-files' and name ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/technical-description-uploads/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}\.pdf$'
 on conflict do nothing;
create function public.register_temporary_pdf_upload(requested_organization_id uuid,requested_user_id uuid,requested_upload_id uuid)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare path text:=requested_organization_id::text||'/technical-description-uploads/'||requested_user_id::text||'/'||requested_upload_id::text||'.pdf';
begin
 insert into public.temporary_pdf_uploads(storage_path,organization_id,user_id,upload_id) values(path,requested_organization_id,requested_user_id,requested_upload_id) on conflict do nothing;
 return path;
end; $$;
create function public.request_temporary_pdf_cleanup(requested_path text) returns void
language sql security definer set search_path=pg_catalog as $$
 update public.temporary_pdf_uploads set cleanup_requested=true where storage_path=requested_path;
$$;
create function public.expire_abandoned_pdf_imports() returns void language sql security definer set search_path=pg_catalog as $$
 update public.technical_description_jobs set status='cancelled',phase='expired',error_code='IMPORT_EXPIRED',updated_at=now(),
 result=jsonb_build_object('error','Importen avbröts efter 14 dagar utan OCR-aktivitet. Ladda upp filen igen.')
 where status='awaiting_ocr' and updated_at<now()-interval '14 days';
$$;
create function public.claim_temporary_pdf_cleanup() returns setof public.temporary_pdf_uploads
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform public.expire_abandoned_pdf_imports();
 return query update public.temporary_pdf_uploads u set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 where u.storage_path in (select t.storage_path from public.temporary_pdf_uploads t
 where (t.cleanup_requested or t.expires_at<=now()) and coalesce(t.lease_until,now())<=now()
 and not exists(select 1 from public.technical_description_jobs j where j.organization_id=t.organization_id and j.created_by=t.user_id and j.upload_id=t.upload_id
  and (j.status in ('queued','running','awaiting_ocr') or (j.status='failed' and j.updated_at>now()-interval '7 days')))
 order by t.expires_at limit 25 for update skip locked) returning u.*;
end; $$;
create function public.finish_temporary_pdf_cleanup(requested_path text,requested_lease uuid) returns void language sql security definer set search_path=pg_catalog as $$
 -- Retain a tombstone until the upload registration expires, then delete once more.
 -- This catches an in-flight upload that completes after the initial cleanup.
 update public.temporary_pdf_uploads set lease_until=expires_at
 where storage_path=requested_path and lease_id=requested_lease and expires_at>now();
 delete from public.temporary_pdf_uploads where storage_path=requested_path and lease_id=requested_lease and expires_at<=now();
$$;
revoke all on function public.register_temporary_pdf_upload(uuid,uuid,uuid),public.request_temporary_pdf_cleanup(text),public.expire_abandoned_pdf_imports(),public.claim_temporary_pdf_cleanup(),public.finish_temporary_pdf_cleanup(text,uuid) from public,anon,authenticated;
grant execute on function public.register_temporary_pdf_upload(uuid,uuid,uuid),public.request_temporary_pdf_cleanup(text),public.expire_abandoned_pdf_imports(),public.claim_temporary_pdf_cleanup(),public.finish_temporary_pdf_cleanup(text,uuid) to service_role;

create function public.cancel_technical_description_job(requested_job_id uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare job public.technical_description_jobs;
begin
 select * into job from public.technical_description_jobs where id=requested_job_id and created_by=auth.uid() for update;
 if not found or not public.can_access_project(job.project_id) or not public.has_permission(job.organization_id,'technical_description.create') then
  raise exception 'Import cancellation denied' using errcode='42501'; end if;
 if job.status='running' then raise exception 'Wait for the current attempt before cancelling' using errcode='55000'; end if;
 if job.status in ('queued','awaiting_ocr','failed') then
  update public.technical_description_jobs set status='cancelled',phase='cancelled',updated_at=now(),lease_until=null where id=job.id;
  update public.temporary_pdf_uploads set cleanup_requested=true where organization_id=job.organization_id and user_id=job.created_by and upload_id=job.upload_id;
 end if;
 return job.id;
end; $$;
revoke all on function public.cancel_technical_description_job(uuid) from public,anon;
grant execute on function public.cancel_technical_description_job(uuid) to authenticated;

-- Preserve cleanup paths before FK cascades remove the job and checkpoint metadata.
alter table public.project_pdf_cleanup drop constraint project_pdf_cleanup_storage_bucket_check;
alter table public.project_pdf_cleanup add constraint project_pdf_cleanup_storage_bucket_check check(storage_bucket in ('project-files','pdf-import-cache'));
create function public.queue_deleted_import_files() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.project_pdf_cleanup(organization_id,project_id,document_id,storage_bucket,storage_path,available_at)
 select old.organization_id,old.project_id,c.id,'pdf-import-cache',c.storage_path,now()+interval '10 minutes'
 from public.technical_description_checkpoints c where c.job_id=old.id on conflict(storage_bucket,storage_path) do nothing;
 update public.temporary_pdf_uploads set cleanup_requested=true where organization_id=old.organization_id and user_id=old.created_by and upload_id=old.upload_id;
 return old;
end; $$;
revoke all on function public.queue_deleted_import_files() from public,anon,authenticated;
create trigger deleted_import_files before delete on public.technical_description_jobs for each row execute function public.queue_deleted_import_files();

alter function public.enqueue_technical_description_job(uuid,uuid,uuid,text,boolean,jsonb) rename to enqueue_technical_description_job_v1;
revoke all on function public.enqueue_technical_description_job_v1(uuid,uuid,uuid,text,boolean,jsonb) from public,anon,authenticated,service_role;
create function public.enqueue_technical_description_job(requested_organization_id uuid,requested_project_id uuid,requested_upload_id uuid,requested_file_name text,requested_create_project boolean default false,requested_ocr_pages jsonb default null)
returns public.technical_description_jobs language plpgsql security definer set search_path=pg_catalog as $$
declare upload public.temporary_pdf_uploads;
begin
 perform public.expire_abandoned_pdf_imports();
 select * into upload from public.temporary_pdf_uploads where organization_id=requested_organization_id and user_id=auth.uid() and upload_id=requested_upload_id for update;
 if upload.storage_path is null and not exists(select 1 from public.technical_description_jobs where organization_id=requested_organization_id and created_by=auth.uid() and upload_id=requested_upload_id) then
  raise exception 'Upload expired; upload the PDF again' using errcode='22023'; end if;
 if upload.lease_id is not null then raise exception 'Upload expired; upload the PDF again' using errcode='22023'; end if;
 return public.enqueue_technical_description_job_v1(requested_organization_id,requested_project_id,requested_upload_id,requested_file_name,requested_create_project,requested_ocr_pages);
end; $$;
revoke all on function public.enqueue_technical_description_job(uuid,uuid,uuid,text,boolean,jsonb) from public,anon;
grant execute on function public.enqueue_technical_description_job(uuid,uuid,uuid,text,boolean,jsonb) to authenticated;
create or replace function public.pdf_import_checkpoints_to_clean() returns setof public.technical_description_checkpoints
language sql security definer set search_path=pg_catalog as $$
 select c.* from public.technical_description_checkpoints c join public.technical_description_jobs j on j.id=c.job_id
 where (j.status in ('completed','cancelled') or (j.status='failed' and j.updated_at<now()-interval '7 days')
 or not exists(select 1 from public.projects p where p.id=j.project_id and p.deleted_at is null
   and coalesce(p.status,'') not in ('completed','archived') and coalesce(p.current_stage,'')<>'completed'))
 and (c.ready or c.created_at<now()-interval '10 minutes')
 order by c.created_at limit 25
$$;
create or replace function public.claim_technical_description_job(requested_job_id uuid default null)
returns public.technical_description_jobs language plpgsql security definer set search_path=pg_catalog as $$
declare job public.technical_description_jobs;
begin
  -- Bound parsing globally and to one job per organization. Writes have their own lease.
  perform pg_advisory_xact_lock(92720261530);
  perform public.expire_abandoned_pdf_imports();
  if (select count(*) from public.technical_description_jobs where status='running' and lease_until>now())>=2 then return null; end if;
  update public.technical_description_jobs set status='failed',error_code='RETRY_LIMIT',updated_at=now()
    where status in ('queued','running') and attempts>=5 and coalesce(lease_until,now())<=now();
  select * into job from public.technical_description_jobs candidate where
    (requested_job_id is null or id=requested_job_id) and attempts<5 and next_attempt_at<=now()
    and not exists(select 1 from public.technical_description_jobs active where active.organization_id=candidate.organization_id and active.status='running' and active.lease_until>now())
    and (status='queued' or (status='running' and lease_until<now())) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.technical_description_jobs set status='running',phase='extracting',attempts=attempts+1,
    lease_id=gen_random_uuid(),lease_until=now()+interval '330 seconds',updated_at=now() where id=job.id returning * into job;
  return job;
end; $$;

create function public.enter_pdf_import_write_phase(requested_job_id uuid,requested_lease uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(121020261210);
 if not public.authorize_technical_description_job(requested_job_id,requested_lease) then return false; end if;
 if exists(select 1 from public.technical_description_jobs where id<>requested_job_id and status='running' and lease_until>now() and phase in ('persisting','finalizing')) then return false; end if;
 update public.technical_description_jobs set phase='persisting' where id=requested_job_id and lease_id=requested_lease and status='running';
 return found;
end; $$;
revoke all on function public.enter_pdf_import_write_phase(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enter_pdf_import_write_phase(uuid,uuid) to service_role;

create function public.finish_temporary_pdf_cleanup_batch(entries jsonb) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>25 then raise exception 'Invalid cleanup batch'; end if;
 update public.temporary_pdf_uploads u set lease_until=u.expires_at
 from jsonb_to_recordset(entries) e(storage_path text,lease_id uuid)
 where u.storage_path=e.storage_path and u.lease_id=e.lease_id and u.expires_at>now();
 delete from public.temporary_pdf_uploads u using jsonb_to_recordset(entries) e(storage_path text,lease_id uuid)
 where u.storage_path=e.storage_path and u.lease_id=e.lease_id and u.expires_at<=now();
end; $$;
revoke all on function public.finish_temporary_pdf_cleanup_batch(jsonb) from public,anon,authenticated;
grant execute on function public.finish_temporary_pdf_cleanup_batch(jsonb) to service_role;
