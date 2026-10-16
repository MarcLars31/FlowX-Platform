-- Replace catalogue-dependent matching with organization-owned distributor
-- decisions. A confirmed technical requirement receives a manually selected
-- product and accessories. The normalized requirement fingerprint lets the
-- same organization reuse that knowledge in later projects.

create or replace function public.project_requirement_mapping_fingerprint(
  requested_category text,
  requested_key text,
  requested_value_text text,
  requested_value_json jsonb
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select md5(
    jsonb_build_object(
      'category', lower(coalesce(btrim(requested_category), '')),
      'requirement_key', lower(coalesce(btrim(requested_key), '')),
      'value_text', lower(coalesce(btrim(requested_value_text), '')),
      'operation', lower(coalesce(requested_value_json ->> 'operation', '')),
      'system', lower(coalesce(requested_value_json ->> 'system', '')),
      'attributes', coalesce(requested_value_json -> 'attributes', '{}'::jsonb)
    )::text
  );
$$;

alter table public.project_requirements
  add column if not exists mapping_fingerprint text;

create or replace function public.set_project_requirement_mapping_fingerprint()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.mapping_fingerprint := public.project_requirement_mapping_fingerprint(
    new.category,
    new.requirement_key,
    new.value_text,
    new.value_json
  );
  return new;
end;
$$;

drop trigger if exists project_requirements_set_mapping_fingerprint
  on public.project_requirements;
create trigger project_requirements_set_mapping_fingerprint
before insert or update of category, requirement_key, value_text, value_json
on public.project_requirements
for each row execute function public.set_project_requirement_mapping_fingerprint();

update public.project_requirements
set mapping_fingerprint = public.project_requirement_mapping_fingerprint(
  category,
  requirement_key,
  value_text,
  value_json
)
where mapping_fingerprint is null;

alter table public.project_requirements
  alter column mapping_fingerprint set not null;

create index if not exists project_requirements_mapping_fingerprint_idx
  on public.project_requirements (
    organization_id,
    mapping_fingerprint,
    status,
    created_at desc
  )
  where deleted_at is null;

create table if not exists public.distributor_product_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  distributor_name text not null default 'Ahlsell',
  requirement_fingerprint text not null,
  requirement_category text not null,
  requirement_key text not null,
  requirement_snapshot jsonb not null default '{}'::jsonb,
  product_name text not null,
  product_number text not null,
  product_number_key text generated always as (lower(btrim(product_number))) stored,
  manufacturer_name text,
  notes text,
  usage_count integer not null default 1 check (usage_count > 0),
  last_used_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint distributor_product_memories_product_name_length
    check (char_length(product_name) between 1 and 240),
  constraint distributor_product_memories_product_number_length
    check (char_length(product_number) between 1 and 120),
  unique (
    organization_id,
    distributor_name,
    requirement_fingerprint,
    product_number_key
  )
);

create index if not exists distributor_product_memories_lookup_idx
  on public.distributor_product_memories (
    organization_id,
    distributor_name,
    requirement_fingerprint,
    usage_count desc,
    last_used_at desc
  )
  where deleted_at is null;

create table if not exists public.distributor_product_memory_accessories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  memory_id uuid not null references public.distributor_product_memories(id) on delete cascade,
  product_name text not null,
  product_number text,
  identity_key text generated always as (
    lower(coalesce(nullif(btrim(product_number), ''), btrim(product_name)))
  ) stored,
  quantity_per_main_product numeric(12,3) not null default 1
    check (quantity_per_main_product > 0),
  unit text not null default 'st',
  notes text,
  usage_count integer not null default 1 check (usage_count > 0),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (memory_id, identity_key)
);

create index if not exists distributor_product_memory_accessories_memory_idx
  on public.distributor_product_memory_accessories (
    memory_id,
    usage_count desc,
    product_name
  );

drop trigger if exists distributor_product_memories_set_updated_at
  on public.distributor_product_memories;
create trigger distributor_product_memories_set_updated_at
before update on public.distributor_product_memories
for each row execute function public.set_updated_at();

drop trigger if exists distributor_product_memory_accessories_set_updated_at
  on public.distributor_product_memory_accessories;
create trigger distributor_product_memory_accessories_set_updated_at
before update on public.distributor_product_memory_accessories
for each row execute function public.set_updated_at();

alter table public.distributor_product_memories enable row level security;
alter table public.distributor_product_memory_accessories enable row level security;

drop policy if exists distributor_product_memories_select
  on public.distributor_product_memories;
