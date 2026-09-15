-- FlowX FAS 1: row-level security and non-bypassable technical gating.

create or replace function public.is_organization_admin(
  requested_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    public.has_organization_role(requested_organization_id, 'organization_owner')
    or public.has_organization_role(requested_organization_id, 'organization_admin')
    or public.has_organization_role(requested_organization_id, 'company_admin');
$$;

-- Repair two legacy scope triggers that used a generic helper requiring a
-- project_id column even though these tables identify the project indirectly.
create or replace function public.enforce_material_list_version_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  parent_organization_id uuid;
  parent_project_id uuid;
  run_project_id uuid;
begin
  select material_list.organization_id, material_list.project_id
  into parent_organization_id, parent_project_id
  from public.material_lists material_list
  where material_list.id = new.material_list_id;

  if parent_organization_id is null
    or parent_organization_id is distinct from new.organization_id then
    raise exception 'Material-list version scope does not match its material list.';
  end if;

  if new.source_match_run_id is not null then
    select match_run.project_id into run_project_id
    from public.match_runs match_run
    where match_run.id = new.source_match_run_id;
    if run_project_id is distinct from parent_project_id then
      raise exception 'Material-list version and match run belong to different projects.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists material_list_versions_enforce_scope on public.material_list_versions;
create trigger material_list_versions_enforce_scope
before insert or update on public.material_list_versions
for each row execute function public.enforce_material_list_version_scope();

create or replace function public.enforce_reference_project_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  source_organization_id uuid;
begin
  if new.source_project_id is not null then
    select project.organization_id into source_organization_id
    from public.projects project where project.id = new.source_project_id;
    if source_organization_id is distinct from new.organization_id then
      raise exception 'Reference project and source project belong to different organizations.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reference_projects_enforce_scope on public.reference_projects;
create trigger reference_projects_enforce_scope
before insert or update on public.reference_projects
for each row execute function public.enforce_reference_project_scope();

-- ---------------------------------------------------------------------------
-- Technical and compatibility gating.
-- ---------------------------------------------------------------------------

update public.match_candidates
set review_status = case
      when technical_result = 'fail' then 'rejected'
      else 'requires_review'
    end,
    ranking_score = null,
    commercial_factors = '{}'::jsonb
where technical_result <> 'pass'
   or review_status <> 'eligible';

alter table public.match_candidates
  drop constraint if exists match_candidates_eligible_requires_pass,
  drop constraint if exists match_candidates_ranking_requires_eligibility,
  drop constraint if exists match_candidates_commercial_requires_eligibility,
  drop constraint if exists match_candidates_unresolved_requires_review;

alter table public.match_candidates
  add constraint match_candidates_eligible_requires_pass check (
    review_status <> 'eligible' or technical_result = 'pass'
  ),
  add constraint match_candidates_ranking_requires_eligibility check (
    ranking_score is null
    or (technical_result = 'pass' and review_status = 'eligible')
  ),
  add constraint match_candidates_commercial_requires_eligibility check (
    commercial_factors = '{}'::jsonb
    or (technical_result = 'pass' and review_status = 'eligible')
  ),
  add constraint match_candidates_unresolved_requires_review check (
    technical_result not in ('unknown', 'not_applicable')
    or review_status = 'requires_review'
  );

create or replace function public.recompute_match_candidate_technical_gate(
  requested_match_candidate_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate public.match_candidates%rowtype;
  has_evaluation boolean;
  has_failure boolean;
  has_unknown boolean;
begin
  select * into candidate
  from public.match_candidates
  where id = requested_match_candidate_id
  for update;

  if candidate.id is null then
    return;
  end if;

  select
    exists (
      select 1 from public.requirement_evaluations evaluation
      where evaluation.match_candidate_id = candidate.id and evaluation.is_mandatory
    )
    or exists (
      select 1 from public.compatibility_evaluations evaluation
      where evaluation.match_run_id = candidate.match_run_id
        and (
          (candidate.product_variant_id is not null and evaluation.product_variant_id = candidate.product_variant_id)
          or (
            candidate.product_variant_id is null
            and evaluation.product_variant_id is null
            and evaluation.product_id = candidate.product_id
          )
        )
    ),
    exists (
      select 1 from public.requirement_evaluations evaluation
      where evaluation.match_candidate_id = candidate.id
        and evaluation.is_mandatory
        and evaluation.result = 'fail'
    )
    or exists (
      select 1 from public.compatibility_evaluations evaluation
      where evaluation.match_run_id = candidate.match_run_id
        and evaluation.result = 'fail'
        and (
          (candidate.product_variant_id is not null and evaluation.product_variant_id = candidate.product_variant_id)
          or (
            candidate.product_variant_id is null
            and evaluation.product_variant_id is null
            and evaluation.product_id = candidate.product_id
          )
        )
    ),
    exists (
      select 1 from public.requirement_evaluations evaluation
      where evaluation.match_candidate_id = candidate.id
        and evaluation.is_mandatory
        and evaluation.result = 'unknown'
    )
    or exists (
      select 1 from public.compatibility_evaluations evaluation
      where evaluation.match_run_id = candidate.match_run_id
        and evaluation.result = 'unknown'
        and (
          (candidate.product_variant_id is not null and evaluation.product_variant_id = candidate.product_variant_id)
          or (
            candidate.product_variant_id is null
            and evaluation.product_variant_id is null
            and evaluation.product_id = candidate.product_id
          )
        )
    )
  into has_evaluation, has_failure, has_unknown;

  if has_failure then
    update public.match_candidates
    set technical_result = 'fail',
        review_status = 'rejected',
        ranking_score = null,
        commercial_factors = '{}'::jsonb,
        updated_at = now()
    where id = candidate.id;
  elsif not has_evaluation or has_unknown then
    update public.match_candidates
    set technical_result = 'unknown',
        review_status = 'requires_review',
        ranking_score = null,
        commercial_factors = '{}'::jsonb,
        updated_at = now()
    where id = candidate.id;
  else
    update public.match_candidates
    set technical_result = 'pass',
        review_status = case
          when review_status = 'rejected' then 'requires_review'
          else review_status
        end,
        ranking_score = case when review_status = 'eligible' then ranking_score else null end,
        commercial_factors = case
          when review_status = 'eligible' then commercial_factors
          else '{}'::jsonb
        end,
        updated_at = now()
    where id = candidate.id;
  end if;
end;
$$;

create or replace function public.refresh_candidate_from_requirement_evaluation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.recompute_match_candidate_technical_gate(
    case when tg_op = 'DELETE' then old.match_candidate_id else new.match_candidate_id end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.refresh_candidates_from_compatibility_evaluation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  evaluation public.compatibility_evaluations%rowtype;
  candidate_id uuid;
begin
  evaluation := case when tg_op = 'DELETE' then old else new end;
  for candidate_id in
    select candidate.id
    from public.match_candidates candidate
    where candidate.match_run_id = evaluation.match_run_id
      and (
        (evaluation.product_variant_id is not null and candidate.product_variant_id = evaluation.product_variant_id)
        or (
          evaluation.product_variant_id is null
          and candidate.product_variant_id is null
          and candidate.product_id = evaluation.product_id
        )
      )
  loop
    perform public.recompute_match_candidate_technical_gate(candidate_id);
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists requirement_evaluations_refresh_gate on public.requirement_evaluations;
create trigger requirement_evaluations_refresh_gate
after insert or update or delete on public.requirement_evaluations
for each row execute function public.refresh_candidate_from_requirement_evaluation();

drop trigger if exists compatibility_evaluations_refresh_gate on public.compatibility_evaluations;
create trigger compatibility_evaluations_refresh_gate
after insert or update or delete on public.compatibility_evaluations
for each row execute function public.refresh_candidates_from_compatibility_evaluation();

create or replace function public.validate_matching_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate public.match_candidates%rowtype;
begin
  select * into candidate from public.match_candidates where id = new.match_candidate_id;
  if candidate.id is null
    or candidate.project_id is distinct from new.project_id
    or candidate.organization_id is distinct from new.organization_id
    or candidate.match_run_id is distinct from new.match_run_id then
    raise exception 'Matching decision scope does not match its candidate.';
  end if;
  if new.decision = 'selected'
    and (candidate.technical_result <> 'pass' or candidate.review_status <> 'eligible') then
    raise exception 'Only technically passed and eligible candidates can be selected.';
  end if;
  return new;
end;
$$;

drop trigger if exists matching_decisions_validate on public.matching_decisions;
create trigger matching_decisions_validate
before insert or update on public.matching_decisions
for each row execute function public.validate_matching_decision();

update public.material_list_items
set selected = false,
    override_reason = coalesce(
      override_reason,
      'Automatically deselected during technical-gate migration.'
    )
where selected
  and (
    technical_status <> 'pass'
    or compatibility_status not in ('pass', 'not_applicable')
  );

alter table public.material_list_items
  drop constraint if exists material_list_items_selected_technical_gate;
alter table public.material_list_items
  add constraint material_list_items_selected_technical_gate check (
    not selected
    or (
      technical_status = 'pass'
      and compatibility_status in ('pass', 'not_applicable')
    )
  );

create or replace function public.validate_material_list_item_selection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.quantity is null or new.quantity <= 0 then
    raise exception 'Material list quantity must be greater than zero.';
  end if;
  if new.selected and new.technical_status <> 'pass' then
    raise exception 'A product that has not passed mandatory technical requirements cannot be selected.';
  end if;
  if new.selected and new.compatibility_status not in ('pass', 'not_applicable') then
    raise exception 'A product with failed or unresolved compatibility cannot be selected.';
  end if;
  return new;
end;
$$;

-- Record user-driven requirement state/value changes as immutable reviews.
create or replace function public.capture_requirement_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  reviewer_id uuid := coalesce(auth.uid(), new.reviewed_by, new.confirmed_by);
begin
  if reviewer_id is not null
    and (
      old.status is distinct from new.status
      or old.value_text is distinct from new.value_text
      or old.value_json is distinct from new.value_json
      or old.value_number is distinct from new.value_number
      or old.value_boolean is distinct from new.value_boolean
    ) then
    insert into public.requirement_reviews (
      organization_id, project_id, requirement_id,
      previous_status, resulting_status, previous_value, resulting_value,
      comment, reviewed_by, reviewed_at
    ) values (
      new.organization_id, new.project_id, new.id,
      old.status, new.status,
      jsonb_build_object(
        'value_text', old.value_text, 'value_json', old.value_json,
        'value_number', old.value_number, 'value_boolean', old.value_boolean
      ),
      jsonb_build_object(
        'value_text', new.value_text, 'value_json', new.value_json,
        'value_number', new.value_number, 'value_boolean', new.value_boolean
      ),
      new.reviewer_comment, reviewer_id, coalesce(new.reviewed_at, now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists project_requirements_capture_review on public.project_requirements;
create trigger project_requirements_capture_review
after update on public.project_requirements
for each row execute function public.capture_requirement_review();

-- ---------------------------------------------------------------------------
-- RLS and grants.
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_systems', 'project_buildings', 'project_floors', 'project_zones',
    'project_positions', 'project_system_buildings', 'project_system_zones',
    'requirement_reviews', 'price_lists', 'price_list_items', 'stock_levels',
    'lead_times', 'offer_history', 'matching_decisions', 'matching_overrides',
    'import_jobs', 'import_job_rows', 'import_errors', 'data_sources', 'data_sets',
    'unit_definitions', 'unit_conversions', 'attribute_synonyms', 'product_families',
    'product_document_versions', 'product_images', 'approval_conditions',
    'rule_packages', 'rule_package_versions', 'rule_definitions',
    'compatibility_rule_conditions', 'product_compatibility_groups',
    'product_compatibility_group_members', 'external_product_mappings',
    'external_attribute_mappings', 'catalog_revision_history'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$$;

-- Same project access contract for hierarchy and join tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_systems', 'project_buildings', 'project_floors', 'project_zones',
    'project_positions', 'project_system_buildings', 'project_system_zones'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, %L))',
      table_name, table_name, 'project.settings.view'
    );
    execute format('drop policy if exists %I_insert on public.%I', table_name, table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.can_access_project(project_id) and public.has_permission(organization_id, %L))',
      table_name, table_name, 'project.settings.update'
    );
    execute format('drop policy if exists %I_update on public.%I', table_name, table_name);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, %L)) with check (public.can_access_project(project_id) and public.has_permission(organization_id, %L))',
      table_name, table_name, 'project.settings.update', 'project.settings.update'
    );
    execute format('drop policy if exists %I_delete on public.%I', table_name, table_name);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, %L))',
      table_name, table_name, 'project.settings.update'
    );
  end loop;
