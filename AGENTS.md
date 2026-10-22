# ScipX development and production freeze

The user froze the current live version on 22 October 2026 for a demonstration on 9 November 2026.

- Continue upgrades on `codex/scipx-upgrades`. Do not push development changes to `Frontend-` or `codex/demo-2026-11-09`.
- Do not deploy, promote, reassign production domains, enable automatic production promotion, or unlock the demonstration branch without a new explicit user request to publish or unfreeze. The date alone does not authorize publication.
- Development and tests must not mutate production data, run production migrations, or change production environment variables. Use local fixtures or an isolated test environment.
- Preserve the locked live version and existing user work. See [the freeze record](docs/production-freeze-2026-11-09.md) for the exact commit and deployment.
