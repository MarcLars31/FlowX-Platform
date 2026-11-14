-- Read-only production preflight for the FlowX organization/RBAC migrations.
-- Safe to run in the Supabase SQL editor before applying any migration.

select 'auth_users' as check_name, count(*)::text as result
from auth.users

union all

select 'projects', count(*)::text
from public.projects

union all

select
  'registered_migrations',
  coalesce(string_agg(version || ' ' || name, ', ' order by version), 'none')
from supabase_migrations.schema_migrations

union all

select
  'project_policies',
  coalesce(string_agg(policyname, ', ' order by policyname), 'none')
from pg_policies
where schemaname = 'public'
  and tablename = 'projects'

union all

select
  'projects_owner_fk_delete_action',
  coalesce(string_agg(distinct rc.delete_rule, ', ' order by rc.delete_rule), 'none')
from information_schema.referential_constraints rc
join information_schema.table_constraints tc
  on tc.constraint_catalog = rc.constraint_catalog
 and tc.constraint_schema = rc.constraint_schema
 and tc.constraint_name = rc.constraint_name
join information_schema.constraint_column_usage ccu
  on ccu.constraint_catalog = rc.unique_constraint_catalog
 and ccu.constraint_schema = rc.unique_constraint_schema
 and ccu.constraint_name = rc.unique_constraint_name
where tc.table_schema = 'public'
  and tc.table_name = 'projects'
  and ccu.table_schema = 'auth'
  and ccu.table_name = 'users'

union all

select
  'organization_foundation_tables',
  coalesce(
    string_agg(table_name, ', ' order by table_name),
    'none'
  )
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'organizations',
    'organization_members',
    'roles',
    'permissions',
    'role_permissions',
    'teams',
    'team_members',
    'project_members',
    'project_teams',
    'project_documents',
    'analyses',
    'material_lists',
    'audit_logs'
  )

union all

select
  'projects_organization_id_column',
  case when count(*) = 1 then 'present' else 'missing' end
from information_schema.columns
where table_schema = 'public'
  and table_name = 'projects'
  and column_name = 'organization_id';
