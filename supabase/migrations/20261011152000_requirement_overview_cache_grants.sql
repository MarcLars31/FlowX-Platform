-- Hosted Supabase default privileges can grant writes on newly created tables.
-- RLS already has no write policy; also remove the inherited table privileges.
revoke all on public.project_requirement_overviews from public, anon, authenticated;
grant select on public.project_requirement_overviews to authenticated;
grant all on public.project_requirement_overviews to service_role;
