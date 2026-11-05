# Organization navigation and project management overview

Status: published and verified on 5 November 2026, following the user's explicit request to publish both fixes.

## Published application

- Sites: https://www.scipx.ai and https://scipx.ai.
- Application commit: `adc2310e7741060a547ae55b80098dcd79c54253` on `codex/scipx-upgrades` (feature fix `80597a7` plus the Vercel build-output lint exclusion).
- Vercel project: `scripx`, team `vvs-search`.
- Production deployment: `dpl_64GUK5C2paswmdBpQrtxEhRGYzFT`.
- Deployment URL: https://scripx-qppvlqpqf-vvs-search.vercel.app.
- Both custom domains and the production target were verified against that deployment ID and commit.
- Automatic production domain assignment is `false`. Vercel promotion enabled it as a side effect; it was restored immediately after promotion.
- Previous application recovery point: `429249db711ff83ced027477456e4011154a0a07`, deployment `dpl_J9CW3p6TFya2qrZhYyuovrCirUdX`, recorded in `production-release-2026-11-02.md`.

## Problems and changes

- `/organization` exists, including team creation and membership management, but the organization navigation omitted its link. Add **Organisation** to the shared navigation, using the same permission requirements as the existing organization layout. Existing server permissions continue to control team creation.
- `project_management_overview` times out under the production eight-second limit for Ahlsell Norge even with no enabled project management projects. The planner can run expensive per-post aggregates before eliminating projects without management settings. Materialize the enabled, authorized project list before the lateral aggregate. Preserve all access predicates, function privileges, output fields and counting rules.
- Exclude Vercel's generated `.vercel/**` build output from ESLint, alongside the existing build-output exclusions. A generated adapter toolbar script otherwise fails the production build's zero-warning check; application source retains the same lint rules.

## Database change

Applied `supabase/migrations/20261105164902_optimize_project_management_overview.sql`. It replaces only the existing read function. It does not change tables, policies, grants, memberships or project assignments. Supabase initially recorded application-time version `20261105170324`; the exact verified history row was aligned to canonical version `20261105164902`.

## Verification

- Reproduced the current function's `57014` statement timeout using the active Ahlsell organization owner's authenticated context and an eight-second limit.
- Executed the candidate query body read-only against the same production data and owner claims, without changing the deployed function: 4.54 ms execution, 3.088 ms planning. This is a query-level check, not a signed-in browser check or proof of deployment.
- Targeted local tests: 11 passed. The empty management overview with 10,000 legacy posts completed in 2 ms; authenticated dashboard counts remained correct.
- Full-schema tests verify department-scoped counts, open-help totals, exclusion of another organization, and zero visible post counts after requirement permissions are removed.
- `npm run build:production` passed: production dependency audit, TypeScript, ESLint, all 1,306 tests, and the Next.js production build. Log: `.tmp/scipx-management-fix-build-20261105.log` in the main checkout.
- The added Vercel build-output exclusion also passed the local zero-warning lint check.
- Final Vercel production build passed the dependency audit (zero vulnerabilities), TypeScript, ESLint, all 1,306 tests and Next.js compilation. Log: `.tmp/scipx-management-production-build-final-20261105.log` in the main checkout.
- The deployed overview RPC completed in 9.78 ms under the Ahlsell owner's authenticated database context and unchanged eight-second timeout. Authenticated execution remains allowed; anonymous execution remains denied.
- Signed-in browser verification: project management loads normally for Scipx Customer Marcus and Ahlsell Norge. After promotion, Ahlsell's new **Organisation** menu link, team form and **Prosjektstyring** overview were verified in the live application. Ahlsell has no enabled project management projects yet, so the overview displays its expected setup guidance instead of the error.
- The organization page shows the three demo users. The user created the Sprinkel team and added its matching user during publication; this release did not create or change team memberships or chapter assignments.

## Publication

The authorized migration and manual production promotion are complete. Keep Vercel automatic production domain assignment disabled. Any future publication still requires an explicit request under the repository's `AGENTS.md`.
