-- Project-specific discussion must not change technical requirements, approval
-- state or reusable distributor product memories.
create table public.product_post_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement_id uuid not null references public.project_requirements(id) on delete cascade,
  product_number text check (product_number is null or char_length(btrim(product_number)) between 1 and 120),
  product_name text check (product_name is null or char_length(product_name) <= 240),
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  author_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  author_name text not null check (char_length(author_name) between 1 and 200),
  created_at timestamptz not null default now(),
  check (product_number is not null or product_name is null)
);

create index product_post_comments_requirement_idx
  on public.product_post_comments(requirement_id, created_at desc, id desc);

alter table public.product_post_comments enable row level security;
create policy product_post_comments_read on public.product_post_comments
for select to authenticated using (
  public.can_access_project(project_id)
  and public.has_permission(organization_id, 'project.requirement.view')
  and exists (
    select 1 from public.project_requirements r
    where r.id = requirement_id and r.project_id = product_post_comments.project_id
      and r.organization_id = product_post_comments.organization_id and r.deleted_at is null
  )
);
create policy product_post_comments_insert on public.product_post_comments
for insert to authenticated with check (
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
revoke all on public.product_post_comments from public, anon, authenticated;
grant select on public.product_post_comments to authenticated;
grant insert (id, organization_id, project_id, requirement_id, product_number, product_name, body, author_name)
  on public.product_post_comments to authenticated;
notify pgrst, 'reload schema';
