# ScipX production release — 11 November 2026

The user requested the complete test version on the live branch, explicitly
confirmed publication on scipx.ai, and separately approved all three required
production migrations.

Status: published and verified on 11 November 2026, approximately 20:52 CET.

## Application

- Git branch: `Frontend-`.
- Release commit: `e949c6d6a894005f4b2722a28c9b484271ed35ae`.
- Its application tree is identical to test commit
  `9a345be1910ee040034d7d821d1c5e796960948e`; the merge also preserves the
  previous `Frontend-` commits.
- Vercel project/team: `scripx` / `vvs-search`.
- Deployment: `dpl_4wQ87VDBxvwRVqQbW7NpgirQE9zk`,
  https://scripx-ppc4pubsc-vvs-search.vercel.app.
- Live domains: https://scipx.ai and https://www.scipx.ai.
- Application recovery point: commit
  `a0bd06ff4600857ef4cacbebac471ce544b1eb64`, deployment
  `dpl_CZrsdggqfsBMjMzxEyHSqMFfqMxU`,
  https://scripx-11p06zgjc-vvs-search.vercel.app.

The complete release includes unified chapter/person/department assignment,
optional work review and roles, PDF/Excel reports, search criteria and product
evidence, and the latest post-text placement. Full PDF post text appears only
inside an opened post, above its underposts. Chapter post lists remain compact.

## Production database

Applied the following reviewed repository migrations to FlowX
(`myzegtifgbvjhdlcpebi`) in order:

| Repository version | Name | Recorded Supabase version | SQL MD5 |
| --- | --- | --- | --- |
| `20261109191532` | `unified_project_assignment` | `20261111194545` | `824864af411c1fcc89b1cb191fb28b4e` |
| `20261109200024` | `project_roles_and_review` | `20261111194556` | `87a35144c8b5d93a053036a35cdde15a` |
| `20261110045833` | `project_management_reports` | `20261111194603` | `dea8093121f9474e998370c5dc57aed4` |

Supabase assigned execution-time versions. The stored SQL hashes match the
repository files exactly. Automatic approval review rejected a separate attempt
to align these history identifiers, so the history was left intact. The scripts
are already installed: do not reapply them because their filename versions differ.
Reconcile this mapping before a future CLI migration push; changing production
migration history requires explicit approval.

Verification found 103 projects, 104,679 requirement rows and six assignments
before and after migration. No task states or review events existed, and no
project has optional review enabled. The migration restricts the engineer
role's administrative permissions as described in the roles specification;
it does not reassign customer work or change product selections.

The new public assignment, review and report RPCs are SECURITY INVOKER,
executable by authenticated users and denied to anonymous users. The review
history table has RLS enabled. The security advisor added no findings and
removed three exposed SECURITY DEFINER warnings; existing unrelated findings
remain outside this release.

## Verification

- Local `npm run build:production` passed: zero production dependency
  vulnerabilities, TypeScript, zero-warning ESLint, 1,353 tests and Next.js build.
- Tests include the full migration chain, authenticated scope isolation,
  assignment/review workflows, report exports and post-text placement.
- Read-only production report verification under an active organization owner's
  authenticated claims returned 670 posts within the unchanged eight-second
  statement limit. It did not create, assign, review or export customer work.
- The old release's verification project was deleted; its report request was
  correctly denied. The successful check used an existing active project.
- Automatic production-domain assignment was verified disabled before deployment.
- Vercel completed the production build and marked the release Ready. Manual
  promotion was verified in Production Deployment against the release commit,
  deployment URL and live domain. Automatic domain assignment remains disabled.
- Live HTTP checks: the apex domain redirects to www, the home page returns
  200, a logged-out dashboard redirects to sign-in, `/api/projects` returns
  401, and the local development page returns 404.
- Signed-in browser verification: the live dashboard and existing project's
  chapter overview load successfully. A chapter list omits expanded PDF post
  text; opening a child post displays its full main-post text above the seven
  underposts. Product suggestions expose the search-criteria and evidence controls.

## Recovery

For an application rollback, promote the recorded previous deployment and
preserve manual domain assignment. Keep the installed schema and customer data.
After review is enabled or used, assess compatibility before reverting the UI;
do not drop review history or reset assignments as a routine rollback.
