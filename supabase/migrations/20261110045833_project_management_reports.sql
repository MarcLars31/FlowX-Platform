begin;
-- One MVCC snapshot for current work, open help and review history. The existing
-- management reader is the authority for tenant, membership and post scope.
create schema scipx_report_internal;
revoke all on schema scipx_report_internal from public,anon;
grant usage on schema scipx_report_internal to authenticated;

create function scipx_report_internal.read(pid uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare snapshot jsonb; visible_ids uuid[]; reviews jsonb; help jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 snapshot:=public.read_project_management(pid);
 select coalesce(array_agg((p->>'id')::uuid),'{}'::uuid[]) into visible_ids
 from jsonb_array_elements(snapshot->'posts') p;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'requirementId',e.requirement_id,
   'state',e.state,'actor',coalesce(nullif(pr.display_name,''),pr.email,'Prosjektdeltaker'),
   'note',e.note,'createdAt',e.created_at) order by e.created_at,e.id),'[]') into reviews
 from public.project_work_reviews e left join public.profiles pr on pr.id=e.actor_id
 where e.project_id=pid and e.requirement_id=any(visible_ids);
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'requirementId',h.requirement_id,
   'description',h.description,'createdAt',h.created_at) order by h.created_at,h.id),'[]') into help
 from public.project_help_requests h
 where h.project_id=pid and h.requirement_id=any(visible_ids) and h.resolved_at is null;
 return jsonb_build_object('snapshot',snapshot,'reviews',reviews,'help',help,'generatedAt',statement_timestamp());
end $$;
revoke all on function scipx_report_internal.read(uuid) from public,anon;
grant execute on function scipx_report_internal.read(uuid) to authenticated;
create function public.read_project_reports(pid uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
 select scipx_report_internal.read(pid);
$$;
revoke all on function public.read_project_reports(uuid) from public,anon;
grant execute on function public.read_project_reports(uuid) to authenticated;
commit;
