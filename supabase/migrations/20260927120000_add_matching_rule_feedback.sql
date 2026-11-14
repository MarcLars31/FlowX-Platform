-- Rule reports document proposed changes; they never mutate matching behavior.
create table public.matching_rule_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  rule_id text not null check (rule_id ~ '^[a-z0-9-]{1,120}$'),
  rule_title text not null check (char_length(btrim(rule_title)) between 1 and 300),
  rule_version text not null check (rule_version ~ '^[a-f0-9]{40}$'),
  kind text not null check (kind in ('error', 'change')),
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  author_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  author_name text not null check (char_length(btrim(author_name)) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete restrict,
  check ((status = 'open' and resolved_at is null and resolved_by is null)
    or (status = 'resolved' and resolved_at is not null and resolved_by is not null))
);
create index matching_rule_feedback_org_idx on public.matching_rule_feedback (organization_id, created_at desc, id desc);
create index matching_rule_feedback_rule_idx on public.matching_rule_feedback (rule_id, status);

create function public.stamp_matching_rule_feedback_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.resolved_at := case when new.status = 'resolved' then now() end;
    new.resolved_by := case when new.status = 'resolved' then auth.uid() end;
  end if;
  return new;
end;
$$;
create trigger matching_rule_feedback_status before update on public.matching_rule_feedback
for each row execute function public.stamp_matching_rule_feedback_status();

alter table public.matching_rule_feedback enable row level security;
create policy matching_rule_feedback_read on public.matching_rule_feedback for select to authenticated using (
  public.is_platform_admin() or public.has_permission(organization_id, 'project.product_suggestion.view')
);
create policy matching_rule_feedback_insert on public.matching_rule_feedback for insert to authenticated with check (
  author_id = auth.uid() and status = 'open' and
  (public.is_platform_admin() or (organization_id is not null and public.has_permission(organization_id, 'project.product_suggestion.view')))
);
create policy matching_rule_feedback_update on public.matching_rule_feedback for update to authenticated using (
  public.is_platform_admin() or (
    public.has_permission(organization_id, 'project.product_suggestion.view')
    and (author_id = auth.uid() or public.has_permission(organization_id, 'organization.update'))
  )
) with check (
  public.is_platform_admin() or (
    public.has_permission(organization_id, 'project.product_suggestion.view')
    and (author_id = auth.uid() or public.has_permission(organization_id, 'organization.update'))
  )
);
revoke all on public.matching_rule_feedback from public, anon, authenticated;
grant select on public.matching_rule_feedback to authenticated;
grant insert (id, organization_id, rule_id, rule_title, rule_version, kind, body, author_name) on public.matching_rule_feedback to authenticated;
grant update (status) on public.matching_rule_feedback to authenticated;
revoke all on function public.stamp_matching_rule_feedback_status() from public, anon, authenticated;
notify pgrst, 'reload schema';
