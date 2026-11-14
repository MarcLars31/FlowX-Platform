# ScipX production release — 2 November 2026

This is a historical release record. The current live application and verification are recorded in [the 5 November release](project-management-fix-2026-11-05.md).

The user explicitly authorized publishing `codex/scipx-upgrades` on 2 November 2026, superseding the previous live freeze for this release. Initial publication was verified at approximately 19:00 Europe/Stockholm. The latest product-card update was verified at 20:01 Europe/Stockholm.

## Published application

- Sites: https://www.scipx.ai and https://scipx.ai.
- Application commit: `429249db711ff83ced027477456e4011154a0a07` on `codex/scipx-upgrades`.
- Vercel project: `scripx`, team `vvs-search`.
- Production deployment: `dpl_J9CW3p6TFya2qrZhYyuovrCirUdX`.
- Deployment URL: https://scripx-gifctv3cb-vvs-search.vercel.app.
- Both custom domains and the project's production target were verified against that deployment ID.
- Automatic production domain assignment remains disabled. Vercel promote enabled it as a side effect; it was explicitly restored to `false` after publication. The configured production Git branch remains `Frontend-`.

The original failed deployment stopped at the production dependency audit. This release pins ExcelJS's transitive minimatch dependency to 11.0.1 to resolve [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The existing Excel export and workbook regression tests passed with this override.

## Database rollout

Applied and verified the following migrations in order:

1. `20261025120000_department_project_management.sql`
2. `20261025160000_source_post_hierarchy.sql`
3. `20261027160000_project_chapter_organization.sql`
4. `20261027200000_individual_chapter_placement.sql`

Supabase initially assigned application-time versions. Their four history rows were aligned to the canonical versions above after successful application. The initial rollout brought production history to 81 migrations; the dashboard correction recorded below adds one further migration.

All nine new tables have RLS enabled. Chapter-edit RPCs permit authenticated callers and reject anonymous callers; the email worker's claim RPC is restricted to the service role. Existing project, requirement, document-page and work-package counts remained unchanged, and existing work assignments retained their assignees. Department project management remains opt-in per project; no existing project was automatically enrolled.

No production seed, reimport, customer-data reset or real notification test was performed. The existing scheduler remains active, and its subsequent cron executions succeeded.

## Verification

- `npm run build:production`: passed locally and in the Vercel production build.
- Production dependency audit: zero vulnerabilities.
- TypeScript and ESLint: passed.
- Release suite: 1,306 passed, zero failed or skipped (latest product-card release).
- Empty-database verification: 81 SQL migrations and three idempotent seeds passed. The Supabase-specific scheduler migration is deliberately excluded from the local SQL engine; the live scheduler was checked separately.
- Supabase REST schema checks returned HTTP 200 for the new tables and columns without fetching customer rows.
- Before promotion and again on the live domain: home page 200, unauthenticated project APIs 401, local-design page/upload endpoint 404, unauthenticated background-worker POST 401. The protected dashboard redirected to sign-in before promotion.
- The temporary Vercel CLI test-access token was revoked after the pre-promotion checks.

The live HTTP checks did not sign in as a customer or submit a real PDF. Authenticated workflows, PDF processing, saved chapter organization, role isolation and Excel output were covered by the local regression suites.

## Recovery and operational limits

The pre-release demonstration deployment `dpl_JCvgsjDyQokNsebKH8bW9GNi43aW`, commit `1a7e91eba4207d27edefd0c316237e09d515deb8`, and protected branch `codex/demo-2026-11-09` remain available as recovery points. See the [historical freeze record](production-freeze-2026-11-09.md). A completed managed database backup from 2 November 2026 at 01:10 UTC was verified; point-in-time recovery was not enabled. No new full database or Storage-object backup was created during this release.

For an application rollback, promote the previous deployment and restore manual domain assignment afterward. Retain the installed schema and all customer data. Assess department-enabled projects before reverting to the older UI; do not drop the new tables as a routine rollback step.

Project-management email delivery remains disabled because Resend and the `SCIPX_WORK_EMAIL_*` settings have not been configured. In-app notifications work independently. See [project-management configuration](scipx-project-management.md).

The database advisor retained its pre-existing security-definer view and Auth warnings. The added findings identify the deliberately service-only email outbox and the authenticated SECURITY DEFINER workflow RPCs; role restrictions were checked. This release is not a claim that every historical database advisory has been resolved.

## Dashboard timeout correction

After publication, authenticated `/dashboard` requests logged PostgreSQL error `57014` (statement timeout). The new restrictive `pm_requirement_scope` policy called `pm_can_read(id)` for every requirement, repeating project authorization for legacy projects. The pre-publication unauthenticated HTTP check did not exercise this query.

Prepared migration `20261102181154_optimize_legacy_requirement_scope.sql` preserves explicit `can_access_project` authorization and the managed-project department check. It batches the legacy authorization through an uncorrelated project subquery. It changes one SELECT policy, with no grants, data updates, role timeout changes or application-code changes.

Validation: all 12 relevant database/RLS tests passed; a 10,000-row authenticated summary returned the expected counts and excluded another organization and a disabled member. A same-fixture comparison returned identical results in 856 ms before and 172 ms after. TypeScript and ESLint passed. Empty-database verification passed 81 migrations (the scheduler remains excluded) and three idempotent seeds.

The user explicitly approved this exact policy correction after the automatic approval review requested confirmation. Applied successfully at 18:36 UTC (19:36 Europe/Stockholm). Supabase initially recorded version `20261102183648`; that single history row was aligned to the repository version `20261102181154`, bringing production history to 82 migrations. The application deployment did not need to change because the correction is entirely in PostgreSQL.

The same read-only authenticated production dashboard benchmark returned three project summaries in 578 ms after the correction, compared with 6,341 ms before. RLS remains enabled, the existing permissive project/permission policy remains present, and the authenticated statement timeout remains 8 seconds. A full-user read with no accessible open projects returned no summaries, as required. The security advisor reported the same finding categories as before. Vercel returned no dashboard error records in the ten-minute log window ending 18:38 UTC; this is a log check, not proof of a fresh customer browser session.


## Product-card technical information publication

The user explicitly requested this publication after reviewing the completed change. At 19:01 UTC (20:01 Europe/Stockholm), both live domains were verified on application commit `429249db711ff83ced027477456e4011154a0a07` and deployment `dpl_J9CW3p6TFya2qrZhYyuovrCirUdX`. The immediately preceding application is `b669f02b3995f52a14d6ca74d2368f43fb156729`, deployment `dpl_F35eKF9Cn8v84CsvC4yMjCodYD1R`, available for application rollback.

Product cards now display the selected post's saved technical source text under “Teknisk informasjon fra posten”, alongside its quantity and original PDF link. Saved technical attributes provide the fallback when source prose is unavailable. Parent and neighboring posts remain separate from the selected post's technical text. No database migration or customer-data update was required for this UI change.

The production build passed both locally and in Vercel: 1,306 tests, TypeScript, ESLint and a clean production dependency audit. Rendering tests cover all technical clauses from the reported sprinkler example, source attribution, fallback attributes and exclusion of neighboring-post text. Live HTTP checks returned home page 200, Sprsok 200 with 413 variants, protected dashboard 307 to sign-in, and protected APIs 401. They did not use a customer login. Automatic domain assignment was restored to false after the manual promotion and verified.
