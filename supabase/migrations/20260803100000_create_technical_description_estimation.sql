insert into public.permissions (key, description, category)
values
  ('technical_description.view', 'View technical-description documents and material lines.', 'technical_description'),
  ('technical_description.create', 'Upload and extract technical-description documents.', 'technical_description'),
  ('technical_description.update', 'Review and update extracted material lines.', 'technical_description'),
  ('technical_description.estimate', 'Create material estimates from area and quantity rules.', 'technical_description')
on conflict (key) do update
set description = excluded.description,
    category = excluded.category;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.organization_id is null
  and role.slug in ('organization_owner', 'organization_admin', 'full_user')
  and permission.key in (
    'technical_description.view',
    'technical_description.create',
    'technical_description.update',
    'technical_description.estimate'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.organization_id is null
  and role.slug = 'read_only'
  and permission.key = 'technical_description.view'
on conflict (role_id, permission_id) do nothing;

create table if not exists public.technical_description_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  file_name text not null,
  file_sha256 text,
  status text not null default 'extracted'
    check (status in ('uploaded', 'extracting', 'extracted', 'review_required', 'failed')),
  extraction_method text not null default 'text'
    check (extraction_method in ('text', 'ocr', 'mixed')),
  page_count integer not null default 0 check (page_count >= 0),
  project_name text,
  project_number text,
  chapter text,
  source_pages jsonb not null default '[]'::jsonb,
  standards text[] not null default '{}'::text[],
  rule_hints jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.technical_description_material_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.technical_description_documents(id) on delete cascade,
  post_number text,
  ns_code text,
  category text not null default 'unknown',
  description text not null,
  operation text not null default 'unknown'
    check (operation in ('install', 'remove', 'unknown')),
  quantity numeric(14,3),
  unit text,
  quantity_text text,
  attributes jsonb not null default '{}'::jsonb,
  system text,
  standard_refs text[] not null default '{}'::text[],
  source_page integer,
  source_text text not null,
  confidence numeric(4,3),
  review_flags text[] not null default '{}'::text[],
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.technical_description_rule_hints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.technical_description_documents(id) on delete cascade,
  rule_key text not null,
  rule_value text not null,
  source_page integer,
  source_text text not null,
  confidence numeric(4,3),
  created_at timestamptz not null default now()
);

create table if not exists public.material_estimation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  source_document_id uuid references public.technical_description_documents(id) on delete set null,
  rule_key text not null,
  category text not null,
  description text not null,
  quantity_per_m2 numeric(14,6),
  fixed_quantity numeric(14,3),
  unit text not null default 'pcs',
  conditions jsonb not null default '{}'::jsonb,
  confidence numeric(4,3),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_per_m2 is not null or fixed_quantity is not null)
);

create table if not exists public.material_estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  source_document_id uuid references public.technical_description_documents(id) on delete set null,
  area_m2 numeric(14,2) not null check (area_m2 > 0),
  sprinkler_heads_per_m2 numeric(14,6),
  reserve_percentage numeric(7,3) not null default 0
    check (reserve_percentage >= 0 and reserve_percentage <= 100),
  input_parameters jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'approved')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_estimate_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_id uuid not null references public.material_estimates(id) on delete cascade,
  rule_id uuid references public.material_estimation_rules(id) on delete set null,
  category text not null,
  description text not null,
  quantity numeric(14,3) not null check (quantity >= 0),
  unit text not null default 'pcs',
  rationale text,
  created_at timestamptz not null default now()
);

create index if not exists technical_description_documents_org_idx
  on public.technical_description_documents (organization_id, created_at desc);
create index if not exists technical_description_lines_document_idx
  on public.technical_description_material_lines (document_id, category);
create index if not exists technical_description_rules_org_idx
  on public.material_estimation_rules (organization_id, category, is_active);
create index if not exists material_estimates_org_idx
  on public.material_estimates (organization_id, created_at desc);
create index if not exists material_estimate_items_estimate_idx
  on public.material_estimate_items (estimate_id, category);

alter table public.technical_description_documents enable row level security;
alter table public.technical_description_material_lines enable row level security;
alter table public.technical_description_rule_hints enable row level security;
alter table public.material_estimation_rules enable row level security;
alter table public.material_estimates enable row level security;
alter table public.material_estimate_items enable row level security;

drop policy if exists technical_description_documents_select on public.technical_description_documents;
create policy technical_description_documents_select
on public.technical_description_documents
for select to authenticated
using (public.has_permission(organization_id, 'technical_description.view'));

drop policy if exists technical_description_documents_insert on public.technical_description_documents;
create policy technical_description_documents_insert
on public.technical_description_documents
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.has_permission(organization_id, 'technical_description.create')
);

