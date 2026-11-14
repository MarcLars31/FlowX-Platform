-- Project matching may read only active/approved global catalog data. Writes
-- remain restricted to platform administration and service-role workflows.

alter table public.suppliers enable row level security;
drop policy if exists suppliers_authenticated_select on public.suppliers;
create policy suppliers_authenticated_select on public.suppliers
for select to authenticated
using (is_active);

alter table public.supplier_products enable row level security;
drop policy if exists supplier_products_authenticated_select on public.supplier_products;
create policy supplier_products_authenticated_select on public.supplier_products
for select to authenticated
using (
  is_active
  and exists (
    select 1
    from public.suppliers supplier
    where supplier.id = supplier_id
      and supplier.is_active
  )
);

alter table public.product_approvals enable row level security;
drop policy if exists product_approvals_authenticated_select on public.product_approvals;
create policy product_approvals_authenticated_select on public.product_approvals
for select to authenticated
using (status = 'approved' and deleted_at is null);

grant select on public.products, public.product_variants, public.manufacturers,
  public.suppliers, public.supplier_products, public.product_approvals
  to authenticated;

revoke insert, update, delete on public.products, public.product_variants,
  public.manufacturers, public.suppliers, public.supplier_products,
  public.product_approvals
  from authenticated;
