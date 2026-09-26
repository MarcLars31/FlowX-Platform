-- Authors may remove their own project comments while they retain write access.
-- Keep the same project, organization and live-requirement checks as insertion.
create policy product_post_comments_delete_own on public.product_post_comments
for delete to authenticated using (
  author_id = auth.uid()
  and public.can_access_project(project_id)
  and public.has_permission(organization_id, 'project.product_suggestion.create')
  and public.has_permission(organization_id, 'project.requirement.view')
  and exists (
    select 1 from public.project_requirements r
    where r.id = requirement_id and r.project_id = product_post_comments.project_id
      and r.organization_id = product_post_comments.organization_id and r.deleted_at is null
  )
);

grant delete on public.product_post_comments to authenticated;
notify pgrst, 'reload schema';
