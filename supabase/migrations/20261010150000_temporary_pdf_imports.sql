-- Keep extracted pages/posts and document identity after the staged original
-- is removed. Existing stored documents and attachments are untouched.
alter table public.project_documents
  alter column storage_bucket drop not null,
  alter column storage_path drop not null;
alter table public.project_documents add constraint project_documents_storage_pair
  check ((storage_bucket is null) = (storage_path is null));
alter table public.project_documents add constraint project_documents_original_optional
  check (storage_path is not null or (document_type = 'technical_description') is true);

-- The same checks as before, evaluated against projects/memberships once per
-- statement instead of once per PDF post. The subqueries retain their own RLS.
-- Own active memberships are visible under organization_members_select_authorized;
-- accessible projects are visible under projects_select_accessible.
alter policy project_requirements_select on public.project_requirements
  using (
    project_id in (
      select p.id from public.projects p
      where public.can_access_project(p.id)
    )
    and organization_id in (
      select m.organization_id from public.organization_members m
      where m.user_id = (select auth.uid()) and m.status = 'active'
        and public.has_permission(m.organization_id, 'project.requirement.view')
    )
  );
