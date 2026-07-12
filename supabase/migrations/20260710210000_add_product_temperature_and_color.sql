alter table public.products
  add column if not exists temperature_ratings jsonb not null default '[]'::jsonb,
  add column if not exists color text;

do $$
declare
  product_record record;
  payload jsonb;
  imported_temperature_ratings jsonb;
  imported_color text;
begin
  for product_record in
    select id, raw_text
    from public.products
    where raw_text is not null
  loop
    begin
      payload := product_record.raw_text::jsonb;
    exception when others then
      continue;
    end;

    imported_temperature_ratings := coalesce(
      payload -> 'temperature_ratings',
      payload #> '{raw_json,temperatureRatings}',
      payload #> '{raw_json,sprinklerModel,temperatureRatings}',
      payload #> '{raw_json,source,temperatureRatings}'
    );

    if jsonb_typeof(imported_temperature_ratings) <> 'array' then
      imported_temperature_ratings := null;
    end if;

    imported_color := coalesce(
      payload ->> 'color',
      payload #>> '{raw_json,color}',
      payload #>> '{raw_json,colour}',
      payload #>> '{raw_json,bulbColor}',
      payload #>> '{raw_json,finish}',
      payload #>> '{raw_json,physicalCharacteristics,color}',
      payload #>> '{raw_json,physicalCharacteristics,finish}'
    );

    update public.products
    set
      temperature_ratings = coalesce(
        imported_temperature_ratings,
        temperature_ratings
      ),
      color = coalesce(imported_color, color)
    where id = product_record.id;
  end loop;
end $$;
