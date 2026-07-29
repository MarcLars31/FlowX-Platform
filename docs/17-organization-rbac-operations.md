# FlowX organization/RBAC operations

> Implementation date: 2026-07-29
> Scope: phase 1 B2B SaaS authorization foundation

## Delivered in phase 1

### Database

- Personal profiles backed by `auth.users`.
- Organizations and multi-organization memberships.
- Standard customer roles plus a schema for future custom roles.
- Permission catalog and role-permission bundles.
- Teams and team memberships.
- Organization-, team- and member-scoped project access.
- Project documents, analyses and material-list schemas.
- Subscription records and enforced seat limits.
- Hashed invitation records.
- Soft delete, restore and owner-only permanent project deletion.
- Append-only audit logs.
- Legacy user/project backfill without changing existing IDs.
- Removal of legacy owner-only project policies before tenant policies are added.
- Replacement of the legacy cascading owner foreign key with `ON DELETE SET NULL`.
- RLS on every organization-specific table.

### Application

- Customer database access uses the signed-in user's access token.
- Normal customer traffic never uses the service-role helper.
- Active organization context is selected server-side.
- Navigation is generated from database permissions.
- Project, product and organization layouts are server-protected.
- Mini users cannot see or call project/PDF-analysis functionality.
- Projects created in the UI are persisted in Supabase.
- Organization overview shows members, roles, teams, invitations and seats.
- Invitation creation uses a protected database RPC.
- Project list, trash and activity-log views use RLS-filtered queries.
- Soft delete, restore and permanent-delete server endpoints call protected RPCs.

## Role matrix

| Capability | Owner | Admin | Full | Mini | Read only |
|---|---:|---:|---:|---:|---:|
| View all organization projects | Yes | Yes | No | No | No |
| Create projects | Yes | Yes | Yes | No | No |
| Edit accessible projects | Yes | Yes | Yes | No | No |
| Restore projects | Yes | Yes | No | No | No |
| Permanently delete projects | Yes | No | No | No | No |
| Invite members | Yes | Yes | No | No | No |
| Assign organization admins | Yes | No | No | No | No |
| Manage teams | Yes | Yes | No | No | No |
| Product search | Yes | Yes | Yes | Yes | Yes |
| Start project analyses | Yes | Yes | Yes | No | No |
| View audit log | Yes | Yes | No | No | No |
| Manage billing/ownership | Yes | No | No | No | No |

`platform_admin` is not a customer role. It remains in trusted Supabase Auth
`app_metadata` and cannot be assigned through membership RPCs.

## Migration order

Apply the migrations in filename order:

1. `20260730100000_create_organization_identity_and_rbac.sql`
2. `20260730110000_create_team_project_and_audit_foundation.sql`
3. `20260730120000_backfill_legacy_organization_and_authorization.sql`
4. `20260730130000_enable_organization_rls_and_project_lifecycle.sql`
5. `20260730140000_add_secure_membership_operations.sql`

The database migrations must be deployed before the updated web application.
The web application fails closed when no active organization membership exists.

## Manual Supabase steps

1. Create a fresh database backup or point-in-time recovery checkpoint.
2. Reconcile migration history before deployment. The live `projects` table
   previously existed without a matching registered local migration.
3. Test the full migration chain against a staging clone of production.
4. Verify the deterministic legacy organization and its first owner.
5. Verify every project has a non-null, valid `organization_id`.
6. Verify subscription and seat-limit rows exist for every organization.
7. Run `supabase/tests/organization_rbac_rls.sql` in the isolated test database.
8. Deploy the web application only after the database checks pass.
9. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Customer routes require the
   publishable key plus the user's access token.
10. Configure an email provider before enabling invitation delivery. Phase 1
    stores a secure pending invitation but deliberately does not return its raw
    token to the browser.

Do not paste the test file into production: it creates rollback-only fixtures
and is intended for a local or isolated CI database.

## Live production preflight

A read-only preflight was run against the linked FlowX project
`myzegtifgbvjhdlcpebi` on 2026-07-29. The reusable query is stored in
`supabase/preflight/20260730_organization_rbac_preflight.sql`.

| Check | Live result |
|---|---|
| Auth users | 1 |
| Projects | 1 |
| Organization foundation tables | None |
| `projects.organization_id` | Missing |
| Existing project owner FK delete action | `CASCADE` |
| Existing project RLS | Four customer owner-based policies |
| Registered migration history | Four migrations through `20260718110000` |

The missing local copy of registered migration
`20260718110000_add_product_datasheet_fields.sql` was recovered from the
Supabase migration history before continuing.

The FlowX project is on the Supabase Free plan. The dashboard reports that
database backups are unavailable on this plan, and preview branches require a
Pro upgrade. A preview branch also shows a compute charge of `$0.01344/hour`.
No upgrade, branch creation or production schema change was performed.

Deployment is therefore paused until one of these paths is explicitly chosen:

1. Upgrade, create a preview branch, run the full migration and RLS test there,
   then deploy to production after verification. This is the recommended path.
2. Explicitly accept the higher risk of a direct production migration without
   a Supabase restore point. This is not recommended.

## Verification queries

Run these as a database administrator after migration:

```sql
select count(*) as projects_without_organization
from public.projects
where organization_id is null;

select organization_id, seat_type, seat_limit
from public.organization_seat_limits
order by organization_id, seat_type;

select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in (
    'organizations',
    'organization_members',
    'teams',
    'projects',
    'project_documents',
    'analyses',
    'material_lists',
    'audit_logs'
  )
order by tablename, policyname;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'has_permission',
    'can_access_project',
    'soft_delete_project',
    'restore_project',
    'permanently_delete_project',
    'create_organization_invitation'
  )
order by routine_name;
```

Expected result: zero projects without an organization, complete seat rows,
RLS policies on every tenant table and the listed authorization functions.

## Security invariants

- The client never supplies the effective organization ID for project creation.
- RLS and database functions use `auth.uid()`.
- Tenant and creator fields cannot be changed through normal authenticated
  updates.
- The last active organization owner cannot be disabled or downgraded.
- Organization admins cannot assign owner/admin/platform roles.
- A member cannot change their own role or status.
- Pending invitations reserve seats and active memberships enforce seat limits.
- Invitation token hashes are not selectable by authenticated users.
- Audit rows cannot be updated or deleted.
- Deleted projects remain with their documents, analyses and material lists.

## Deferred phase 2 work

The following is intentionally not presented as complete:

- Invitation email delivery and token-acceptance screen.
- Interactive role/status editing for existing members.
- Interactive team creation and team-member editing.
- Project access/member editor and trash confirmation dialogs.
- Retention-policy scheduler.
- Private Storage bucket and permanent project-PDF upload.
- Persistent extraction jobs, analyses and material-list UI integration.
- Audited, time-bound support access for internal platform administrators.
- UI for switching between multiple organization memberships.

These build on the phase 1 schema without destructive redesign.
