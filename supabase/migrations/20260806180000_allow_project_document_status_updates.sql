-- The upload pipeline inserts project_documents as `uploading` and then
-- transitions them to `uploaded` or `failed`. RLS policies existed for the
-- transition, but the authenticated role was never granted UPDATE.

grant update on public.project_documents to authenticated;