create policy distributor_product_memories_select
on public.distributor_product_memories
for select to authenticated
using (
  public.is_organization_member(organization_id)
  and public.has_permission(organization_id, 'project.product_suggestion.view')
);

drop policy if exists distributor_product_memory_accessories_select
  on public.distributor_product_memory_accessories;
create policy distributor_product_memory_accessories_select
on public.distributor_product_memory_accessories
for select to authenticated
using (
  public.is_organization_member(organization_id)
  and public.has_permission(organization_id, 'project.product_suggestion.view')
  and exists (
    select 1
    from public.distributor_product_memories memory
    where memory.id = memory_id
      and memory.organization_id = distributor_product_memory_accessories.organization_id
      and memory.deleted_at is null
  )
);

grant select on public.distributor_product_memories to authenticated;
grant select on public.distributor_product_memory_accessories to authenticated;

create or replace function public.save_distributor_product_mapping(
  requested_project_id uuid,
  requested_requirement_id uuid,
  requested_product_name text,
  requested_product_number text,
  requested_manufacturer_name text default null,
  requested_notes text default null,
  requested_accessories jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  project_row public.projects%rowtype;
  requirement_row public.project_requirements%rowtype;
  memory_row public.distributor_product_memories%rowtype;
  accessory_item jsonb;
  clean_accessories jsonb := '[]'::jsonb;
  clean_product_name text := left(nullif(btrim(requested_product_name), ''), 240);
  clean_product_number text := left(nullif(btrim(requested_product_number), ''), 120);
  clean_manufacturer text := left(nullif(btrim(requested_manufacturer_name), ''), 200);
  clean_notes text := left(nullif(btrim(requested_notes), ''), 2000);
  accessory_name text;
  accessory_number text;
  accessory_unit text;
  accessory_notes text;
  accessory_quantity numeric;
  assignment_id uuid;
  assignment_snapshot jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if clean_product_name is null or clean_product_number is null then
    raise exception 'Product name and product number are required.';
  end if;
  if jsonb_typeof(coalesce(requested_accessories, '[]'::jsonb)) <> 'array' then
    raise exception 'Accessories must be a JSON array.';
  end if;
  if jsonb_array_length(coalesce(requested_accessories, '[]'::jsonb)) > 20 then
    raise exception 'A maximum of 20 accessories is allowed.';
  end if;

  select * into project_row
  from public.projects
  where id = requested_project_id
    and deleted_at is null;
  if not found then
    raise exception 'Project not found.';
  end if;
  if not public.can_access_project(project_row.id)
    or not public.has_permission(
      project_row.organization_id,
      'project.product_suggestion.create'
    ) then
    raise exception 'Product mapping access denied.' using errcode = '42501';
  end if;

  select * into requirement_row
  from public.project_requirements
  where id = requested_requirement_id
    and project_id = project_row.id
    and organization_id = project_row.organization_id
    and deleted_at is null;
  if not found then
    raise exception 'Requirement not found.';
  end if;
  if requirement_row.status not in ('user_confirmed', 'user_modified') then
    raise exception 'Only confirmed requirements can receive a product.';
  end if;
  if lower(coalesce(requirement_row.value_json ->> 'operation', 'install')) = 'remove' then
    raise exception 'Removal lines cannot receive a product.';
  end if;

  insert into public.distributor_product_memories (
    organization_id,
    distributor_name,
    requirement_fingerprint,
    requirement_category,
    requirement_key,
    requirement_snapshot,
    product_name,
    product_number,
    manufacturer_name,
    notes,
    created_by,
    updated_by
  ) values (
    project_row.organization_id,
    'Ahlsell',
    requirement_row.mapping_fingerprint,
    requirement_row.category,
    requirement_row.requirement_key,
    jsonb_build_object(
      'valueText', requirement_row.value_text,
      'value', requirement_row.value_json
    ),
    clean_product_name,
    clean_product_number,
    clean_manufacturer,
    clean_notes,
    actor_id,
    actor_id
  )
  on conflict (
    organization_id,
    distributor_name,
    requirement_fingerprint,
    product_number_key
  ) do update set
    product_name = excluded.product_name,
    manufacturer_name = excluded.manufacturer_name,
    notes = excluded.notes,
    usage_count = public.distributor_product_memories.usage_count + 1,
    last_used_at = now(),
    updated_by = actor_id,
    deleted_at = null
  returning * into memory_row;

  for accessory_item in
    select value from jsonb_array_elements(coalesce(requested_accessories, '[]'::jsonb))
  loop
    accessory_name := left(nullif(btrim(accessory_item ->> 'name'), ''), 240);
    accessory_number := left(nullif(btrim(accessory_item ->> 'productNumber'), ''), 120);
    accessory_unit := left(coalesce(nullif(btrim(accessory_item ->> 'unit'), ''), 'st'), 30);
    accessory_notes := left(nullif(btrim(accessory_item ->> 'notes'), ''), 500);
    begin
      accessory_quantity := greatest(
        coalesce((accessory_item ->> 'quantity')::numeric, 1),
        0.001
      );
    exception when invalid_text_representation then
      raise exception 'Accessory quantity must be numeric.';
    end;
    if accessory_name is null then
      continue;
    end if;

    clean_accessories := clean_accessories || jsonb_build_array(jsonb_build_object(
      'name', accessory_name,
      'productNumber', accessory_number,
      'quantity', accessory_quantity,
      'unit', accessory_unit,
      'notes', accessory_notes
    ));

    insert into public.distributor_product_memory_accessories (
      organization_id,
      memory_id,
      product_name,
      product_number,
      quantity_per_main_product,
      unit,
      notes
    ) values (
      project_row.organization_id,
      memory_row.id,
      accessory_name,
      accessory_number,
      accessory_quantity,
      accessory_unit,
      accessory_notes
    )
    on conflict (memory_id, identity_key) do update set
      product_name = excluded.product_name,
      product_number = excluded.product_number,
      quantity_per_main_product = excluded.quantity_per_main_product,
      unit = excluded.unit,
      notes = excluded.notes,
      usage_count = public.distributor_product_memory_accessories.usage_count + 1,
      last_used_at = now();
  end loop;

  assignment_snapshot := jsonb_build_object(
    'source', 'distributor_manual',
    'distributor', 'Ahlsell',
    'name', clean_product_name,
    'productNumber', clean_product_number,
    'manufacturer', clean_manufacturer,
    'notes', clean_notes,
    'accessories', clean_accessories,
    'memoryId', memory_row.id,
    'requirementFingerprint', requirement_row.mapping_fingerprint,
    'timesUsed', memory_row.usage_count,
    'verifiedByDistributor', true
  );

  select id into assignment_id
  from public.project_product_suggestions
  where project_id = project_row.id
    and requirement_id = requirement_row.id
    and product_id is null
    and product_snapshot ->> 'source' = 'distributor_manual'
  order by updated_at desc
  limit 1;

  if assignment_id is null then
    insert into public.project_product_suggestions (
      organization_id,
      project_id,
      requirement_id,
      product_snapshot,
      recommendation_reason,
      status,
      selected_by,
      selected_at,
      created_by
    ) values (
      project_row.organization_id,
      project_row.id,
      requirement_row.id,
      assignment_snapshot,
      'Produkten har valts manuellt av distributören och sparats för framtida liknande krav.',
      'selected',
      actor_id,
      now(),
      actor_id
    ) returning id into assignment_id;
  else
    update public.project_product_suggestions
    set product_snapshot = assignment_snapshot,
        recommendation_reason = 'Produkten har valts manuellt av distributören och sparats för framtida liknande krav.',
        match_score = null,
        deviation_type = null,
        deviation_text = null,
        status = 'selected',
        selected_by = actor_id,
        selected_at = now(),
        updated_at = now()
    where id = assignment_id;
  end if;

  perform public.write_audit_log(
    project_row.organization_id,
    'distributor_product_mapping.saved',
    'project_product_suggestion',
    assignment_id,
    null,
    assignment_snapshot,
    jsonb_build_object(
      'project_id', project_row.id,
      'requirement_id', requirement_row.id,
      'memory_id', memory_row.id
    )
  );

  return jsonb_build_object(
    'assignmentId', assignment_id,
    'memoryId', memory_row.id,
    'usageCount', memory_row.usage_count,
    'accessoryCount', jsonb_array_length(clean_accessories)
  );
end;
$$;

revoke all on function public.save_distributor_product_mapping(
  uuid, uuid, text, text, text, text, jsonb
) from public;
grant execute on function public.save_distributor_product_mapping(
  uuid, uuid, text, text, text, text, jsonb
) to authenticated;

comment on table public.distributor_product_memories is
  'Organization-owned memory of distributor product decisions for normalized technical requirements.';
comment on table public.distributor_product_memory_accessories is
  'Accessories repeatedly selected together with a learned distributor product mapping.';
comment on function public.save_distributor_product_mapping(
  uuid, uuid, text, text, text, text, jsonb
) is
  'Validates a confirmed project requirement, saves Ahlsell product selection and accessories, and updates reusable organization memory.';
