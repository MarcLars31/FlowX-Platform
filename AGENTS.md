# ScipX development and controlled publication

The user explicitly authorized updating live with the latest code in Vercel on 13 November 2026. The latest application release, verification and recovery point are recorded in [the release record](docs/production-release-2026-11-13.md). The separately authorized 11 November production migrations and their version mapping remain recorded in [the earlier release](docs/production-release-2026-11-11.md). The earlier demonstration freeze is historical; its branch and deployment remain recovery points.

- Continue development on `codex/scipx-upgrades`. Preserve the protected `codex/demo-2026-11-09` branch and existing user work.
- Future deployments, promotions, production-domain changes, automatic promotion, production migrations or production environment changes require an explicit user request covering that publication. Do not infer authorization from the calendar or an ordinary development task.
- Development and tests must use local fixtures or an isolated environment and must not mutate production data.
- Automatic production domain assignment is disabled. Keep publication manual unless the user explicitly requests otherwise.
- Consult the release record for the actual live commit and deployment; the head of `Frontend-` is not evidence of what is live. The database-only timeout fix from 6 November remains documented in [the hotfix record](docs/overview-timeout-fix-2026-11-06.md).
