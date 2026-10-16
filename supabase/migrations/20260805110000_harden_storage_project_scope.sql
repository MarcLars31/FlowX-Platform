-- Storage paths are organization/project/document scoped. The previous
-- policies checked only the organization segment.

drop policy if exists project_files_select on storage.objects;
create policy project_files_select on storage.objects for select to authenticated
using (
  bucket_id = 'project-files' and case
    when array_length(storage.foldername(name), 1) >= 2
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then exists (
      select 1 from public.projects project
      where project.id = ((storage.foldername(name))[2])::uuid
        and project.organization_id = ((storage.foldername(name))[1])::uuid
        and public.can_access_project(project.id)
    ) else false
  end
);

drop policy if exists project_files_insert on storage.objects;
create policy project_files_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-files' and case
    when array_length(storage.foldername(name), 1) >= 2
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then exists (
      select 1 from public.projects project
      where project.id = ((storage.foldername(name))[2])::uuid
        and project.organization_id = ((storage.foldername(name))[1])::uuid
        and public.can_access_project(project.id)
        and public.has_permission(project.organization_id, 'document.upload')
    ) else false
  end
);

drop policy if exists project_files_update on storage.objects;
create policy project_files_update on storage.objects for update to authenticated
using (
  bucket_id = 'project-files' and case
    when array_length(storage.foldername(name), 1) >= 2
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then exists (
      select 1 from public.projects project
      where project.id = ((storage.foldername(name))[2])::uuid
        and project.organization_id = ((storage.foldername(name))[1])::uuid
        and public.can_access_project(project.id)
        and public.has_permission(project.organization_id, 'document.upload')
    ) else false
  end
)
with check (
  bucket_id = 'project-files' and case
    when array_length(storage.foldername(name), 1) >= 2
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then exists (
      select 1 from public.projects project
      where project.id = ((storage.foldername(name))[2])::uuid
        and project.organization_id = ((storage.foldername(name))[1])::uuid
        and public.can_access_project(project.id)
        and public.has_permission(project.organization_id, 'document.upload')
    ) else false
  end
);

drop policy if exists project_files_delete on storage.objects;
create policy project_files_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'project-files' and case
    when array_length(storage.foldername(name), 1) >= 2
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then exists (
      select 1 from public.projects project
      where project.id = ((storage.foldername(name))[2])::uuid
        and project.organization_id = ((storage.foldername(name))[1])::uuid
        and public.can_access_project(project.id)
        and public.has_permission(project.organization_id, 'document.delete')
    ) else false
  end
);
