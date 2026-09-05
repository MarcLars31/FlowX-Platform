-- Phase 2: project access management and organization retention settings.
-- This migration is additive and keeps existing data intact.

grant update (project_role) on public.project_members to authenticated;

drop policy if exists project_members_delete_authorized
  on public.project_members;
create policy project_members_delete_authorized
on public.project_members
for delete
to authenticated
using (
  public.can_manage_project(project_id, 'project.manage_members')
  and project_role <> 'owner'
);

create or replace function public.audit_project_member_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  audited_project_id uuid;
  audited_organization_id uuid;
begin
  if tg_op = 'DELETE' then
    audited_project_id := old.project_id;
  else
    audited_project_id := new.project_id;
  end if;

  select project.organization_id
  into audited_organization_id
  from public.projects project
  where project.id = audited_project_id;

  if audited_organization_id is not null then
    perform public.write_audit_log(
      audited_organization_id,
      case
        when tg_op = 'DELETE' then 'project.member_removed'
        when tg_op = 'UPDATE' then 'project.member_role_changed'
        else 'project.member_added'
      end,
      'project',
      audited_project_id,
      case when tg_op in ('DELETE', 'UPDATE') then to_jsonb(old) else null end,
      case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists project_members_audit_change on public.project_members;
create trigger project_members_audit_change
after insert or update or delete on public.project_members
for each row execute function public.audit_project_member_change();

drop policy if exists organization_subscriptions_update_authorized
  on public.organization_subscriptions;
create policy organization_subscriptions_update_authorized
on public.organization_subscriptions
for update
to authenticated
using (public.has_permission(organization_id, 'subscription.manage'))
with check (public.has_permission(organization_id, 'subscription.manage'));

grant update (retention_days, metadata)
  on public.organization_subscriptions to authenticated;
