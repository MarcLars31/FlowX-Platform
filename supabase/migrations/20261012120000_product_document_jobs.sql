-- Preserve immutable source versions and resume product processing after worker loss.
alter table public.documents add column supersedes_document_id uuid references public.documents(id),
 add column is_current_version boolean not null default true,
 add column processing_requested boolean not null default false;
alter table public.documents drop constraint documents_number_manufacturer_unique;
create unique index documents_current_number_manufacturer on public.documents(manufacturer_id,document_number) nulls not distinct
 where document_number is not null and is_current_version and deleted_at is null;
drop index public.documents_canonical_url_uidx;
create unique index documents_canonical_url_uidx on public.documents(lower(canonical_url))
 where canonical_url is not null and deleted_at is null and is_current_version;
create function public.version_product_document() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare previous uuid;
begin
 if new.canonical_url is not null and new.pdf_sha256 is not null then
  perform pg_advisory_xact_lock(hashtextextended('product-document-url:'||lower(new.canonical_url),0));
  select id into previous from public.documents where lower(canonical_url)=lower(new.canonical_url)
   and deleted_at is null and is_current_version for update;
  if previous is not null then
   new.supersedes_document_id:=previous;
   update public.documents set is_current_version=false where id=previous;
   update public.product_document_jobs set status='failed',error_code='DOCUMENT_SUPERSEDED',updated_at=now() where document_id=previous and status='queued';
  end if;
 end if;
 return new;
end; $$;
revoke all on function public.version_product_document() from public,anon,authenticated;
create trigger product_document_version before insert on public.documents for each row execute function public.version_product_document();

create table public.product_document_jobs (
 document_id uuid primary key references public.documents(id) on delete cascade,
 requested_by uuid references auth.users(id) on delete set null,
 trigger_type text not null check(trigger_type in ('initial','automatic_retry','manual_retry','reader_upgrade')),
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 attempts integer not null default 0, lease_id uuid, lease_until timestamptz,
 next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), error_code text
);
alter table public.product_document_jobs enable row level security;
revoke all on public.product_document_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.product_document_jobs to service_role;
create index product_document_jobs_ready on public.product_document_jobs(next_attempt_at) where status in ('queued','running');
create function public.enqueue_product_document_job(requested_document_id uuid,requested_by uuid default null,requested_trigger text default 'manual_retry')
returns public.product_document_jobs language plpgsql security definer set search_path=pg_catalog as $$
declare job public.product_document_jobs;
begin
 if not exists(select 1 from public.documents where id=requested_document_id and deleted_at is null) then
  raise exception 'Document not found' using errcode='P0002'; end if;
 if not exists(select 1 from public.documents where id=requested_document_id and is_current_version) then
  raise exception 'Document version superseded' using errcode='55000'; end if;
 insert into public.product_document_jobs(document_id,requested_by,trigger_type) values(requested_document_id,requested_by,requested_trigger)
 on conflict(document_id) do update set status='queued',attempts=0,next_attempt_at=now(),updated_at=now(),
 requested_by=excluded.requested_by,trigger_type=excluded.trigger_type,error_code=null
 where product_document_jobs.status not in ('queued','running');
 select * into job from public.product_document_jobs where document_id=requested_document_id;
 return job;
end; $$;
create function public.queue_new_product_document() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.processing_requested then perform public.enqueue_product_document_job(new.id,auth.uid(),'initial'); end if;
 return null;
end; $$;
create trigger product_document_queued after insert on public.documents for each row execute function public.queue_new_product_document();
create function public.claim_product_document_job(requested_document_id uuid default null) returns public.product_document_jobs
language plpgsql security definer set search_path=pg_catalog as $$
declare job public.product_document_jobs;
begin
 perform pg_advisory_xact_lock(121020261200);
 update public.product_document_jobs j set status='failed',error_code='DOCUMENT_SUPERSEDED',updated_at=now()
 where (j.status='queued' or (j.status='running' and j.lease_until<now()))
 and not exists(select 1 from public.documents d where d.id=j.document_id and d.deleted_at is null and d.is_current_version);
 if exists(select 1 from public.product_document_jobs where status='running' and lease_until>now()) then return null; end if;
 update public.product_document_jobs set status='failed',error_code='RETRY_LIMIT',updated_at=now()
  where status in ('queued','running') and attempts>=5 and coalesce(lease_until,now())<=now();
 select j.* into job from public.product_document_jobs j join public.documents d on d.id=j.document_id and d.deleted_at is null and d.is_current_version
 where (requested_document_id is null or j.document_id=requested_document_id) and j.attempts<5 and j.next_attempt_at<=now()
 and (j.status='queued' or (j.status='running' and j.lease_until<now())) order by j.next_attempt_at,j.created_at for update of j skip locked limit 1;
 if not found then return null; end if;
 update public.product_document_jobs set status='running',attempts=attempts+1,lease_id=gen_random_uuid(),
 lease_until=now()+interval '6 minutes',updated_at=now() where document_id=job.document_id returning * into job;
 return job;
end; $$;
revoke all on function public.enqueue_product_document_job(uuid,uuid,text),public.claim_product_document_job(uuid),public.queue_new_product_document() from public,anon,authenticated;
grant execute on function public.enqueue_product_document_job(uuid,uuid,text),public.claim_product_document_job(uuid) to service_role;

-- The original attempt remains in the immutable history with an explicit timeout.
alter function public.begin_product_document_processing(uuid,text,text,text,uuid) rename to begin_product_document_processing_v1;
revoke all on function public.begin_product_document_processing_v1(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
create function public.begin_product_document_processing(p_document_id uuid,p_trigger_type text,p_idempotency_key text,p_reader_version text,p_requested_by uuid default null)
returns public.product_document_processing_attempts language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_document_id::text,0));
 update public.product_document_processing_attempts set status='failed',error_code='timeout',
 admin_error_message='Bearbetningen avbröts. Ett nytt försök har startats.',completed_at=now()
 where document_id=p_document_id and status in ('pending','processing') and coalesce(started_at,created_at)<now()-interval '6 minutes';
 return public.begin_product_document_processing_v1(p_document_id,p_trigger_type,p_idempotency_key,p_reader_version,p_requested_by);
end; $$;
revoke all on function public.begin_product_document_processing(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.begin_product_document_processing(uuid,text,text,text,uuid) to service_role;

-- An old worker cannot update catalog evidence after a newer source arrives.
alter function public.stage_product_document_extraction(uuid,uuid,jsonb,jsonb) rename to stage_product_document_extraction_v1;
revoke all on function public.stage_product_document_extraction_v1(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.stage_product_document_extraction(p_attempt_id uuid,p_document_id uuid,p_products jsonb,p_document_info jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from public.documents where id=p_document_id and deleted_at is null and is_current_version for update;
 if not found then raise exception 'Document version superseded' using errcode='55000'; end if;
 return public.stage_product_document_extraction_v1(p_attempt_id,p_document_id,p_products,p_document_info);
end; $$;
revoke all on function public.stage_product_document_extraction(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.stage_product_document_extraction(uuid,uuid,jsonb,jsonb) to service_role;

insert into public.product_document_jobs(document_id,trigger_type)
select id,'manual_retry' from public.documents where is_current_version and deleted_at is null and current_processing_status='processing'
on conflict(document_id) do nothing;