end
$$;

drop policy if exists requirement_reviews_select on public.requirement_reviews;
create policy requirement_reviews_select on public.requirement_reviews
for select to authenticated
using (public.can_access_project(project_id) and public.has_permission(organization_id, 'project.requirement.view'));
drop policy if exists requirement_reviews_insert on public.requirement_reviews;
create policy requirement_reviews_insert on public.requirement_reviews
for insert to authenticated
with check (
  reviewed_by = auth.uid()
  and public.can_access_project(project_id)
  and public.has_permission(organization_id, 'project.requirement.update')
);

-- Project matching records.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['matching_decisions', 'matching_overrides']
  loop
    execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, %L))',
      table_name, table_name, 'project.product_suggestion.view'
    );
    execute format('drop policy if exists %I_insert on public.%I', table_name, table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.can_access_project(project_id) and public.has_permission(organization_id, %L))',
      table_name, table_name, 'project.product_suggestion.update'
    );
    execute format('drop policy if exists %I_update on public.%I', table_name, table_name);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.can_access_project(project_id) and public.has_permission(organization_id, %L)) with check (public.can_access_project(project_id) and public.has_permission(organization_id, %L))',
      table_name, table_name, 'project.product_suggestion.update', 'project.product_suggestion.update'
    );
  end loop;
