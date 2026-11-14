-- Complete the team lifecycle permissions that were seeded with the
-- organization RBAC model. This migration is additive and preserves data.

drop policy if exists teams_delete_authorized on public.teams;
create policy teams_delete_authorized
on public.teams
for delete
to authenticated
using (
  public.has_permission(organization_id, 'team.delete')
);

grant delete on public.teams to authenticated;
