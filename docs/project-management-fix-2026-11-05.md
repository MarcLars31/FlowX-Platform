# Organization navigation and project management overview

Status: prepared locally; not published. The current live release remains the one recorded in `production-release-2026-11-02.md`.

## Problems and changes

- `/organization` exists, including team creation and membership management, but the organization navigation omitted its link. Add **Organisation** to the shared navigation, using the same permission requirements as the existing organization layout. Existing server permissions continue to control team creation.
- `project_management_overview` times out under the production eight-second limit for Ahlsell Norge even with no enabled project management projects. The planner can run expensive per-post aggregates before eliminating projects without management settings. Materialize the enabled, authorized project list before the lateral aggregate. Preserve all access predicates, function privileges, output fields and counting rules.

## Database change

Apply `supabase/migrations/20261105164902_optimize_project_management_overview.sql`. It replaces only the existing read function. It does not change tables, policies, grants, memberships or project assignments.

## Verification

- Reproduced the current function's `57014` statement timeout using the active Ahlsell organization owner's authenticated context and an eight-second limit.
- Executed the candidate query body read-only against the same production data and owner claims, without changing the deployed function: 4.54 ms execution, 3.088 ms planning. This is a query-level check, not a signed-in browser check or proof of deployment.
- Targeted local tests: 11 passed. The empty management overview with 10,000 legacy posts completed in 2 ms; authenticated dashboard counts remained correct.
- Full-schema tests verify department-scoped counts, open-help totals, exclusion of another organization, and zero visible post counts after requirement permissions are removed.
- `npm run build:production` passed: production dependency audit, TypeScript, ESLint, all 1,306 tests, and the Next.js production build. Log: `.tmp/scipx-management-fix-build-20261105.log` in the main checkout.

## Publication

Publication requires an explicit request under the repository's `AGENTS.md`. Apply the migration, verify the authenticated overview RPC, then publish the tested application version to show the navigation link. Keep Vercel automatic production domain assignment disabled. No demo teams have been created by this fix.
