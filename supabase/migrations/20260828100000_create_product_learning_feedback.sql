-- Capture the human decisions needed for a future product-ranking model.
-- Existing distributor_product_memories keep serving immediate, deterministic
-- reuse. These append-only events preserve the richer training context: what
-- was shown, what was selected, and when no listed product was acceptable.

create table if not exists public.product_learning_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement_id uuid not null references public.project_requirements(id) on delete cascade,
  event_type text not null check (event_type in (
    'candidate_impression',
    'product_selected',
    'not_in_assortment',
    'resolution_cleared'
  )),
  actor_id uuid references auth.users(id) on delete set null,
  requirement_fingerprint text,
  requirement_snapshot jsonb not null default '{}'::jsonb,
  candidate_snapshot jsonb not null default '[]'::jsonb,
  selected_product jsonb,
  context_event_id uuid references public.product_learning_events(id) on delete set null,
  event_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint product_learning_events_requirement_snapshot_object
    check (jsonb_typeof(requirement_snapshot) = 'object'),
  constraint product_learning_events_candidate_snapshot_array
    check (jsonb_typeof(candidate_snapshot) = 'array'),
  constraint product_learning_events_selected_product_object
    check (selected_product is null or jsonb_typeof(selected_product) = 'object'),
  constraint product_learning_events_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint product_learning_events_event_key_length
    check (event_key is null or char_length(event_key) <= 500)
);

create index if not exists product_learning_events_requirement_idx
  on public.product_learning_events (
    organization_id,
    requirement_id,
    occurred_at desc
  );

create index if not exists product_learning_events_training_idx
  on public.product_learning_events (
    organization_id,
    event_type,
    occurred_at desc
  )
  where event_type in ('product_selected', 'not_in_assortment');

alter table public.product_learning_events enable row level security;

drop policy if exists product_learning_events_select
  on public.product_learning_events;
create policy product_learning_events_select
on public.product_learning_events
for select to authenticated
using (
  public.can_access_project(project_id)
  and public.has_permission(
    organization_id,
    'project.product_suggestion.view'
  )
);

revoke all on public.product_learning_events from public, anon, authenticated;
grant select on public.product_learning_events to authenticated;

