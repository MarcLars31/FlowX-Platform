# FlowX organization and RBAC foundation

> Baseline reviewed: 2026-07-29
> Scope: Supabase Auth, public schema, Next.js server routes and local project flow
> Delivery strategy: backward-compatible foundation first, then operational UI

## 1. Current implementation

### Users and profiles

- Supabase Auth is the identity provider.
- Sign-in uses Supabase Auth REST endpoints and stores access and refresh tokens
  in HttpOnly, SameSite=Lax cookies.
- There is no `profiles` table.
- Display name and company name currently come from Auth user metadata.
- The only trusted platform role is read from `app_metadata.role`.
- There is no organization membership, customer role or permission engine.

### Existing Supabase data

The latest read-only live review found the global product catalog tables,
`projects`, product documents and extraction jobs. It did not find:

- `profiles`
- `organizations`
- `organization_members`
- `roles`
- `permissions`
- `teams`
- `project_members`
- project documents
- persisted analyses
- persisted material lists
- audit logs

The product catalog is global. It must not be assigned to a customer
organization unless a future product-ownership requirement explicitly says so.

### Projects

- Project metadata is stored permanently in `public.projects`.
- Existing ownership is individual through `projects.owner_id`.
- The project API implementation that created those rows is not currently
  present in the repository, and the live project migration history has drift.
- Existing project IDs and `owner_id` values must be retained during migration.

### PDF files, analyses and material lists

- PDF extraction happens in a Next.js server route and returns JSON.
- Original project PDFs are not persisted in Supabase Storage.
- Analysis state, material rows and product matches are stored in global
  browser `localStorage` keys.
- That state is not namespaced by user, organization or project.
- Product datasheet documents are catalog documents, not project documents.

### Current RLS and server access

- `projects` has owner-based RLS policies in the live database.
- Other catalog tables are RLS-enabled but largely deny direct client access.
- The generic `supabase-rest.ts` helper uses service role and bypasses RLS.
- PKMS mutation routes now require a trusted platform administrator.
- Product search and PDF extraction require authentication.
- The review RPC and review views were hardened live and have a matching local
  migration.

### Existing reusable parts

- Supabase Auth and HttpOnly session cookies.
- Trusted `app_metadata` handling for the separate `platform_admin` role.
- Fail-closed route guards.
- Existing project IDs, `owner_id`, timestamps and project UI.
- Current product catalog and review workflow.
- Existing owner-based project data can be migrated without destructive
  updates.

## 2. Security gaps addressed by this foundation

1. Customer data has no organization boundary.
2. Customer roles and permissions do not exist.
3. Team and restricted-project access do not exist.
4. Normal project traffic cannot rely on RLS while service role is used.
5. Project deletion has no soft-delete or audit trail.
6. There is no protection against self-promotion or assigning
   `platform_admin` as a customer role.
7. There is no last-owner invariant.
8. Seat limits cannot be enforced server-side.
9. Project PDFs, analyses and material lists are not persistent or tenant
   scoped.

## 3. Target model

```text
auth.users
  └─ profiles

organizations
  ├─ organization_members ── roles ── role_permissions ── permissions
  ├─ organization_invitations
  ├─ teams ── team_members
  ├─ organization_subscriptions
  ├─ organization_seat_limits
  ├─ projects
  │   └─ project_members
  └─ audit_logs
```

`platform_admin` remains separate in trusted Auth app metadata. It is never a
row in the customer role catalog and can never be assigned by a customer admin.

## 4. Standard customer roles

- `organization_owner`
- `organization_admin`
- `full_user`
- `mini_user`
- `read_only`

System roles have `organization_id = null`. A future custom role has an
organization ID and can only contain permissions assignable within that
organization.

## 5. Project access rules

- `own`: creator and explicit project members.
- `team`: eligible members of the owning team plus explicit project members.
- `organization`: eligible organization members.
- `restricted`: explicit project members and organization administrators.

Owners and organization admins normally have all-project visibility.
`mini_user` receives no project permissions and is denied by RLS even if a
frontend route is entered directly.

## 6. Migration invariants

- No existing row is deleted.
- Existing project IDs and owners are retained.
- A deterministic legacy organization is created only when unmigrated projects
  or users require it.
- Existing project owners become active members and receive an owner role in the
  legacy organization.
- `organization_id` is populated before it becomes mandatory.
- Constraints are added only after backfill validation.
- Migration scripts are forward-only and use safe `IF EXISTS` /
  `IF NOT EXISTS` patterns where practical.
- Audit logs are append-only for application roles.

## 7. Delivery phases

### Phase 1 — foundation in this delivery

- organization, profile, membership, role and permission schema
- standard permission catalog and standard role bundles
- teams and team membership
- project organization/team/access fields and project members
- soft-delete fields
- subscription and seat-limit foundation
- invitation records
- append-only audit logs
- safe legacy data backfill
- reusable RLS authorization functions
- tenant and project-access RLS policies
- TypeScript permission and navigation model
- server-side organization context
- user-token Supabase access for customer routes
- permission-driven customer navigation and route guards
- persisted project creation/listing
- organization/member/team/license read views
- protected invitation creation
- project trash/activity read views and lifecycle APIs

### Phase 2 — operational administration

- invitation email delivery and acceptance
- role/status editing workflows
- team mutation workflows
- organization settings mutations
- richer seat usage and subscription controls

### Phase 3 — project lifecycle

- organization-scoped project CRUD
- access-level editor and project-member management
- trash, restore and permanent-delete UI
- project audit history

### Phase 4 — persistent project artifacts

- private Storage bucket and policies
- project documents
- analyses and analysis jobs
- material lists and versions
- removal of tenant-sensitive `localStorage` persistence

## 8. Manual Supabase deployment rule

The new migration files must be reviewed and applied through the Supabase CLI
or a controlled database deployment. They are not automatically applied to the
live project by a source-code commit. Migration history drift must be reconciled
before running the new chain in production.