end
$$;

-- Organization-scoped commercial observations.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['price_lists', 'price_list_items', 'stock_levels', 'lead_times']
  loop
    execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.is_organization_member(organization_id) and public.has_permission(organization_id, %L))',
      table_name, table_name, 'product.view'
    );
    execute format('drop policy if exists %I_write on public.%I', table_name, table_name);
    execute format(
      'create policy %I_write on public.%I for all to authenticated using (public.has_permission(organization_id, %L)) with check (public.has_permission(organization_id, %L))',
      table_name, table_name, 'product.import', 'product.import'
    );
  end loop;
end
$$;

drop policy if exists offer_history_select on public.offer_history;
create policy offer_history_select on public.offer_history
for select to authenticated
using (public.is_organization_member(organization_id) and public.has_permission(organization_id, 'product.view'));

-- Imports can be platform-global or organization-specific. Child rows inherit
-- access solely through their parent job.
drop policy if exists import_jobs_select on public.import_jobs;
create policy import_jobs_select on public.import_jobs
for select to authenticated
using (
  public.is_platform_admin()
  or (organization_id is not null and public.is_organization_member(organization_id))
);
drop policy if exists import_jobs_write on public.import_jobs;
create policy import_jobs_write on public.import_jobs
for all to authenticated
using (
  public.is_platform_admin()
  or (organization_id is not null and public.has_permission(organization_id, 'product.import'))
)
with check (
  public.is_platform_admin()
  or (organization_id is not null and public.has_permission(organization_id, 'product.import'))
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['import_job_rows', 'import_errors']
  loop
    execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (exists (select 1 from public.import_jobs job where job.id = import_job_id and (public.is_platform_admin() or (job.organization_id is not null and public.is_organization_member(job.organization_id)))))',
      table_name, table_name
    );
    execute format('drop policy if exists %I_write on public.%I', table_name, table_name);
    execute format(
      'create policy %I_write on public.%I for all to authenticated using (exists (select 1 from public.import_jobs job where job.id = import_job_id and (public.is_platform_admin() or (job.organization_id is not null and public.has_permission(job.organization_id, %L))))) with check (exists (select 1 from public.import_jobs job where job.id = import_job_id and (public.is_platform_admin() or (job.organization_id is not null and public.has_permission(job.organization_id, %L)))))',
      table_name, table_name, 'product.import', 'product.import'
    );
  end loop;
