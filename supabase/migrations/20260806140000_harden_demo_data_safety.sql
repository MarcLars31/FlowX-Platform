-- FlowX FAS 2: make demo provenance impossible to silently upgrade to
-- verified technical truth.

create or replace function public.enforce_data_set_quality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  dataset public.data_sets;
  row_data jsonb := to_jsonb(new);
begin
  if new.data_set_id is null then
    return new;
  end if;

  select data_set.*
  into dataset
  from public.data_sets data_set
  where data_set.id = new.data_set_id;

  if dataset.id is null then
    raise exception 'The referenced data set does not exist.';
  end if;

  if dataset.data_mode = 'demo' then
    if row_data ? 'quality_status'
      and row_data ->> 'quality_status' is distinct from 'demo_unverified' then
      raise exception 'Demo rows must retain quality_status demo_unverified.';
    end if;

    if row_data ? 'verification_status'
      and row_data ->> 'verification_status' in (
        'manufacturer_verified',
        'manually_verified'
      ) then
      raise exception 'Demo rows cannot be marked as verified.';
    end if;

    if (row_data ? 'verified_by' and row_data ->> 'verified_by' is not null)
      or (row_data ? 'verified_at' and row_data ->> 'verified_at' is not null) then
      raise exception 'Demo rows cannot have verification identity or time.';
    end if;
  end if;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'manufacturers',
    'product_families',
    'products',
    'product_variants',
    'documents',
    'product_document_versions',
    'approvals',
    'standards',
    'attribute_definitions',
    'product_attribute_values',
    'product_approvals',
    'suppliers',
    'supplier_products',
    'compatibility_rule_sets',
    'compatibility_rules',
    'supplier_offers'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'drop trigger if exists %I on public.%I',
        table_name || '_enforce_data_set_quality',
        table_name
      );
      execute format(
        'create trigger %I before insert or update of data_set_id, quality_status on public.%I for each row execute function public.enforce_data_set_quality()',
        table_name || '_enforce_data_set_quality',
        table_name
      );
    end if;
  end loop;
end
$$;

-- product_attribute_values has additional verification columns whose changes
-- must also invoke the same guard.
drop trigger if exists product_attribute_values_enforce_data_set_quality
  on public.product_attribute_values;
create trigger product_attribute_values_enforce_data_set_quality
before insert or update of
  data_set_id,
  quality_status,
  verification_status,
  verified_by,
  verified_at
on public.product_attribute_values
for each row execute function public.enforce_data_set_quality();

create or replace function public.enforce_project_demo_data_set()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  dataset public.data_sets;
begin
  if new.demo_data_set_id is null then
    return new;
  end if;

  select data_set.*
  into dataset
  from public.data_sets data_set
  where data_set.id = new.demo_data_set_id;

  if dataset.id is null
    or dataset.data_mode <> 'demo'
    or dataset.quality_status <> 'demo_unverified'
    or dataset.disclaimer is distinct from
      'Demo data – ej verifierad för projektering, installation eller inköp.' then
    raise exception 'Projects may only reference a correctly marked demo data set.';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_enforce_demo_data_set on public.projects;
create trigger projects_enforce_demo_data_set
before insert or update of demo_data_set_id on public.projects
for each row execute function public.enforce_project_demo_data_set();

revoke all on function public.enforce_data_set_quality() from public, anon, authenticated;
revoke all on function public.enforce_project_demo_data_set() from public, anon, authenticated;

comment on function public.enforce_data_set_quality() is
  'Rejects verified quality or verification identity on data linked to a demo dataset.';
comment on function public.enforce_project_demo_data_set() is
  'Ensures projects can only carry a valid, exactly labelled demo dataset marker.';
