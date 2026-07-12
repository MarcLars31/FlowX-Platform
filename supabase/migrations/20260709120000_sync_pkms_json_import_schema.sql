create extension if not exists pgcrypto;

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  type text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.product_approvals (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  approval_id uuid not null references public.approvals(id) on delete cascade,
  source_document text,
  approval_text text,
  temperature_ratings jsonb,
  approved_bracket_styles jsonb,
  status text not null default 'needs_review',
  created_at timestamptz not null default now(),
  unique (product_id, approval_id)
);

alter table public.extraction_jobs
  add column if not exists import_type text default 'json',
  add column if not exists total_records integer,
  add column if not exists imported_records integer,
  add column if not exists failed_records integer;
