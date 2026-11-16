do $$
begin
  if to_regprocedure('public.approve_product_review(uuid)') is not null then
    execute
      'revoke all privileges on function public.approve_product_review(uuid) '
      'from public, anon, authenticated';
    execute
      'grant execute on function public.approve_product_review(uuid) '
      'to service_role';
  end if;

  if to_regclass('public.pkms_review_queue') is not null then
    execute
      'alter view public.pkms_review_queue set (security_invoker = true)';
    execute
      'revoke all privileges on table public.pkms_review_queue '
      'from public, anon, authenticated';
    execute
      'grant select on table public.pkms_review_queue to service_role';
  end if;

  if to_regclass('public.approved_products') is not null then
    execute
      'alter view public.approved_products set (security_invoker = true)';
    execute
      'revoke all privileges on table public.approved_products '
      'from public, anon, authenticated';
    execute
      'grant select on table public.approved_products to service_role';
  end if;
end;
$$;

comment on function public.approve_product_review(uuid) is
  'Publishes a reviewed product. Execution is restricted to service_role.';
