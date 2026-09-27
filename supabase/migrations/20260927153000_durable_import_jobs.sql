create table public.technical_description_jobs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id), created_by uuid not null references auth.users(id),
  upload_id uuid not null, file_name text not null, created_project boolean not null default false,
  status text not null default 'queued' check(status in ('queued','running','awaiting_ocr','completed','failed')),
  phase text not null default 'queued', attempts integer not null default 0,
  lease_id uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
  ocr_pages jsonb, result jsonb, error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,created_by,upload_id)
);
alter table public.technical_description_jobs enable row level security;
revoke all on public.technical_description_jobs from public,anon,authenticated;
grant select on public.technical_description_jobs to authenticated;
grant select,insert,update on public.technical_description_jobs to service_role;
create policy own_import_jobs on public.technical_description_jobs for select to authenticated using (
  created_by=auth.uid() and public.can_access_project(project_id) and public.has_permission(organization_id,'technical_description.view')
);
create index import_jobs_owner_recent on public.technical_description_jobs(created_by,created_at desc);
create index import_jobs_ready on public.technical_description_jobs(next_attempt_at) where status in ('queued','running');

create function public.enqueue_technical_description_job(requested_organization_id uuid, requested_project_id uuid,
  requested_upload_id uuid, requested_file_name text, requested_create_project boolean default false, requested_ocr_pages jsonb default null)
returns public.technical_description_jobs language plpgsql security definer set search_path=pg_catalog as $$
declare job public.technical_description_jobs; target_project uuid := requested_project_id;
begin
  if auth.uid() is null or not public.has_permission(requested_organization_id,'technical_description.create')
    or not public.has_permission(requested_organization_id,'project.requirement.create') then
    raise exception 'Import denied' using errcode='42501';
  end if;
  if requested_upload_id is null or requested_file_name is null or length(requested_file_name) not between 5 and 255 or requested_file_name !~* '\.pdf$' then
    raise exception 'Invalid upload' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':technical-import',0));
  select * into job from public.technical_description_jobs where organization_id=requested_organization_id and created_by=auth.uid() and upload_id=requested_upload_id for update;
  if found then
    if not public.can_access_project(job.project_id) then raise exception 'Import denied' using errcode='42501'; end if;
    if job.status = 'awaiting_ocr' and requested_ocr_pages is not null then
      if jsonb_typeof(requested_ocr_pages) <> 'array' or octet_length(requested_ocr_pages::text)>4000000 then raise exception 'Invalid OCR' using errcode='22023'; end if;
      update public.technical_description_jobs set ocr_pages=requested_ocr_pages,status='queued',phase='queued',next_attempt_at=now(),attempts=0,updated_at=now() where id=job.id returning * into job;
    end if;
    return job;
  end if;
  if (select count(*) from public.technical_description_jobs where created_by=auth.uid() and status in ('queued','running','awaiting_ocr') and public.can_access_project(project_id))>=3 then
    raise exception 'At most three active imports per user' using errcode='54000';
  end if;
  if target_project is null then
    if not requested_create_project then raise exception 'Project required'; end if;
    target_project := public.create_project_with_defaults(requested_organization_id,null,
      left(regexp_replace(requested_file_name,'\.pdf$','','i'),200),requested_owner_user_id=>auth.uid(),requested_system_type=>'Fastställs från underlaget');
  elsif not public.can_access_project(target_project) or not exists(select 1 from public.projects where id=target_project and organization_id=requested_organization_id and deleted_at is null) then
    raise exception 'Project access denied' using errcode='42501';
  end if;
  insert into public.technical_description_jobs(organization_id,project_id,created_by,upload_id,file_name,created_project)
    values(requested_organization_id,target_project,auth.uid(),requested_upload_id,requested_file_name,requested_project_id is null) returning * into job;
  return job;
end; $$;

create function public.claim_technical_description_job(requested_job_id uuid default null)
returns public.technical_description_jobs language plpgsql security definer set search_path=pg_catalog as $$
declare job public.technical_description_jobs;
begin
  -- One import at a time on the small database, independent of browser lifetime.
  perform pg_advisory_xact_lock(92720261530);
  if exists(select 1 from public.technical_description_jobs where status='running' and lease_until>now()) then return null; end if;
  update public.technical_description_jobs set status='failed',error_code='RETRY_LIMIT',updated_at=now()
    where status in ('queued','running') and attempts>=5 and coalesce(lease_until,now())<=now();
  select * into job from public.technical_description_jobs where
    (requested_job_id is null or id=requested_job_id) and attempts<5 and next_attempt_at<=now()
    and (status='queued' or (status='running' and lease_until<now())) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.technical_description_jobs set status='running',phase='extracting',attempts=attempts+1,
    lease_id=gen_random_uuid(),lease_until=now()+interval '330 seconds',updated_at=now() where id=job.id returning * into job;
  return job;
end; $$;
revoke all on function public.enqueue_technical_description_job(uuid,uuid,uuid,text,boolean,jsonb) from public;
grant execute on function public.enqueue_technical_description_job(uuid,uuid,uuid,text,boolean,jsonb) to authenticated;
revoke all on function public.claim_technical_description_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_technical_description_job(uuid) to service_role;

-- A lease-scoped authorization check uses the submitter's current permissions.
-- No user tokens or refresh credentials are kept by the job.
create function public.authorize_technical_description_job(requested_job_id uuid, requested_lease uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare job public.technical_description_jobs; allowed boolean; original_claims text := current_setting('request.jwt.claims',true); original_sub text := current_setting('request.jwt.claim.sub',true);
begin
  select * into job from public.technical_description_jobs where id=requested_job_id and lease_id=requested_lease and status='running' and lease_until>now();
  if not found then return false; end if;
  perform set_config('request.jwt.claim.sub',job.created_by::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',job.created_by,'role','authenticated')::text,true);
  allowed := public.can_access_project(job.project_id) and public.has_permission(job.organization_id,'technical_description.create')
    and public.has_permission(job.organization_id,'project.requirement.create');
  perform set_config('request.jwt.claims',coalesce(original_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);
  return coalesce(allowed,false);
end; $$;
revoke all on function public.authorize_technical_description_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.authorize_technical_description_job(uuid,uuid) to service_role;

create function public.retry_technical_description_job(requested_job_id uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare job public.technical_description_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':technical-import',0));
  select * into job from public.technical_description_jobs where id=requested_job_id and created_by=auth.uid() and status='failed' for update;
  if not found or not public.can_access_project(job.project_id) or not public.has_permission(job.organization_id,'technical_description.create') or not public.has_permission(job.organization_id,'project.requirement.create') then
    raise exception 'Import retry denied' using errcode='42501';
  end if;
  if (select count(*) from public.technical_description_jobs where created_by=auth.uid() and status in ('queued','running','awaiting_ocr') and public.can_access_project(project_id))>=3 then
    raise exception 'At most three active imports per user' using errcode='54000';
  end if;
  update public.technical_description_jobs set status='queued',phase='queued',attempts=0,next_attempt_at=now(),error_code=null,updated_at=now() where id=job.id;
  return job.id;
end; $$;
revoke all on function public.retry_technical_description_job(uuid) from public;
grant execute on function public.retry_technical_description_job(uuid) to authenticated;
