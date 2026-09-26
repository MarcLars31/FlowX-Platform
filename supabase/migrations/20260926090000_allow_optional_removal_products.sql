-- A removal scope can contain replacement products selected by the user.
-- Keep its operation, source quantities and all access/approval checks intact.
do $migration$
declare
  target regprocedure;
  definition text;
  removal_guard constant text := $guard$if\s+lower\(coalesce\(requirement_row\.value_json\s*->>\s*'operation',\s*'install'\)\)\s*=\s*'remove'\s+then\s+raise\s+exception\s+'Removal lines cannot receive a product\.';\s+end\s+if;$guard$;
begin
  foreach target in array array[
    'public.prepare_requirement_for_direct_product_mapping(uuid,uuid)'::regprocedure,
    'public.save_distributor_product_mapping(uuid,uuid,text,text,text,text,jsonb)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if definition ~ removal_guard then
      execute regexp_replace(definition, removal_guard, '');
    elsif position('Removal lines cannot receive a product.' in definition) > 0 then
      raise exception 'Unrecognized removal guard in %', target;
    end if;
  end loop;
end;
$migration$;
