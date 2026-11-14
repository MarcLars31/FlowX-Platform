-- Compact quality metadata survives background imports and project reloads.
alter table public.technical_description_documents add column if not exists warning_summary jsonb;
-- Existing detailed warnings remain unchanged. Read the small summary in lists.
update public.technical_description_documents d set warning_summary = (
  select jsonb_build_object(
    'warningCount', count(*) filter (where w->>'severity' = 'warning'),
    'incompletePageCount', count(distinct w->>'sourcePage') filter (where w->>'code' = 'PAGE_EXTRACTION_INCOMPLETE'),
    'incompletePages', coalesce((select jsonb_agg(p) from (select distinct (x->>'sourcePage')::int p
      from jsonb_array_elements(d.warnings) x where x->>'code' = 'PAGE_EXTRACTION_INCOMPLETE' and x->>'sourcePage' ~ '^[0-9]+$' order by p limit 100) pages), '[]'::jsonb),
    'quantityPageCount', count(distinct w->>'sourcePage') filter (where w->>'code' in ('PDF_QUANTITY_COLUMNS_UNRECOGNIZED', 'UNRESOLVED_QUANTITY_ROWS')),
    'quantityPages', coalesce((select jsonb_agg(p) from (select distinct (x->>'sourcePage')::int p
      from jsonb_array_elements(d.warnings) x where x->>'code' in ('PDF_QUANTITY_COLUMNS_UNRECOGNIZED', 'UNRESOLVED_QUANTITY_ROWS') and x->>'sourcePage' ~ '^[0-9]+$' order by p limit 100) pages), '[]'::jsonb))
  from jsonb_array_elements(d.warnings) w
) where d.warning_summary is null and jsonb_typeof(d.warnings) = 'array'
  and d.project_id is not null and d.project_module_id is not null;
