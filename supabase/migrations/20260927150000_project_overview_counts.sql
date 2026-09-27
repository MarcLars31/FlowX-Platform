-- Invoker functions preserve project_requirements and suggestion RLS. No new
-- table grants or access policies are introduced by this migration.
create or replace function public.requirement_is_purchase_item(
  item_status text, heading text, value_text text, value_json jsonb, source_excerpt text
) returns boolean language sql immutable set search_path = public as $$
  with normalized as (
    select trim(regexp_replace(regexp_replace(normalize(replace(translate(lower(coalesce(heading,value_text,'')), 'øå', 'oa'),'æ','ae'),NFD),U&'[\0300-\036f]','','g'),'[^a-z0-9]+',' ','g')) as heading_text,
      trim(regexp_replace(regexp_replace(normalize(replace(translate(lower(coalesce(value_json->>'sourceText',source_excerpt,'')), 'øå', 'oa'),'æ','ae'),NFD),U&'[\0300-\036f]','','g'),'[^a-z0-9]+',' ','g')) as source_text
  )
  select coalesce(item_status, '') not in ('rejected', 'superseded')
    and lower(coalesce(value_json->>'operation', 'install')) <> 'remove'
    and not coalesce((value_json->'reviewFlags') @> '["project-information"]'::jsonb, false)
    and lower(trim(coalesce(value_json->>'unit', ''))) not in ('rs', 'rund sum')
    and not (coalesce(trim(value_json->>'unit'), '') = '' and
      concat_ws(E'\n', heading, value_text, coalesce(value_json->>'sourceText', source_excerpt))
        ~* '(^|\n)\s*(Rund\s+sum(\s+RS)?|RS)(\s+[\d., ]+)?\s*($|\n)|\mRund\s+sum\s*($|\n)')
    and heading_text !~ '^(forberedende moter|byggemoter|byggemote|prosjekteringsmoter)\M'
    and coalesce(nullif(heading_text,''),source_text)
      !~ '\m(oppfylling med arbeidsmedium|tetthetsproving|trykkproving|sluttdokumentasjon|kvalitetssikrende tiltak|hulltaking|utsparing|trykktesting av romintegritet|romintegritetstest|maling etter gjennomforing|groft(ekasser)?|gravearbeid|uttak og utlegging av losmasser|tilbakefylling|kryssing|langsforing)\M'
  from normalized;
$$;

create or replace function public.project_requirement_counts(requested_project_ids uuid[])
returns table(project_id uuid, total bigint, approved bigint, not_in_assortment bigint, handled bigint)
language sql stable security invoker set search_path = public as $$
  with visible as (
    select r.id, r.project_id,
      coalesce(r.value_json->'productResolution'->>'status' = 'not_in_assortment', false) as resolved
    from public.project_requirements r
    where r.project_id = any(requested_project_ids) and r.deleted_at is null
      and public.requirement_is_purchase_item(r.status::text, r.display_name, r.value_text, r.value_json, r.source_excerpt)
  ), approvals as (
    select distinct s.requirement_id from public.project_product_suggestions s
    where s.project_id = any(requested_project_ids) and s.status = 'selected'
      and s.product_snapshot @> '{"source":"distributor_manual","approvedByUser":true,"approvalStatus":"user_approved"}'::jsonb
  )
  select r.project_id, count(*), count(a.requirement_id), count(*) filter (where r.resolved),
    count(*) filter (where r.resolved or a.requirement_id is not null)
  from visible r left join approvals a on a.requirement_id = r.id
  group by r.project_id;
$$;
revoke all on function public.project_requirement_counts(uuid[]) from public;
grant execute on function public.project_requirement_counts(uuid[]) to authenticated;
revoke all on function public.requirement_is_purchase_item(text,text,text,jsonb,text) from public;
grant execute on function public.requirement_is_purchase_item(text,text,text,jsonb,text) to authenticated;

create index if not exists project_requirements_active_project_cursor_idx
  on public.project_requirements (organization_id, project_id, id) where deleted_at is null;
create index if not exists project_suggestions_selected_requirement_idx
  on public.project_product_suggestions (project_id, requirement_id) where status = 'selected';
