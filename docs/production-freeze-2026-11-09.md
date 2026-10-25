# ScipX demonstration freeze — 9 November 2026

Requested by the user on 22 October 2026. The live application is frozen for the demonstration; development continues separately. There is no scheduled publication or automatic unfreeze.

## Frozen live version

- Site: https://www.scipx.ai (also https://scipx.ai)
- GitHub branch: `codex/demo-2026-11-09`
- Exact commit: `1a7e91eba4207d27edefd0c316237e09d515deb8`
- Vercel project: `prj_5IWKwx5Vzink70RkhHqdo33gAbv2` (`scripx`, team `vvs-search`)
- Vercel deployment: `dpl_JCvgsjDyQokNsebKH8bW9GNi43aW`
- Deployment URL: https://scripx-ij4jzest8-vvs-search.vercel.app

The demonstration branch is read-only through GitHub branch protection. Protection applies to administrators; force pushes and deletion are disabled.

Vercel's `autoAssignCustomDomains` is `false`. New builds must not replace the live domains automatically. The configured production Git branch remains `Frontend-`; its head is not the frozen live revision. Do not use that branch head as evidence of what is live, and do not push upgrades to it during the freeze.

## Continued development

Use `codex/scipx-upgrades`, starting from `6fdb1f6776c1132625b1198a43575f3006e6fc90`. This includes the tested change that opens all posts directly from a chapter, without the subchapter navigation step. That change is not active on the frozen live site.

The clean working copy for this work is `C:/Users/marcu/.codex/worktrees/post-quantity-release/FlowX-Platform`. Its active branch is `codex/scipx-upgrades`. The separate main checkout contains unrelated work and must not be reset or overwritten.

Commit and push upgrades only to the development branch. Use local fixtures or an isolated test environment. A code freeze does not snapshot or make the production database read-only: normal user actions can still change projects. Development must not migrate or modify that database.

## Publication after the freeze

Wait for a new explicit user request to publish or unfreeze, including after 9 November. Before publication, verify the intended revision, complete release checks, and review any data or configuration changes. Keep the frozen branch unchanged as a recovery point. Do not automatically enable domain assignment or promote a deployment as part of routine development.

## Local design workspace — 25 October 2026

Local design and PDF testing now use the separate working copy
`C:/Users/marcu/.codex/worktrees/scipx-upgrades/FlowX-Platform`, checked out on
`codex/scipx-upgrades`. Use this path for continued development; the earlier
`post-quantity-release` path above records the working copy at the time of the freeze.
Run `npm.cmd run dev:local` from `apps/web` and open http://127.0.0.1:3100.
The full application uses a separate persistent local PostgreSQL database and local customer/admin test accounts. The former PDF-only mode remains available with `npm.cmd run dev:pdf`. See [local development instructions](local-design.md).