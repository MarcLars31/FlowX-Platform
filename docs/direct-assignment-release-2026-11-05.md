# Direct chapter and post assignment

User authorization: “implementera det i live”, followed by explicit approval to make Sprinkel an editor in Framo Fusa – Entreprise 2.

Status: published and verified on 5 November 2026.

## Application

- Branch: `codex/scipx-upgrades`.
- Release commit: `b6d1b5d75963d154ac14da44981d8b7b03b29656` (feature commit `84183e1` plus the imported-hierarchy optimization).
- Vercel project/team: `scripx` / `vvs-search`.
- Deployment: `dpl_6DhNspHJnAHmJCa3wA9yy7cLkSGp`, https://scripx-9r6uyl8kl-vvs-search.vercel.app.
- Previous application recovery point: `adc2310e7741060a547ae55b80098dcd79c54253`, deployment `dpl_64GUK5C2paswmdBpQrtxEhRGYzFT`.
- Domains: https://www.scipx.ai and https://scipx.ai. Keep automatic production domain assignment disabled.

## Behavior

Managers open **Fordel arbeidet** by default. A chapter or post can be assigned by selecting **Tildel** and a person. Chapters and posts can be selected together for one atomic assignment. Department setup is optional; eligible active organization users can be selected directly.

Posts inherit chapter/main-post responsibility unless they have their own assignment. Chapter reassignment preserves narrower overrides unless **Endre også poster med egen tildeling** is explicitly checked. A post can be explicitly unassigned or returned to inheritance. **Angre siste tildeling** restores the previous assignment only if no intervening assignment, deadline, settings or project-membership change has occurred. Revisions remain monotonic. Existing department assignment, deadlines, help conversations and completion remain available through **Oppfølging og frister**.

Existing inactive memberships and viewer roles are not automatically promoted. Direct assignees must have the organization permissions required to work on posts. Server-side scope resolution, read/write access and source-document restrictions remain enforced. The UI shows only measured product posts.

## Database

Applied and aligned migration history to the canonical CLI-created versions:

1. `20261105182041_direct_project_work_assignment.sql` (Supabase execution version `20261105190023`). Adds the direct-assignment marker, private undo history, guarded assignment/undo RPCs, scoped reads, optional department setup and overview optimization.
2. `20261105190441_optimize_direct_assignment_resolution.sql` (Supabase execution version `20261105190734`). Resolves each source parent and effective assignment once per project. Preserves cycle detection, ambiguous-parent review, nearest main-post precedence and source-chapter boundaries.

History alignment updated only the exact returned version/name/SQL-MD5 match. Final migration count: 85. Migration files remain immutable after application.

Public assignment/undo/read wrappers are SECURITY INVOKER, executable by authenticated users and denied to anonymous users. Privileged implementations are in `scipx_assignment_internal`; internal resolution/version/deadline helpers are not executable by authenticated or anonymous users. Undo history has RLS enabled and no client table grants or policies intentionally.

No project was enabled or assigned by these migrations. Do not drop the new columns/history to roll back the UI after users begin assigning work; retain the data and use a reviewed forward migration if necessary.

## Explicit account change

Sprinkel (`03626724-f3df-4774-83bb-a7bb81d50390`) was an active project viewer in Framo Fusa – Entreprise 2 (`a99f5337-8355-4375-9152-b78cfadd599c`). The user approved changing this account to editor in that project. Both canonical `role` and legacy `project_role` now equal `editor`; organization membership remains active `full_user`. The exact-row update used manager claims and explicit manager/member-management permission checks, and the normal audit trigger recorded the change. No broad table privileges were granted.

Read-only verification confirms selectable users: Cato Andersen, Elekto, Marcus Admin, Sprinkel and VVS. No actual chapter or post assignment was made during production verification.

## Validation

- Local `npm run build:production`: dependency audit with zero vulnerabilities, TypeScript, zero-warning ESLint, all **1,318 tests**, and Next.js production build passed.
- Vercel ran the same checks: **1,318 tests passed**, zero failed; production dependency audit reported zero vulnerabilities.
- Empty-database verification: 84 SQL migrations executed (one hosted scheduler migration intentionally excluded), 192 public tables and three idempotent seed files. The private undo table is additional.
- Full-schema tests cover direct and department workflows, real authenticated RLS, inherited/explicit/unassigned states, mixed bulk operations, atomic rollback, stale versions, guarded undo, deadlines without departments, inactive/viewer protection and cross-organization denial.
- The batch hierarchy is compared with the existing authoritative functions on cycles, missing parents, source warnings and nested assignments. A fixture with 1,124 imported rows verifies the production eight-second statement budget. Vercel measured the imported read at 2.48 seconds.
- Production Framo Fusa read under owner JWT claims and the unchanged eight-second timeout: **1,071.852 ms** for 1,124 raw source rows. An initial production read exposed repeated permission/hierarchy work; the second migration resolves that bottleneck.
- Browser checks against a separate local PGlite fixture used the real React board and database RPCs: chapter assignment, individual override, mixed selection and undo. Desktop and 360-pixel layouts were inspected; no horizontal overflow, keyboard search focus and Escape behavior verified.
- Supabase advisors: no added externally exposed definer-function or anonymous-function warnings. The new private history table adds one intentional RLS-without-policy informational finding; its two indexes are initially unused. Pre-existing security findings remain outside this release.
- Logs in the main checkout: `.tmp/scipx-direct-assignment-build-20261105.log`, `.tmp/scipx-direct-assignment-database-20261105.log`, `.tmp/scipx-direct-assignment-vercel-build-20261105.log`.

## Publication verification

- Manual promotion completed. Both custom-domain aliases and the project production target resolve to `dpl_6DhNspHJnAHmJCa3wA9yy7cLkSGp` at release commit `b6d1b5d75963d154ac14da44981d8b7b03b29656`.
- `autoAssignCustomDomains` was restored to `false` immediately after promotion and verified.
- Signed-in live verification in Ahlsell Norge: **Fordel arbeidet** loads Framo Fusa with 778 actionable measured/RS posts from 1,124 raw source rows. Searching “sprinkler” finds **33 Brannslokking**; its person picker shows Elekto, VVS and an enabled Sprinkel option, alongside the other eligible organization users.
- The picker was inspected without saving a production assignment. Screenshot: `.tmp/scipx-direct-assignment-live-20261105.jpg` in the main checkout.
- A duplicate preview for the identical application commit was canceled; the tested production deployment was retained. Future publication requires a new explicit user request under `AGENTS.md`.
