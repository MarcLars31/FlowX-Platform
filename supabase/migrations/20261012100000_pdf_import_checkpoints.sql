-- Temporary extraction/OCR payloads are service-only Storage objects, never job JSON.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('pdf-import-cache','pdf-import-cache',false,4000000,array['application/json'])
on conflict(id) do update set public=false,file_size_limit=4000000,allowed_mime_types=array['application/json'];

-- Deny this bucket even if another permissive Storage policy is added later.
create policy pdf_import_cache_service_only on storage.objects as restrictive for all to anon,authenticated
 using (bucket_id <> 'pdf-import-cache') with check (bucket_id <> 'pdf-import-cache');

create table public.technical_description_checkpoints (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.technical_description_jobs(id),
 kind text not null check(kind in ('text','ocr')),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 cache_version text not null,
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 storage_path text not null unique,
 page_numbers integer[] not null check(cardinality(page_numbers) between 1 and case when kind='ocr' then 10 else 100 end),
 ready boolean not null default false,
 created_at timestamptz not null default now(),
 unique(job_id,kind,cache_version,source_sha256,payload_sha256)
);
alter table public.technical_description_checkpoints enable row level security;
revoke all on public.technical_description_checkpoints from public,anon,authenticated;
grant select,insert,update,delete on public.technical_description_checkpoints to service_role;
create index technical_description_checkpoints_job on public.technical_description_checkpoints(job_id,kind);
alter table public.document_pages add column content_sha256 text;
alter table public.project_documents add column import_summary jsonb;

-- Register before Storage upload, so interrupted uploads are tracked for cleanup.
-- Service-only, with the current submitting user's permissions checked again.
create function public.reserve_pdf_ocr_checkpoint(requested_job_id uuid, requested_user_id uuid,
 requested_hash text, requested_pages integer[]) returns public.technical_description_checkpoints
language plpgsql security definer set search_path=pg_catalog as $$
declare job public.technical_description_jobs; item public.technical_description_checkpoints;
 original_sub text := current_setting('request.jwt.claim.sub',true);
 original_claims text := current_setting('request.jwt.claims',true); allowed boolean; expected jsonb;
begin
 select * into job from public.technical_description_jobs where id=requested_job_id and created_by=requested_user_id for update;
 if not found then raise exception 'Import denied' using errcode='42501'; end if;
 perform set_config('request.jwt.claim.sub',requested_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',requested_user_id,'role','authenticated')::text,true);
 allowed := public.can_access_project(job.project_id) and public.has_permission(job.organization_id,'technical_description.create')
   and public.has_permission(job.organization_id,'project.requirement.create');
 perform set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(original_claims,''),true);
 if not coalesce(allowed,false) then raise exception 'Import denied' using errcode='42501'; end if;
 select * into item from public.technical_description_checkpoints where job_id=job.id and kind='ocr' and payload_sha256=requested_hash;
 if found and item.ready then return item; end if;
 expected := coalesce(job.result->'requiredPageNumbers',job.result->'pageNumbers');
 if job.status <> 'awaiting_ocr' or requested_hash !~ '^[a-f0-9]{64}$' or cardinality(requested_pages) not between 1 and 10
   or requested_pages is null or expected is null or exists(select 1 from unnest(requested_pages) p where p is null or p<1 or not expected @> to_jsonb(array[p])) then
   raise exception 'Invalid OCR checkpoint' using errcode='22023';
 end if;
 insert into public.technical_description_checkpoints(job_id,kind,source_sha256,cache_version,payload_sha256,storage_path,page_numbers)
 values(job.id,'ocr',repeat('0',64),'ocr-v1',requested_hash,job.organization_id::text||'/'||job.project_id::text||'/'||job.id::text||'/ocr/'||requested_hash||'.json',requested_pages)
 on conflict(job_id,kind,cache_version,source_sha256,payload_sha256) do update set payload_sha256=excluded.payload_sha256
 returning * into item;
 return item;