drop policy if exists technical_description_documents_update on public.technical_description_documents;
create policy technical_description_documents_update
on public.technical_description_documents
for update to authenticated
using (public.has_permission(organization_id, 'technical_description.update'))
with check (public.has_permission(organization_id, 'technical_description.update'));

drop policy if exists technical_description_lines_select on public.technical_description_material_lines;
create policy technical_description_lines_select
on public.technical_description_material_lines
for select to authenticated
using (public.has_permission(organization_id, 'technical_description.view'));

drop policy if exists technical_description_lines_insert on public.technical_description_material_lines;
create policy technical_description_lines_insert
on public.technical_description_material_lines
for insert to authenticated
with check (public.has_permission(organization_id, 'technical_description.create'));

drop policy if exists technical_description_lines_update on public.technical_description_material_lines;
create policy technical_description_lines_update
on public.technical_description_material_lines
for update to authenticated
using (public.has_permission(organization_id, 'technical_description.update'))
with check (public.has_permission(organization_id, 'technical_description.update'));

drop policy if exists technical_description_hints_select on public.technical_description_rule_hints;
create policy technical_description_hints_select
on public.technical_description_rule_hints
for select to authenticated
using (public.has_permission(organization_id, 'technical_description.view'));

drop policy if exists technical_description_hints_insert on public.technical_description_rule_hints;
create policy technical_description_hints_insert
on public.technical_description_rule_hints
for insert to authenticated
with check (public.has_permission(organization_id, 'technical_description.create'));

drop policy if exists material_estimation_rules_select on public.material_estimation_rules;
create policy material_estimation_rules_select
on public.material_estimation_rules
for select to authenticated
using (
  organization_id is null
  or public.has_permission(organization_id, 'technical_description.view')
);

drop policy if exists material_estimation_rules_insert on public.material_estimation_rules;
create policy material_estimation_rules_insert
on public.material_estimation_rules
for insert to authenticated
with check (
  organization_id is not null
  and public.has_permission(organization_id, 'technical_description.estimate')
);

drop policy if exists material_estimation_rules_update on public.material_estimation_rules;
create policy material_estimation_rules_update
on public.material_estimation_rules
for update to authenticated
using (organization_id is not null and public.has_permission(organization_id, 'technical_description.estimate'))
with check (organization_id is not null and public.has_permission(organization_id, 'technical_description.estimate'));

drop policy if exists material_estimates_select on public.material_estimates;
create policy material_estimates_select
on public.material_estimates
for select to authenticated
using (public.has_permission(organization_id, 'technical_description.view'));

drop policy if exists material_estimates_insert on public.material_estimates;
create policy material_estimates_insert
on public.material_estimates
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.has_permission(organization_id, 'technical_description.estimate')
);

drop policy if exists material_estimates_update on public.material_estimates;
create policy material_estimates_update
on public.material_estimates
for update to authenticated
using (public.has_permission(organization_id, 'technical_description.estimate'))
with check (public.has_permission(organization_id, 'technical_description.estimate'));

drop policy if exists material_estimate_items_select on public.material_estimate_items;
create policy material_estimate_items_select
on public.material_estimate_items
for select to authenticated
using (public.has_permission(organization_id, 'technical_description.view'));

drop policy if exists material_estimate_items_insert on public.material_estimate_items;
create policy material_estimate_items_insert
on public.material_estimate_items
for insert to authenticated
with check (public.has_permission(organization_id, 'technical_description.estimate'));

drop trigger if exists technical_description_documents_set_updated_at
  on public.technical_description_documents;
create trigger technical_description_documents_set_updated_at
before update on public.technical_description_documents
for each row execute function public.set_updated_at();

drop trigger if exists technical_description_lines_set_updated_at
  on public.technical_description_material_lines;
create trigger technical_description_lines_set_updated_at
before update on public.technical_description_material_lines
for each row execute function public.set_updated_at();

drop trigger if exists material_estimation_rules_set_updated_at
  on public.material_estimation_rules;
create trigger material_estimation_rules_set_updated_at
before update on public.material_estimation_rules
for each row execute function public.set_updated_at();

drop trigger if exists material_estimates_set_updated_at
  on public.material_estimates;
create trigger material_estimates_set_updated_at
before update on public.material_estimates
for each row execute function public.set_updated_at();

grant select, insert, update on public.technical_description_documents to authenticated;
grant select, insert, update on public.technical_description_material_lines to authenticated;
grant select, insert on public.technical_description_rule_hints to authenticated;
grant select, insert, update on public.material_estimation_rules to authenticated;
grant select, insert, update on public.material_estimates to authenticated;
grant select, insert on public.material_estimate_items to authenticated;
