-- Reuse the authenticated scheduler; installation remains a production release step.
do $migration$ begin
 if to_regclass('cron.job') is not null then
  execute $sql$select cron.alter_job((select jobid from cron.job where jobname='scipx-import-worker'),command:=$job$
   select net.http_post(url:='https://www.scipx.ai/api/internal/import-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='scipx_import_scheduler')),
    body:='{}'::jsonb,timeout_milliseconds:=5000)
   where exists(select 1 from public.technical_description_jobs where
     (next_attempt_at<=now() and (status='queued' or (status='running' and lease_until<now())))
     or (status='awaiting_ocr' and updated_at<now()-interval '14 days'))
    or exists(select 1 from public.product_document_jobs where next_attempt_at<=now() and (status='queued' or (status='running' and lease_until<now())))
    or exists(select 1 from public.project_pdf_cleanup where available_at<=now())
    or exists(select 1 from public.pdf_import_checkpoints_to_clean())
    or exists(select 1 from public.temporary_pdf_uploads u where (u.cleanup_requested or u.expires_at<=now()) and coalesce(u.lease_until,now())<=now()
      and not exists(select 1 from public.technical_description_jobs j where j.organization_id=u.organization_id and j.created_by=u.user_id and j.upload_id=u.upload_id
       and (j.status in ('queued','running','awaiting_ocr') or (j.status='failed' and j.updated_at>now()-interval '7 days'))));
   $job$)$sql$;
 end if;
end $migration$;
