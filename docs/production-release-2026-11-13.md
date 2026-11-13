# ScipX production release — 13 November 2026

User authorization: “uppdatera live med nya koden i vercel”.

Status: published and verified on 13 November 2026, approximately 16:36 CET.

## Application

- Production branch: `Frontend-`.
- Release commit: `95bc076f9875a175155fb6a14ee0b659ebe86797`.
- Matching development application tree: `480f130124875f2569776644e92dc050b8baf584` on `codex/scipx-upgrades`.
- Vercel project/team: `scripx` / `vvs-search`.
- Deployment: `dpl_4iuCbt42WhS8MbtG1fNf4og4tFUD`, https://scripx-nmxu1b0j1-vvs-search.vercel.app.
- Previous live recovery point verified in Vercel before publication: commit `2065c34c5ea371b6059ae0a94fd0f665cafcb420`, deployment `dpl_7Qm4YkYfR5UKmPfd1NwiC9cawr7Q`, https://scripx-f9xmr8eep-vvs-search.vercel.app.
- Live domains: https://www.scipx.ai and https://scipx.ai.

The release includes the latest nominal sprinkler K-factor matching, technical
evidence handling and evaluator-version cache invalidation from `a01c116`.
It retains the selected-post requirement placement already running in production.

## Release build repair

The previous attempt to build `a01c116` failed its managed-project read timing
assertion: 8,223 ms against the unchanged eight-second budget while four test
processes competed for the build worker. The same test passed in isolation
locally at 1,279 ms.

The release runner now runs its three database timing test files sequentially,
after all other tests. All assertions, access-control checks, fixtures and
production timing thresholds remain intact. No tests were disabled or retried
automatically, and no application query or schema was changed by this repair.

## Validation

- Local `npm run build:production` passed: zero production dependency
  vulnerabilities, TypeScript, zero-warning ESLint, all 1,361 tests
  (1,347 concurrent plus 14 in the timing phase), and Next.js production build.
- The final local managed-worker reads took 1,391 ms combined. The 10,000-row
  managed summary took 206 ms and raw reads 65 ms.
- Vercel's production build and both test phases passed with unchanged thresholds. The formerly
  failing worker reads completed in 2,584 ms; the 10,000-row managed summary took
  558 ms and raw reads 149 ms.
- The release and development application/schema trees were verified identical.
- Automatic custom production-domain assignment was verified disabled before
  pushing the release. Publication remains manual.
- Local log: `.tmp/vercel-release-20261113-build.log` in the main checkout.

No production migrations, environment variables, customer rows, memberships,
assignments or saved product selections were changed. The protected
`codex/demo-2026-11-09` branch remains at `9f7ab2cc3d333abcf2d764d23bbdab5270e227a7`.
The 11 November migration mapping in `docs/production-release-2026-11-11.md`
continues to apply.

## Publication verification

- Vercel marked the production build Ready after 6 minutes 6 seconds. Its custom
  domain assignment was skipped until manual promotion.
- Manual promotion completed. Vercel's Production Deployment overview shows
  `95bc076`, deployment `4iuCbt42WhS8MbtG1fNf4og4tFUD`, and `www.scipx.ai`.
- Auto-Assign Custom Production Domains remains unchecked after promotion.
- HTTP checks: `scipx.ai` redirects to `www.scipx.ai` (308), the login page returns
  200, a logged-out dashboard redirects to the login page `/` (307),
  `/api/projects` returns 401, and `/local` returns 404.
- Signed-in live verification confirms the updated K-factor rule and the explicit
  K80/K80.6 and K115/K115.2/K115.5 groups on `/regler`. This verifies the new
  application content is served through the live custom domain.
- Evidence in the main checkout: `.tmp/vercel-release-20261113-smoke.json` and
  `.tmp/vercel-release-20261113-live.png`.

For an application rollback, manually promote the recorded `2065c34` deployment.
Preserve manual domain assignment and the existing production schema/data.
