-- Versioned product-match telemetry. The original RPC remains available while
-- older web deployments roll forward; v2 adds the technical decision state and
-- engine/catalog metadata needed for reproducible offline evaluation.

create or replace function public.record_product_candidate_impression_v2(
  requested_project_id uuid,
  requested_requirement_id uuid,
  requested_candidates jsonb,
  requested_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_actor_id uuid := auth.uid();
  project_row public.projects%rowtype;
  requirement_row public.project_requirements%rowtype;
  clean_candidates jsonb;
  clean_metadata jsonb;
  event_id uuid;
begin
  if current_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(requested_candidates, '[]'::jsonb)) <> 'array' then
    raise exception 'Candidates must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(requested_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Metadata must be a JSON object.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(requested_candidates, '[]'::jsonb)) > 10
    or octet_length(coalesce(requested_candidates, '[]'::jsonb)::text) > 100000
    or octet_length(coalesce(requested_metadata, '{}'::jsonb)::text) > 10000 then
    raise exception 'Product matching feedback is too large.' using errcode = '22023';
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
      'matchState', case
        when candidate.item ->> 'matchState' in ('exact', 'review', 'mismatch')
          then candidate.item ->> 'matchState'
        else 'review'
      end,
      'familyCode', left(nullif(btrim(candidate.item ->> 'familyCode'), ''), 120),
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
      'learningEvidence', case
        when jsonb_typeof(candidate.item -> 'learningEvidence') = 'object'
          then candidate.item -> 'learningEvidence'
        else null
      end,
      'exactMatch', lower(coalesce(candidate.item ->> 'exactMatch', 'false')) = 'true'
    )) order by candidate.rank
  ), '[]'::jsonb)
  into clean_candidates
  from jsonb_array_elements(coalesce(requested_candidates, '[]'::jsonb))
    with ordinality as candidate(item, rank)
  where jsonb_typeof(candidate.item) = 'object'
    and nullif(btrim(candidate.item ->> 'articleNumber'), '') is not null;

  clean_metadata := jsonb_strip_nulls(jsonb_build_object(
    'distributor', 'Ahlsell',
    'matchingEngineVersion', left(nullif(btrim(requested_metadata ->> 'matchingEngineVersion'), ''), 120),
    'catalogVersion', left(nullif(btrim(requested_metadata ->> 'catalogVersion'), ''), 120),
    'rankingMode', left(nullif(btrim(requested_metadata ->> 'rankingMode'), ''), 120),
    'publicSearchAvailable', case
      when jsonb_typeof(requested_metadata -> 'publicSearchAvailable') = 'boolean'
        then requested_metadata -> 'publicSearchAvailable'
      else null
    end,
    'queryCount', case when jsonb_typeof(requested_metadata -> 'queryCount') = 'number' then requested_metadata -> 'queryCount' else null end,
    'directCandidateCount', case when jsonb_typeof(requested_metadata -> 'directCandidateCount') = 'number' then requested_metadata -> 'directCandidateCount' else null end,
    'publicCandidateCount', case when jsonb_typeof(requested_metadata -> 'publicCandidateCount') = 'number' then requested_metadata -> 'publicCandidateCount' else null end,
    'historyCandidateCount', case when jsonb_typeof(requested_metadata -> 'historyCandidateCount') = 'number' then requested_metadata -> 'historyCandidateCount' else null end,
    'shownCandidateCount', case when jsonb_typeof(requested_metadata -> 'shownCandidateCount') = 'number' then requested_metadata -> 'shownCandidateCount' else null end,
    'resultTruncated', case
      when jsonb_typeof(requested_metadata -> 'resultTruncated') = 'boolean'
        then requested_metadata -> 'resultTruncated'
      else null
    end
  ));

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
    current_actor_id,
    requirement_row.mapping_fingerprint,
    jsonb_build_object(
      'category', requirement_row.category,
      'requirementKey', requirement_row.requirement_key,
      'valueText', requirement_row.value_text,
      'value', requirement_row.value_json,
      'sourceExcerpt', requirement_row.source_excerpt
    ),
    clean_candidates,
    clean_metadata
  ) returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.record_product_candidate_impression_v2(
  uuid, uuid, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.record_product_candidate_impression_v2(
  uuid, uuid, jsonb, jsonb
) to authenticated;

-- One row per final reviewer decision. It exposes top-1/top-3 correctness and
-- the exact engine/catalog version that produced the displayed candidates.
create or replace view public.product_match_outcome_examples
with (security_invoker = true) as
with final_decisions as (
  select decision.*
  from public.product_learning_events decision
  where decision.event_type in ('product_selected', 'not_in_assortment')
    and not exists (
      select 1
      from public.product_learning_events later
      where later.organization_id = decision.organization_id
        and later.project_id = decision.project_id
        and later.requirement_id = decision.requirement_id
        and (
          later.event_type in ('product_selected', 'not_in_assortment')
          or (
            decision.event_type = 'not_in_assortment'
            and later.event_type = 'resolution_cleared'
          )
        )
        and (later.occurred_at, later.created_at, later.id)
          > (decision.occurred_at, decision.created_at, decision.id)
    )
), enriched as (
  select
    decision.*,
    context.metadata as impression_metadata,
    decision.candidate_snapshot -> 0 as top_candidate,
    regexp_replace(lower(coalesce(decision.selected_product ->> 'articleNumber', '')), '[^a-z0-9]', '', 'g') as selected_key
  from final_decisions decision
  left join public.product_learning_events context
    on context.id = decision.context_event_id
)
select
  event.id as decision_event_id,
  event.organization_id,
  event.project_id,
  event.requirement_id,
  event.actor_id,
  event.event_type as outcome,
  event.requirement_fingerprint,
  event.requirement_snapshot,
  event.candidate_snapshot,
  event.selected_product,
  event.top_candidate ->> 'articleNumber' as top_candidate_article_number,
  event.top_candidate ->> 'source' as top_candidate_source,
  event.selected_product ->> 'articleNumber' as selected_article_number,
  selected_candidate.rank as selected_rank,
  case
    when event.event_type = 'product_selected' then selected_candidate.rank = 1
    else null
  end as top_1_correct,
  case
    when event.event_type = 'product_selected' then selected_candidate.rank between 1 and 3
    else null
  end as selected_in_top_3,
  coalesce(event.impression_metadata ->> 'matchingEngineVersion', 'legacy') as matching_engine_version,
  event.impression_metadata ->> 'catalogVersion' as catalog_version,
  event.occurred_at
from enriched event
left join lateral (
  select candidate.rank::integer as rank
  from jsonb_array_elements(event.candidate_snapshot)
    with ordinality as candidate(item, rank)
  where regexp_replace(lower(coalesce(candidate.item ->> 'articleNumber', '')), '[^a-z0-9]', '', 'g') = event.selected_key
  order by candidate.rank
  limit 1
) selected_candidate on true;

create or replace view public.product_match_quality_daily
with (security_invoker = true) as
select
  outcome.organization_id,
  date_trunc('day', outcome.occurred_at) as measured_day,
  outcome.matching_engine_version,
  outcome.catalog_version,
  count(*) as labeled_requirements,
  count(*) filter (where outcome.outcome = 'product_selected') as product_selections,
  count(*) filter (where outcome.outcome = 'not_in_assortment') as not_in_assortment,
  count(*) filter (where outcome.top_1_correct) as top_1_correct,
  count(*) filter (where outcome.selected_in_top_3) as selected_in_top_3,
  round(
    100.0 * count(*) filter (where outcome.top_1_correct)
      / nullif(count(*) filter (where outcome.outcome = 'product_selected'), 0),
    2
  ) as top_1_accuracy_percent,
  round(
    100.0 * count(*) filter (where outcome.selected_in_top_3)
      / nullif(count(*) filter (where outcome.outcome = 'product_selected'), 0),
    2
  ) as top_3_coverage_percent
from public.product_match_outcome_examples outcome
group by
  outcome.organization_id,
  date_trunc('day', outcome.occurred_at),
  outcome.matching_engine_version,
  outcome.catalog_version;

grant select on public.product_match_outcome_examples,
  public.product_match_quality_daily
to authenticated;

comment on function public.record_product_candidate_impression_v2(uuid, uuid, jsonb, jsonb) is
  'Records versioned, ranked product candidates and technical match evidence shown to a reviewer.';
comment on view public.product_match_outcome_examples is
  'Final human product decisions joined to the displayed ranking and its engine/catalog version.';
comment on view public.product_match_quality_daily is
  'Daily top-1 and top-3 product matching quality by organization and engine/catalog version.';
