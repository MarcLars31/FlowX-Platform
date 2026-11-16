alter table public.products
  add column if not exists product_series text,
  add column if not exists product_type text,
  add column if not exists connection_type text,
  add column if not exists material text,
  add column if not exists available_sizes text,
  add column if not exists max_working_pressure_psi numeric,
  add column if not exists max_working_pressure_kpa numeric,
  add column if not exists minimum_temperature_c numeric,
  add column if not exists gasket_material text,
  add column if not exists coating_options jsonb not null default '[]'::jsonb,
  add column if not exists standards jsonb not null default '[]'::jsonb,
  add column if not exists dimension_data jsonb not null default '[]'::jsonb,
  add column if not exists technical_data jsonb not null default '{}'::jsonb,
  add column if not exists source_document_number text,
  add column if not exists source_revision text,
  add column if not exists source_updated text;

create index if not exists products_product_series_idx
  on public.products (product_series);

create index if not exists products_product_type_idx
  on public.products (product_type);

create index if not exists products_standards_gin_idx
  on public.products using gin (standards);

comment on column public.products.dimension_data is
  'Source-backed dimensional rows extracted from a product datasheet.';

comment on column public.products.technical_data is
  'Additional source-backed product properties that do not belong in searchable scalar columns.';
