-- Product-learning trigger functions read from a table that also has an
-- actor_id column. Give the PL/pgSQL variable a distinct name so product
-- approvals and resolution changes cannot fail with an ambiguous reference.

create or replace function public.capture_approved_product_learning_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_actor_id uuid := coalesce(auth.uid(), new.selected_by);
  requirement_row public.project_requirements%rowtype;
  context_row public.product_learning_events%rowtype;
  approval_marker text := new.product_snapshot ->> 'approvedAt';
  selected_number text := nullif(btrim(new.product_snapshot ->> 'productNumber'), '');
begin
  if new.status <> 'selected'
    or new.product_snapshot ->> 'source' <> 'distributor_manual'
    or lower(coalesce(new.product_snapshot ->> 'approvedByUser', 'false')) <> 'true'
    or selected_number is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.status = 'selected'
    and old.product_snapshot ->> 'approvedAt' is not distinct from approval_marker
    and old.product_snapshot ->> 'productNumber' is not distinct from selected_number then
    return new;
  end if;

  select * into requirement_row
  from public.project_requirements
  where id = new.requirement_id
    and project_id = new.project_id
    and organization_id = new.organization_id;
  if not found then
    return new;
  end if;

  select * into context_row
  from public.product_learning_events event
  where event.organization_id = new.organization_id
    and event.project_id = new.project_id
    and event.requirement_id = new.requirement_id
    and event.event_type = 'candidate_impression'
    and event.occurred_at >= coalesce(new.selected_at, now()) - interval '1 day'
  order by
    case when event.actor_id = current_actor_id then 0 else 1 end,
    event.occurred_at desc
  limit 1;

  insert into public.product_learning_events (
    organization_id,
    project_id,
    requirement_id,
    event_type,
    actor_id,
    requirement_fingerprint,
    requirement_snapshot,
    candidate_snapshot,
    selected_product,
    context_event_id,
    event_key,
    metadata,
    occurred_at
  ) values (
    new.organization_id,
    new.project_id,
    new.requirement_id,
    'product_selected',
    current_actor_id,
    requirement_row.mapping_fingerprint,
    jsonb_build_object(
      'category', requirement_row.category,
      'requirementKey', requirement_row.requirement_key,
      'valueText', requirement_row.value_text,
      'value', requirement_row.value_json,
      'sourceExcerpt', requirement_row.source_excerpt
    ),
    coalesce(context_row.candidate_snapshot, '[]'::jsonb),
    jsonb_strip_nulls(jsonb_build_object(
      'articleNumber', selected_number,
      'productName', nullif(btrim(new.product_snapshot ->> 'name'), ''),
      'manufacturer', nullif(btrim(new.product_snapshot ->> 'manufacturer'), ''),
      'source', coalesce(new.product_snapshot ->> 'source', 'distributor_manual')
    )),
    context_row.id,
    'assignment:' || new.id::text || ':approved:' || coalesce(
      approval_marker,
      new.updated_at::text
    ),
    jsonb_build_object(
      'assignmentId', new.id,
      'distributor', coalesce(new.product_snapshot ->> 'distributor', 'Ahlsell'),
      'approvalStatus', new.product_snapshot ->> 'approvalStatus'
    ),
    coalesce(new.selected_at, now())
  ) on conflict (event_key) do nothing;

  return new;
end;
$$;

create or replace function public.capture_product_resolution_learning_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  previous_resolution text := old.value_json #>> '{productResolution,status}';
  next_resolution text := new.value_json #>> '{productResolution,status}';
  resolved_at text := new.value_json #>> '{productResolution,resolvedAt}';
  resolved_by text := new.value_json #>> '{productResolution,resolvedBy}';
  current_actor_id uuid := auth.uid();
  context_row public.product_learning_events%rowtype;
  learning_event_type text;
begin
  if previous_resolution is not distinct from next_resolution then
    return new;
  end if;
  if next_resolution = 'not_in_assortment' then
    learning_event_type := 'not_in_assortment';
  elsif previous_resolution = 'not_in_assortment' and next_resolution is null then
    learning_event_type := 'resolution_cleared';
  else
    return new;
  end if;

  if current_actor_id is null and resolved_by is not null then
    begin
      current_actor_id := resolved_by::uuid;
    exception when invalid_text_representation then
      current_actor_id := null;
    end;
  end if;
  current_actor_id := coalesce(current_actor_id, new.reviewed_by, new.confirmed_by);

  select * into context_row
  from public.product_learning_events event
  where event.organization_id = new.organization_id
    and event.project_id = new.project_id
    and event.requirement_id = new.id
    and event.event_type = 'candidate_impression'
    and event.occurred_at >= now() - interval '1 day'
  order by
    case when event.actor_id = current_actor_id then 0 else 1 end,
    event.occurred_at desc
  limit 1;

  insert into public.product_learning_events (
    organization_id,
    project_id,
    requirement_id,
    event_type,
    actor_id,
    requirement_fingerprint,
    requirement_snapshot,
    candidate_snapshot,
    context_event_id,
    event_key,
    metadata
  ) values (
    new.organization_id,
    new.project_id,
    new.id,
    learning_event_type,
    current_actor_id,
    new.mapping_fingerprint,
    jsonb_build_object(
      'category', new.category,
      'requirementKey', new.requirement_key,
      'valueText', new.value_text,
      'value', new.value_json,
      'sourceExcerpt', new.source_excerpt
    ),
    case
      when learning_event_type = 'not_in_assortment'
        then coalesce(context_row.candidate_snapshot, '[]'::jsonb)
      else '[]'::jsonb
    end,
    context_row.id,
    'resolution:' || new.id::text || ':' || learning_event_type || ':' || coalesce(
      resolved_at,
      new.updated_at::text
    ),
    jsonb_build_object(
      'previousResolution', previous_resolution,
      'nextResolution', next_resolution
    )
  ) on conflict (event_key) do nothing;

  return new;
end;
$$;
