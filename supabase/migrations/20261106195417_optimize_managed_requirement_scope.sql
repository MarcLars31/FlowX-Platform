-- Cache read authorization per statement instead of calling pm_can_read for
-- every imported row. Keep the existing permissive policies and write guards.
-- These helpers deliberately live outside the exposed API schema. They accept
-- no user/project identity from the caller and always authorize auth.uid().
create function scipx_assignment_internal.full_read_projects()
returns setof uuid language sql stable security definer set search_path=pg_catalog as $$
 select p.id from public.projects p
 where (select auth.uid()) is not null and p.deleted_at is null
 and public.can_access_project(p.id)
 and (not public.pm_enabled(p.id) or (
   public.is_delivery_manager(p.id)
   and (public.has_permission(p.organization_id,'project.requirement.view')
     or public.has_permission(p.organization_id,'project.product_suggestion.view'))
 ));
$$;

create function scipx_assignment_internal.assigned_read_requirements()
returns setof uuid language plpgsql stable security definer set search_path=pg_catalog as $$
declare caller uuid := auth.uid(); p record; readable_packages uuid[];
begin
 if caller is null then return; end if;
 for p in
   select project.id from public.projects project
   join public.project_management_settings settings on settings.project_id=project.id
   where project.deleted_at is null and public.can_access_project(project.id)
   and not public.is_delivery_manager(project.id)
   and public.pm_active_member(project.id,caller)
   and (public.has_permission(project.organization_id,'project.requirement.view')
     or public.has_permission(project.organization_id,'project.product_suggestion.view'))
 loop
   select array_agg(w.id) into readable_packages from public.project_work_packages w
   where w.project_id=p.id and (
     public.pm_in_department(p.id,w.department_id,caller)
     or (w.direct_assignee and w.department_id is null and w.assigned_to=caller)
   );
   if cardinality(readable_packages)>0 then
     -- Resolve all packages, including other people's overrides and explicit
     -- unassignment, before filtering. Filtering the input would leak posts.
     return query select resolved.requirement_id
     from scipx_assignment_internal.resolution(p.id) resolved
     join public.project_requirements r on r.id=resolved.requirement_id
     where resolved.work_id=any(readable_packages)
     and r.organization_id in (
       select o.id from public.organizations o
       where public.has_permission(o.id,'project.requirement.view')
         or public.has_permission(o.id,'project.product_suggestion.view')
     );
   end if;
 end loop;
end;
$$;

create function scipx_assignment_internal.read_requirements()
returns setof uuid language sql stable security definer set search_path=pg_catalog as $$
 select r.id from public.project_requirements r
 where (select auth.uid()) is not null
 and r.project_id in (select scipx_assignment_internal.full_read_projects())
 and (r.project_id not in (select s.project_id from public.project_management_settings s)
   or r.organization_id in (
     select o.id from public.organizations o
     where public.has_permission(o.id,'project.requirement.view')
       or public.has_permission(o.id,'project.product_suggestion.view')
   ))
 union all
 select scipx_assignment_internal.assigned_read_requirements()
 where (select auth.uid()) is not null;
$$;

revoke all on function scipx_assignment_internal.full_read_projects() from public,anon;
revoke all on function scipx_assignment_internal.assigned_read_requirements() from public,anon;
revoke all on function scipx_assignment_internal.read_requirements() from public,anon;
grant execute on function scipx_assignment_internal.full_read_projects() to authenticated;
grant execute on function scipx_assignment_internal.assigned_read_requirements() to authenticated;
grant execute on function scipx_assignment_internal.read_requirements() to authenticated;

alter policy pm_requirement_scope on public.project_requirements using (
 project_id in (select scipx_assignment_internal.full_read_projects())
 or id in (select scipx_assignment_internal.assigned_read_requirements())
);

-- The dashboard also counts approved suggestions. Check the referenced post,
-- not just the suggestion's project_id, and preserve suggestion-only roles.
alter policy pm_post_scope on public.project_product_suggestions using (
 requirement_id in (select scipx_assignment_internal.read_requirements())
);

-- Preserve the existing project and suggestion-view permission checks, but
-- evaluate them once per project/organization, as requirement reads already do.
alter policy project_product_suggestions_select on public.project_product_suggestions using (
 project_id in (select p.id from public.projects p where public.can_access_project(p.id))
 and organization_id in (
   select m.organization_id from public.organization_members m
   where m.user_id=(select auth.uid()) and m.status='active'
   and public.has_permission(m.organization_id,'project.product_suggestion.view')
 )
);
