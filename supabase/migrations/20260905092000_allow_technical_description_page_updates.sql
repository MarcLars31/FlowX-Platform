-- A failed or empty technical-description run can be retried against the
-- existing project document. The pipeline must then replace the extracted
-- text on its existing page rows without bypassing project access or the
-- dedicated technical-description permission.

drop policy if exists document_pages_update_technical_description
  on public.document_pages;

create policy document_pages_update_technical_description
on public.document_pages
for update
to authenticated
using (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'technical_description.update')
)
with check (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'technical_description.update')
);

comment on policy document_pages_update_technical_description on public.document_pages
  is 'Allows authorized technical-description retries to replace OCR text on existing project document pages.';