end; $$;

create function public.finish_pdf_ocr_checkpoint(requested_id uuid,requested_user_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare item public.technical_description_checkpoints; job public.technical_description_jobs; remaining jsonb; expected jsonb;
begin
 select * into item from public.technical_description_checkpoints where id=requested_id and kind='ocr';
 if not found then raise exception 'Unknown checkpoint'; end if;
 -- Reuse the same authorization check, including permission revocation during upload.
 perform public.reserve_pdf_ocr_checkpoint(item.job_id,requested_user_id,item.payload_sha256,item.page_numbers);
 -- The job lock may have waited for another finish; refresh the ready marker.
 select * into item from public.technical_description_checkpoints where id=requested_id;
 select * into job from public.technical_description_jobs where id=item.job_id for update;
 if item.ready then return jsonb_build_object('jobId',job.id,'status',job.status); end if;
 update public.technical_description_checkpoints set ready=true where id=item.id;
 expected := coalesce(job.result->'requiredPageNumbers',job.result->'pageNumbers');
 select coalesce(jsonb_agg(p order by p),'[]'::jsonb) into remaining from jsonb_array_elements(expected) p
 where not exists(select 1 from public.technical_description_checkpoints c where c.job_id=job.id and c.kind='ocr' and c.ready and (p::text)::integer=any(c.page_numbers));
 update public.technical_description_jobs set result=jsonb_set(jsonb_set(result,'{requiredPageNumbers}',expected),'{pageNumbers}',remaining),
 status=case when jsonb_array_length(remaining)=0 then 'queued' else 'awaiting_ocr' end,
 phase=case when jsonb_array_length(remaining)=0 then 'queued' else 'awaiting_ocr' end,
 next_attempt_at=now(),attempts=0,updated_at=now() where id=job.id returning * into job;
 return jsonb_build_object('jobId',job.id,'status',job.status);
end; $$;
revoke all on function public.reserve_pdf_ocr_checkpoint(uuid,uuid,text,integer[]) from public,anon,authenticated;
revoke all on function public.finish_pdf_ocr_checkpoint(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_pdf_ocr_checkpoint(uuid,uuid,text,integer[]) to service_role;
grant execute on function public.finish_pdf_ocr_checkpoint(uuid,uuid) to service_role;

create function public.pdf_import_checkpoints_to_clean() returns setof public.technical_description_checkpoints
language sql security definer set search_path=pg_catalog as $$
 select c.* from public.technical_description_checkpoints c join public.technical_description_jobs j on j.id=c.job_id
 where (j.status='completed' or (j.status='failed' and j.updated_at<now()-interval '7 days')
 or not exists(select 1 from public.projects p where p.id=j.project_id and p.deleted_at is null
   and coalesce(p.status,'') not in ('completed','archived') and coalesce(p.current_stage,'')<>'completed'))
 and (c.ready or c.created_at<now()-interval '10 minutes')
 order by c.created_at limit 25
$$;
revoke all on function public.pdf_import_checkpoints_to_clean() from public,anon,authenticated;
grant execute on function public.pdf_import_checkpoints_to_clean() to service_role;

-- Cleanup must wake the scheduler even when the last import has completed.
do $migration$ begin
  if to_regclass('cron.job') is not null then
    execute $sql$select cron.alter_job((select jobid from cron.job where jobname='scipx-import-worker'),command:=$job$
      select net.http_post(url:='https://www.scipx.ai/api/internal/import-worker',
        headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='scipx_import_scheduler')),
        body:='{}'::jsonb,timeout_milliseconds:=5000)
      where exists(select 1 from public.technical_description_jobs where next_attempt_at<=now() and (status='queued' or (status='running' and lease_until<now())))
        or exists(select 1 from public.project_pdf_cleanup where available_at<=now())
        or exists(select 1 from public.pdf_import_checkpoints_to_clean());
    $job$)$sql$;
  end if;
end $migration$;