create or replace function public.record_product_candidate_impression(
  requested_project_id uuid,
  requested_requirement_id uuid,
  requested_candidates jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  project_row public.projects%rowtype;
  requirement_row public.project_requirements%rowtype;
  clean_candidates jsonb;
  event_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(requested_candidates, '[]'::jsonb)) <> 'array' then
    raise exception 'Candidates must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(requested_candidates, '[]'::jsonb)) > 10
    or octet_length(coalesce(requested_candidates, '[]'::jsonb)::text) > 100000 then
    raise exception 'Candidate feedback is too large.' using errcode = '22023';
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
      'project.product_suggestion.view'
    ) then
    raise exception 'Product feedback access denied.' using errcode = '42501';
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

  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'rank', candidate.rank,
      'articleNumber', left(nullif(btrim(candidate.item ->> 'articleNumber'), ''), 120),
      'productName', left(nullif(btrim(candidate.item ->> 'productName'), ''), 240),
      'manufacturer', left(nullif(btrim(candidate.item ->> 'manufacturer'), ''), 200),
      'description', left(nullif(btrim(candidate.item ->> 'description'), ''), 1000),
      'specifications', case
        when jsonb_typeof(candidate.item -> 'specifications') = 'array'
          then candidate.item -> 'specifications'
        else '[]'::jsonb
      end,
      'source', left(nullif(btrim(candidate.item ->> 'source'), ''), 40),
      'recommendation', left(nullif(btrim(candidate.item ->> 'recommendation'), ''), 40),
      'matchScore', case
        when jsonb_typeof(candidate.item -> 'matchScore') = 'number'
          then candidate.item -> 'matchScore'
        else null
      end,
      'matchReasons', case
        when jsonb_typeof(candidate.item -> 'matchReasons') = 'array'
          then candidate.item -> 'matchReasons'
        else '[]'::jsonb
      end,
      'matchWarnings', case
        when jsonb_typeof(candidate.item -> 'matchWarnings') = 'array'
          then candidate.item -> 'matchWarnings'
        else '[]'::jsonb
      end,
      'exactMatch', lower(coalesce(candidate.item ->> 'exactMatch', 'false')) = 'true'
    )) order by candidate.rank
  ), '[]'::jsonb)
  into clean_candidates
  from jsonb_array_elements(coalesce(requested_candidates, '[]'::jsonb))
    with ordinality as candidate(item, rank)
  where jsonb_typeof(candidate.item) = 'object'
    and nullif(btrim(candidate.item ->> 'articleNumber'), '') is not null;

  insert into public.product_learning_events (
    organization_id,
    project_id,
    requirement_id,
    event_type,
    actor_id,
    requirement_fingerprint,
    requirement_snapshot,
    candidate_snapshot,
    metadata
  ) values (
    project_row.organization_id,
    project_row.id,
    requirement_row.id,
    'candidate_impression',
    actor_id,
    requirement_row.mapping_fingerprint,
    jsonb_build_object(
      'category', requirement_row.category,
      'requirementKey', requirement_row.requirement_key,
      'valueText', requirement_row.value_text,
      'value', requirement_row.value_json,
      'sourceExcerpt', requirement_row.source_excerpt
    ),
    clean_candidates,
    jsonb_build_object('distributor', 'Ahlsell')
  ) returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.record_product_candidate_impression(
  uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.record_product_candidate_impression(
  uuid, uuid, jsonb
) to authenticated;

create or replace function public.capture_approved_product_learning_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := coalesce(auth.uid(), new.selected_by);
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
    case when event.actor_id = actor_id then 0 else 1 end,
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
    actor_id,
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

drop trigger if exists project_product_suggestions_capture_learning
  on public.project_product_suggestions;
create trigger project_product_suggestions_capture_learning
after insert or update on public.project_product_suggestions
for each row execute function public.capture_approved_product_learning_event();

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
  actor_id uuid := auth.uid();
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

  if actor_id is null and resolved_by is not null then
    begin
      actor_id := resolved_by::uuid;
    exception when invalid_text_representation then
      actor_id := null;
    end;
  end if;
  actor_id := coalesce(actor_id, new.reviewed_by, new.confirmed_by);

  select * into context_row
  from public.product_learning_events event
  where event.organization_id = new.organization_id
    and event.project_id = new.project_id
    and event.requirement_id = new.id
    and event.event_type = 'candidate_impression'
    and event.occurred_at >= now() - interval '1 day'
  order by
    case when event.actor_id = actor_id then 0 else 1 end,
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
    actor_id,
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

drop trigger if exists project_requirements_capture_product_resolution_learning
  on public.project_requirements;
create trigger project_requirements_capture_product_resolution_learning
after update of value_json on public.project_requirements
for each row execute function public.capture_product_resolution_learning_event();

-- Preserve deliberate decisions made before feedback collection was added.
-- Historical rows do not have a candidate impression, but they are still
-- valuable positive examples because the user explicitly approved the NRF.
insert into public.product_learning_events (
  organization_id,
  project_id,
  requirement_id,
  event_type,
  actor_id,
  requirement_fingerprint,
  requirement_snapshot,
  selected_product,
  event_key,
  metadata,
  occurred_at
)
select
  suggestion.organization_id,
  suggestion.project_id,
  suggestion.requirement_id,
  'product_selected',
  suggestion.selected_by,
  requirement.mapping_fingerprint,
  jsonb_build_object(
    'category', requirement.category,
    'requirementKey', requirement.requirement_key,
    'valueText', requirement.value_text,
    'value', requirement.value_json,
    'sourceExcerpt', requirement.source_excerpt
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'articleNumber', nullif(btrim(suggestion.product_snapshot ->> 'productNumber'), ''),
    'productName', nullif(btrim(suggestion.product_snapshot ->> 'name'), ''),
    'manufacturer', nullif(btrim(suggestion.product_snapshot ->> 'manufacturer'), ''),
    'source', coalesce(suggestion.product_snapshot ->> 'source', 'distributor_manual')
  )),
  'assignment:' || suggestion.id::text || ':approved:' || coalesce(
    suggestion.product_snapshot ->> 'approvedAt',
    suggestion.selected_at::text,
    suggestion.updated_at::text
  ),
  jsonb_build_object(
    'assignmentId', suggestion.id,
    'distributor', coalesce(suggestion.product_snapshot ->> 'distributor', 'Ahlsell'),
    'backfilled', true
  ),
  coalesce(suggestion.selected_at, suggestion.updated_at, suggestion.created_at)
