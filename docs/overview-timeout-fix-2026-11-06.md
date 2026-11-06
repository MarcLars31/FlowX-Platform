# Managed project overview timeout fix — 6 November 2026

## Problem and scope

The live dashboard and project overview intermittently failed with PostgreSQL
`57014` (the eight-second statement timeout) after assignment was enabled.
The 5 November release batched the management RPC reads but left the generic
`project_requirements` and product-suggestion read policies doing authorization
for every row. The dashboard counts RPC and project page both use those policies.
Reuploading a project only avoided this path until assignment was enabled again.

Read-only production reproduction on the new, active Framo Fusa project
`92f140bd-d826-4145-94d6-6ea8a7ad2964`, with owner claims and role `authenticated`,
took **6,512.013 ms** to read the first 1,000 of 1,124 rows. EXPLAIN showed
`pm_can_read(id)` inside the per-row filter. Earlier live logs recorded actual
timeouts on both `/dashboard` and the former project's page.

## Change

Migration `20261106195417_optimize_managed_requirement_scope.sql` batches the
restrictive read scope into authorized full-project and assigned-post sets.
Three guarded helpers live in the existing non-exposed
`scipx_assignment_internal` schema. They use the current `auth.uid()`, fixed
search paths and explicit execution grants; anonymous callers have no access.
Full project readers avoid resolving every assignment. Other readers resolve
the complete hierarchy before filtering effective packages, so another user's
override or an explicit unassignment cannot fall back to a broader chapter.

Suggestion reads check the referenced requirement rather than trusting the
suggestion's project ID. Existing project and suggestion-view permissions are
also evaluated as uncorrelated sets. The public dashboard counts RPC remains
`SECURITY INVOKER`. Write policies, membership, assignments and source documents
are unchanged.

## Validation

- Targeted authenticated tests cover 10,000 posts and 1,000 selected products,
  legacy and enabled management, foreign organizations, null/foreign suggestion
  references, department membership, direct assignment, inheritance, explicit
  unassignment, main-post overrides, viewer/inactive project membership,
  disabled organization membership, suggestion-only permissions and anonymous
  denial. Worker-visible IDs are compared with the existing `pm_can_read` result.
- With normal table statistics, the isolated managed summary took **296 ms** and
  the raw 10,000-row read **89 ms**. In the full concurrent suite: **485 ms** and
  **152 ms** respectively. The test requires each to remain below two seconds,
  leaving margin under the production eight-second limit.
- A 1,124-row worker fixture completed raw reads, suggestions and dashboard
  counts together in **1,559 ms** in the targeted run.
- All **1,320 tests** passed, with TypeScript, zero-warning ESLint and a production
  dependency audit reporting zero vulnerabilities. The Next.js production build
  also completed successfully.
- Empty-database verification passed: **85 SQL migrations** executed (the hosted
  scheduler migration is intentionally excluded), 192 public tables and three
  idempotent seed files.
- Logs in the main checkout: `.tmp/overview-build-20261106.log`,
  `.tmp/overview-database-20261106.log`, `.tmp/overview-summary-20261106.log` and
  `.tmp/overview-regression-20261106.log`.

## Production application

Publication verification is recorded below after applying the migration. This
is a database-only fix; no new application deployment or domain promotion is
required. The application recovery point remains
`a0bd06ff4600857ef4cacbebac471ce544b1eb64` /
`dpl_CZrsdggqfsBMjMzxEyHSqMFfqMxU`. Automatic domain assignment remains disabled.

If rollback is needed, restore the three prior policy expressions from
`20261102181154_optimize_legacy_requirement_scope.sql`,
`20261025120000_department_project_management.sql` (the generic
suggestion select predicate is `can_access_project(project_id) AND
has_permission(organization_id,'project.product_suggestion.view')`). Restore
policies before dropping the new helpers. Rollback restores the slower behavior;
it must not remove management settings or change any user assignment.
