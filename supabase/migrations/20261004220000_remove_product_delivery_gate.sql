-- The product selection no longer exposes a separate delivery review.
-- Retain manager-only project settings; completion follows the existing
-- product approval flow without requiring a hidden delivery checklist.
create or replace function public.guard_assigned_project_settings()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is not null and old.assignments_enforced and not public.is_delivery_manager(old.id)
 and ((to_jsonb(new)-'current_stage'-'updated_at') is distinct from (to_jsonb(old)-'current_stage'-'updated_at') or (new.current_stage='completed' and old.current_stage is distinct from new.current_stage)) then
   raise exception 'Only the project manager can change project settings' using errcode='42501';
 end if;
 return new;
end $$;