from public.project_product_suggestions suggestion
join public.project_requirements requirement
  on requirement.id = suggestion.requirement_id
 and requirement.project_id = suggestion.project_id
 and requirement.organization_id = suggestion.organization_id
where suggestion.status = 'selected'
  and suggestion.product_snapshot ->> 'source' = 'distributor_manual'
  and lower(coalesce(suggestion.product_snapshot ->> 'approvedByUser', 'false')) = 'true'
  and nullif(btrim(suggestion.product_snapshot ->> 'productNumber'), '') is not null
on conflict (event_key) do nothing;

insert into public.product_learning_events (
  organization_id,
  project_id,
  requirement_id,
  event_type,
  actor_id,
  requirement_fingerprint,
  requirement_snapshot,
  event_key,
  metadata,
  occurred_at
)
select
  requirement.organization_id,
  requirement.project_id,
  requirement.id,
  'not_in_assortment',
  case
    when coalesce(requirement.value_json #>> '{productResolution,resolvedBy}', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (requirement.value_json #>> '{productResolution,resolvedBy}')::uuid
    else coalesce(requirement.reviewed_by, requirement.confirmed_by)
  end,
  requirement.mapping_fingerprint,
  jsonb_build_object(
    'category', requirement.category,
    'requirementKey', requirement.requirement_key,
    'valueText', requirement.value_text,
    'value', requirement.value_json,
    'sourceExcerpt', requirement.source_excerpt
  ),
  'resolution:' || requirement.id::text || ':not_in_assortment:' || coalesce(
    requirement.value_json #>> '{productResolution,resolvedAt}',
    requirement.updated_at::text
  ),
  jsonb_build_object('backfilled', true),
  case
    when coalesce(requirement.value_json #>> '{productResolution,resolvedAt}', '')
      ~ '^\d{4}-\d{2}-\d{2}T'
      then (requirement.value_json #>> '{productResolution,resolvedAt}')::timestamptz
    else requirement.updated_at
  end
from public.project_requirements requirement
where requirement.value_json #>> '{productResolution,status}' = 'not_in_assortment'
  and requirement.deleted_at is null
on conflict (event_key) do nothing;

-- One row per candidate, ready for offline evaluation/training. A selected
-- candidate is positive; other displayed candidates are negative. When the
-- reviewer chooses "Inte i sortiment", every displayed candidate is negative.
create or replace view public.product_candidate_training_examples
with (security_invoker = true) as
with feedback_events as (
  select event.*
  from public.product_learning_events event
  where event.event_type in ('product_selected', 'not_in_assortment')
    and not exists (
      select 1
      from public.product_learning_events later
      where later.organization_id = event.organization_id
        and later.project_id = event.project_id
        and later.requirement_id = event.requirement_id
        and (
          later.occurred_at,
          later.created_at,
          later.id
        ) > (
          event.occurred_at,
          event.created_at,
          event.id
        )
        and (
          later.event_type in ('product_selected', 'not_in_assortment')
          or (
            event.event_type = 'not_in_assortment'
            and later.event_type = 'resolution_cleared'
          )
        )
    )
), displayed_candidates as (
  select
    event.*,
    candidate.item as candidate,
    candidate.rank::integer as candidate_rank
  from feedback_events event
  cross join lateral jsonb_array_elements(event.candidate_snapshot)
    with ordinality as candidate(item, rank)
), selected_candidates_missing_from_display as (
  select
    event.*,
    event.selected_product as candidate,
    0 as candidate_rank
  from feedback_events event
  where event.event_type = 'product_selected'
    and event.selected_product is not null
    and not exists (
      select 1
      from jsonb_array_elements(event.candidate_snapshot) shown(item)
      where regexp_replace(
        lower(coalesce(shown.item ->> 'articleNumber', '')),
        '[^a-z0-9]', '', 'g'
      ) = regexp_replace(
        lower(coalesce(event.selected_product ->> 'articleNumber', '')),
        '[^a-z0-9]', '', 'g'
      )
    )
), all_candidates as (
  select * from displayed_candidates
  union all
  select * from selected_candidates_missing_from_display
)
select
  candidate_event.id as event_id,
  candidate_event.organization_id,
  candidate_event.project_id,
  candidate_event.requirement_id,
  candidate_event.actor_id,
  candidate_event.requirement_fingerprint,
  candidate_event.requirement_snapshot,
  candidate_event.candidate_rank,
  candidate_event.candidate ->> 'articleNumber' as article_number,
  candidate_event.candidate as candidate_snapshot,
  case
    when candidate_event.event_type = 'product_selected'
      and regexp_replace(
        lower(coalesce(candidate_event.candidate ->> 'articleNumber', '')),
        '[^a-z0-9]', '', 'g'
      ) = regexp_replace(
        lower(coalesce(candidate_event.selected_product ->> 'articleNumber', '')),
        '[^a-z0-9]', '', 'g'
      ) then true
    else false
  end as is_positive,
  case
    when candidate_event.event_type = 'not_in_assortment' then 'not_in_assortment'
    when regexp_replace(
      lower(coalesce(candidate_event.candidate ->> 'articleNumber', '')),
      '[^a-z0-9]', '', 'g'
    ) = regexp_replace(
      lower(coalesce(candidate_event.selected_product ->> 'articleNumber', '')),
      '[^a-z0-9]', '', 'g'
    ) then 'selected'
    else 'not_selected'
  end as outcome,
  candidate_event.occurred_at
from all_candidates candidate_event;

-- Corrections are already captured immutably by requirement_reviews. This
-- view removes product-resolution metadata changes and exposes only corrections
-- that can teach the PDF extraction pipeline.
create or replace view public.requirement_correction_training_examples
with (security_invoker = true) as
select
  review.id as review_id,
  review.organization_id,
  review.project_id,
  review.requirement_id,
  review.reviewed_by,
  requirement.source_excerpt,
  requirement.mapping_fingerprint,
  review.previous_value,
  review.resulting_value,
  review.comment,
  review.reviewed_at
from public.requirement_reviews review
join public.project_requirements requirement
  on requirement.id = review.requirement_id
 and requirement.project_id = review.project_id
 and requirement.organization_id = review.organization_id
where review.previous_value -> 'value_text'
    is distinct from review.resulting_value -> 'value_text'
  or (coalesce(review.previous_value -> 'value_json', '{}'::jsonb) - 'productResolution')
    is distinct from
    (coalesce(review.resulting_value -> 'value_json', '{}'::jsonb) - 'productResolution')
  or review.previous_value -> 'value_number'
    is distinct from review.resulting_value -> 'value_number'
  or review.previous_value -> 'value_boolean'
    is distinct from review.resulting_value -> 'value_boolean';

create or replace view public.product_learning_feedback_summary
with (security_invoker = true) as
select
  event.organization_id,
  count(*) filter (where event.event_type = 'candidate_impression') as candidate_impressions,
  count(*) filter (where event.event_type = 'product_selected') as confirmed_products,
  count(*) filter (where event.event_type = 'not_in_assortment') as not_in_assortment,
  count(distinct event.requirement_id) filter (
    where event.event_type in ('product_selected', 'not_in_assortment')
  ) as labeled_requirements,
  max(event.occurred_at) as latest_feedback_at
from public.product_learning_events event
group by event.organization_id;

grant select on public.product_candidate_training_examples,
  public.requirement_correction_training_examples,
  public.product_learning_feedback_summary
to authenticated;

comment on table public.product_learning_events is
  'Append-only human feedback for product ranking and assortment decisions.';
comment on view public.product_candidate_training_examples is
  'Organization-scoped positive and negative product candidates for offline evaluation and model training.';
comment on view public.requirement_correction_training_examples is
  'Organization-scoped before/after corrections for improving PDF requirement extraction.';
comment on function public.record_product_candidate_impression(uuid, uuid, jsonb) is
  'Records the ranked Ahlsell candidates actually presented to an authorized project reviewer.';
