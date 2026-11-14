-- The queue creates a project before extraction. The production projects table
-- requires customer, country and standard; omitted RPC arguments become NULL.
-- Supply the same organization/customer and locale defaults as the synchronous
-- import, plus a pending standard that extraction replaces. Keep all existing
-- authorization, idempotency and queue limits; do not alter customer projects.
create or replace function public.enqueue_technical_description_job(requested_organization_id uuid, requested_project_id uuid,
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
      left(regexp_replace(requested_file_name,'\.pdf$','','i'),200),
      requested_customer_name => (select name from public.organizations where id=requested_organization_id),
      requested_project_type => 'Teknisk beskrivningsanalys',
      requested_country_code => 'Sweden',
      requested_language_code => 'sv',
      requested_currency_code => 'SEK',
      requested_owner_user_id => auth.uid(),
      requested_standard => 'Fastställs från det tekniska underlaget',
      requested_system_type => 'Fastställs från underlaget',
      requested_delivery_country => 'Sweden');
  elsif not public.can_access_project(target_project) or not exists(select 1 from public.projects where id=target_project and organization_id=requested_organization_id and deleted_at is null) then
    raise exception 'Project access denied' using errcode='42501';
  end if;
  insert into public.technical_description_jobs(organization_id,project_id,created_by,upload_id,file_name,created_project)
    values(requested_organization_id,target_project,auth.uid(),requested_upload_id,requested_file_name,requested_project_id is null) returning * into job;
  return job;
end; $$;
