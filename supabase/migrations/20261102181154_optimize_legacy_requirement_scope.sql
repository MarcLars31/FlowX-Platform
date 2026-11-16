-- Preserve the existing pm_can_read authorization for all requirements while
-- avoiding a project permission lookup for every row in legacy projects.
-- Both uncorrelated subqueries can be evaluated once per statement.
-- Settings RLS uses can_access_project. An inaccessible managed project falls
-- through to the legacy branch and is still rejected by can_access_project.
-- Managed projects retain the complete department-level pm_can_read check.
alter policy pm_requirement_scope on public.project_requirements
  using (
    case when project_id in (
      select settings.project_id from public.project_management_settings settings
    ) then public.pm_can_read(id)
    else project_id in (
      select project.id from public.projects project
      where public.can_access_project(project.id)
    ) end
  );
