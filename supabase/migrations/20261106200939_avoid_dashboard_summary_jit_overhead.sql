-- Production verification: identical authenticated dashboard counts took
-- 5,474 ms with JIT versus 808 ms without it after the RLS batching fix.
-- Scope this execution setting to the short dashboard RPC, retaining its
-- SECURITY INVOKER mode, existing grants, search_path, query and row policies.
-- Do not change the database-wide JIT setting or the statement timeout.
alter function public.project_requirement_counts(uuid[]) set jit=off;
