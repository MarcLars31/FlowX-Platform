# ScipX production release — 2 November 2026

The user explicitly authorized publishing `codex/scipx-upgrades` on 2 November 2026, superseding the previous live freeze for this release. Publication was verified at approximately 19:00 Europe/Stockholm.

## Published application

- Sites: https://www.scipx.ai and https://scipx.ai.
- Application commit: `b669f02b3995f52a14d6ca74d2368f43fb156729` on `codex/scipx-upgrades`.
- Vercel project: `scripx`, team `vvs-search`.
- Production deployment: `dpl_F35eKF9Cn8v84CsvC4yMjCodYD1R`.
- Deployment URL: https://scripx-plgm5v2nu-vvs-search.vercel.app.
- Both custom domains and the project's production target were verified against that deployment ID.
- Automatic production domain assignment remains disabled. Vercel promote enabled it as a side effect; it was explicitly restored to `false` after publication. The configured production Git branch remains `Frontend-`.

The original failed deployment stopped at the production dependency audit. This release pins ExcelJS's transitive minimatch dependency to 11.0.1 to resolve [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The existing Excel export and workbook regression tests passed with this override.

## Database rollout

Applied and verified the following migrations in order:

1. `20261025120000_department_project_management.sql`
2. `20261025160000_source_post_hierarchy.sql`
3. `20261027160000_project_chapter_organization.sql`
4. `20261027200000_individual_chapter_placement.sql`

Supabase initially assigned application-time versions. Their four history rows were aligned to the canonical versions above after successful application. The production history now contains all 81 repository migrations.

All nine new tables have RLS enabled. Chapter-edit RPCs permit authenticated callers and reject anonymous callers; the email worker's claim RPC is restricted to the service role. Existing project, requirement, document-page and work-package counts remained unchanged, and existing work assignments retained their assignees. Department project management remains opt-in per project; no existing project was automatically enrolled.

No production seed, reimport, customer-data reset or real notification test was performed. The existing scheduler remains active, and its subsequent cron executions succeeded.

## Verification

- `npm run build:production`: passed locally and in the Vercel production build.
- Production dependency audit: zero vulnerabilities.
- TypeScript and ESLint: passed.
- Release suite: 1,303 passed, zero failed or skipped.
- Empty-database verification: 80 SQL migrations and three idempotent seeds passed. The Supabase-specific scheduler migration is deliberately excluded from the local SQL engine; the live scheduler was checked separately.
- Supabase REST schema checks returned HTTP 200 for the new tables and columns without fetching customer rows.
- Before promotion and again on the live domain: home page 200, unauthenticated project APIs 401, local-design page/upload endpoint 404, unauthenticated background-worker POST 401. The protected dashboard redirected to sign-in before promotion.
- The temporary Vercel CLI test-access token was revoked after the pre-promotion checks.

The live HTTP checks did not sign in as a customer or submit a real PDF. Authenticated workflows, PDF processing, saved chapter organization, role isolation and Excel output were covered by the local regression suites.

## Recovery and operational limits

The previous deployment `dpl_JCvgsjDyQokNsebKH8bW9GNi43aW`, commit `1a7e91eba4207d27edefd0c316237e09d515deb8`, and protected branch `codex/demo-2026-11-09` remain available as recovery points. See the [historical freeze record](production-freeze-2026-11-09.md). A completed managed database backup from 2 November 2026 at 01:10 UTC was verified; point-in-time recovery was not enabled. No new full database or Storage-object backup was created during this release.

For an application rollback, promote the previous deployment and restore manual domain assignment afterward. Retain the installed schema and all customer data. Assess department-enabled projects before reverting to the older UI; do not drop the new tables as a routine rollback step.

Project-management email delivery remains disabled because Resend and the `SCIPX_WORK_EMAIL_*` settings have not been configured. In-app notifications work independently. See [project-management configuration](scipx-project-management.md).

The database advisor retained its pre-existing security-definer view and Auth warnings. The added findings identify the deliberately service-only email outbox and the authenticated SECURITY DEFINER workflow RPCs; role restrictions were checked. This release is not a claim that every historical database advisory has been resolved.