end
$$;

-- Data sources can be global or tenant-owned. Datasets and global technical
-- reference data are readable by authenticated users; only platform admins can
-- mutate them through a user session. service_role continues to bypass RLS.
drop policy if exists data_sources_select on public.data_sources;
create policy data_sources_select on public.data_sources
for select to authenticated
using (organization_id is null or public.is_organization_member(organization_id));
drop policy if exists data_sources_platform_write on public.data_sources;
create policy data_sources_platform_write on public.data_sources
for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'data_sets', 'unit_definitions', 'unit_conversions', 'attribute_synonyms',
    'product_families', 'product_document_versions', 'product_images',
    'approval_conditions', 'rule_packages', 'rule_package_versions',
    'rule_definitions', 'compatibility_rule_conditions',
    'product_compatibility_groups', 'product_compatibility_group_members',
    'external_product_mappings', 'external_attribute_mappings'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (true)',
      table_name, table_name
    );
    execute format('drop policy if exists %I_platform_write on public.%I', table_name, table_name);
    execute format(
      'create policy %I_platform_write on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      table_name, table_name
    );
  end loop;
end
$$;

drop policy if exists catalog_revision_history_platform_select on public.catalog_revision_history;
create policy catalog_revision_history_platform_select on public.catalog_revision_history
for select to authenticated using (public.is_platform_admin());

