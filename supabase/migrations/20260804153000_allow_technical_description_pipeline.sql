-- Technical-description extraction is a document pipeline in its own right.
-- Keep the existing document.upload policies intact, but allow users who have
-- the dedicated technical-description permission to register, upload and
-- update the metadata created by that pipeline.

drop policy if exists project_documents_select_technical_description
  on public.project_documents;
create policy project_documents_select_technical_description
on public.project_documents
for select
to authenticated
using (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'technical_description.view')
);

drop policy if exists project_documents_insert_technical_description
  on public.project_documents;
create policy project_documents_insert_technical_description
on public.project_documents
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and public.can_access_project(project_id)
  and public.has_permission(organization_id, 'technical_description.create')
);

drop policy if exists project_documents_update_technical_description
  on public.project_documents;
create policy project_documents_update_technical_description
on public.project_documents
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

drop policy if exists extraction_runs_insert_technical_description
  on public.extraction_runs;
create policy extraction_runs_insert_technical_description
on public.extraction_runs
for insert
to authenticated
with check (
  (created_by = auth.uid() or created_by is null)
  and public.can_access_project(project_id)
  and public.has_permission(organization_id, 'technical_description.create')
);

drop policy if exists document_pages_insert_technical_description
  on public.document_pages;
create policy document_pages_insert_technical_description
on public.document_pages
for insert
to authenticated
with check (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'technical_description.create')
);

comment on policy project_documents_insert_technical_description on public.project_documents
  is 'Allows the dedicated technical-description importer to register project document metadata.';
