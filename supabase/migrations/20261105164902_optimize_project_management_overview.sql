-- Resolve enabled, authorized projects before evaluating per-post aggregates.
-- Without this boundary the planner can evaluate legacy projects first, causing
-- an 8s timeout even when the organization has no project management settings.
-- Keep the existing security mode, grants and every access predicate unchanged.
create or replace function public.project_management_overview(oid uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with visible_projects as materialized (
   select p.id,p.name,s.deadline
   from public.projects p
   join public.project_management_settings s on s.project_id=p.id
   where p.organization_id=oid and p.deleted_at is null
     and public.can_access_project(p.id)
     and exists(select 1 from public.organization_members m
       where m.organization_id=oid and m.user_id=auth.uid() and m.status='active')
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.name,'manager',public.is_delivery_manager(p.id),'deadline',p.deadline,
   'total',counts.total,'done',counts.done,'late',counts.late,'help',counts.help,
   'unassigned',counts.unassigned) order by p.name,p.id),'[]'::jsonb)
 from visible_projects p
 cross join lateral (
   select count(*) as total,count(*) filter(where ts.done) as done,
     count(*) filter(where not coalesce(ts.done,false)
       and public.pm_due_date(r.id)<(now() at time zone 'Europe/Oslo')::date) as late,
     count(*) filter(where exists(select 1 from public.project_help_requests h
       where h.requirement_id=r.id and h.resolved_at is null)) as help,
     count(*) filter(where not exists(select 1 from public.project_work_packages w
       where w.id=public.work_package_for_requirement(r.id)
         and w.assigned_to is not null)) as unassigned
   from public.project_requirements r
   left join public.project_task_states ts on ts.requirement_id=r.id
   where r.project_id=p.id and r.deleted_at is null and r.status<>'superseded'
     and public.pm_can_read(r.id)
 ) counts;
$$;