grant select on public.project_systems, public.project_buildings, public.project_floors,
  public.project_zones, public.project_positions, public.project_system_buildings,
  public.project_system_zones, public.requirement_reviews, public.unit_definitions,
  public.unit_conversions, public.attribute_synonyms, public.product_families,
  public.product_document_versions, public.product_images, public.approval_conditions,
  public.rule_packages, public.rule_package_versions, public.rule_definitions,
  public.compatibility_rule_conditions, public.product_compatibility_groups,
  public.product_compatibility_group_members, public.data_sources, public.data_sets,
  public.import_jobs, public.import_job_rows, public.import_errors,
  public.external_product_mappings, public.external_attribute_mappings,
  public.price_lists, public.price_list_items, public.stock_levels, public.lead_times,
  public.offer_history, public.matching_decisions, public.matching_overrides,
  public.catalog_revision_history to authenticated;

grant insert, update, delete on public.project_systems, public.project_buildings,
  public.project_floors, public.project_zones, public.project_positions,
  public.project_system_buildings, public.project_system_zones,
  public.requirement_reviews, public.matching_decisions, public.matching_overrides,
  public.import_jobs, public.import_job_rows, public.import_errors,
  public.price_lists, public.price_list_items, public.stock_levels, public.lead_times
  to authenticated;

grant insert, update, delete on public.data_sources, public.data_sets,
  public.unit_definitions, public.unit_conversions, public.attribute_synonyms,
  public.product_families, public.product_document_versions, public.product_images,
  public.approval_conditions, public.rule_packages, public.rule_package_versions,
  public.rule_definitions, public.compatibility_rule_conditions,
  public.product_compatibility_groups, public.product_compatibility_group_members,
  public.external_product_mappings, public.external_attribute_mappings
  to authenticated;

grant select on public.companies, public.company_members, public.company_invitations,
  public.product_categories, public.product_attributes, public.requirement_sources,
  public.requirement_conflicts, public.distributors, public.distributor_offers,
  public.analysis_runs, public.matching_runs, public.matching_candidates,
  public.matching_results, public.matching_result_checks, public.compatibility_checks,
  public.compatibility_rule_results, public.material_list_exports to authenticated;

revoke insert, update, delete on public.offer_history, public.catalog_revision_history
  from authenticated;

revoke all on function public.protect_platform_admin_membership() from public, anon, authenticated;
revoke all on function public.capture_supplier_offer_history() from public, anon, authenticated;
revoke all on function public.capture_catalog_revision() from public, anon, authenticated;
revoke all on function public.recompute_match_candidate_technical_gate(uuid) from public, anon, authenticated;
revoke all on function public.refresh_candidate_from_requirement_evaluation() from public, anon, authenticated;
revoke all on function public.refresh_candidates_from_compatibility_evaluation() from public, anon, authenticated;
revoke all on function public.validate_matching_decision() from public, anon, authenticated;
revoke all on function public.capture_requirement_review() from public, anon, authenticated;
revoke all on function public.enforce_material_list_version_scope() from public, anon, authenticated;
revoke all on function public.enforce_reference_project_scope() from public, anon, authenticated;

grant execute on function public.recompute_match_candidate_technical_gate(uuid) to service_role;

comment on constraint match_candidates_eligible_requires_pass on public.match_candidates is
  'Commercial eligibility cannot override a failed or unresolved technical result.';
comment on constraint material_list_items_selected_technical_gate on public.material_list_items is
  'Selected material-list items must pass technical and compatibility checks; override text cannot bypass this rule.';
