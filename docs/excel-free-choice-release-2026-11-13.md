# Unrestricted Excel product choice — production release, 13 November 2026

The user explicitly requested publishing the unrestricted-choice change live in ScipX. This release removes technical-conflict, unverified-identity and acknowledgement-checkbox gates from Excel product selection. Any displayed search result can be chosen; comparison information remains visible and is retained in the exported workbook. Product choices are labelled as chosen, without claiming that they were verified. No product is chosen automatically.

## Published application

- Live commit on `Frontend-`: `657dba7284ca8fc6e5d6b45e7e06939f5210bad4`.
- Matching development application commit: `6cb71078ce9b4db4591be37120c1dbb6e8d2ed9e` on `codex/scipx-upgrades`. The `apps/web` and `supabase` trees were confirmed identical.
- Vercel team/project: `vvs-search` / `scripx`.
- Deployment: `dpl_AXBmoy6mhWR5xfLF2juo3LfxCDZm`.
- URL: <https://scripx-l88crfjwz-vvs-search.vercel.app>.
- Feature: <https://www.scipx.ai/material-import>.
- Build finished at 19:37:58 CET, taking 5 minutes 30 seconds. Manual promotion completed at approximately 19:38 CET.
- Vercel subsequently showed **Production / Current**, with `www.scipx.ai` assigned to this deployment.
- Automatic custom production domain assignment remained **Disabled**, verified before the push and after promotion.

## Verification

- All 28 focused Excel/client/rule tests, TypeScript and zero-warning ESLint passed locally before publication.
- UI regression covers all four combinations of verified/unverified identity and technical conflict/no conflict: each product can be chosen without an acknowledgement checkbox. Busy-state disabling remains in place while a request or export runs.
- Workbook regression verifies that any chosen candidate is exported with its original caveats, without substitution by the recommendation or changes to source dimensions/quantity.
- Vercel's full production build passed its dependency audit, TypeScript, ESLint, **1,371 standard tests plus 14 isolated timing/database tests (1,385 total)**, and Next.js production compilation.
- Authenticated live browser verification showed the updated **Användaren väljer fritt** Excel rule, including selection of conflicting/unverified candidates and removal of the mandatory checkbox. The Excel page loaded after publication.
- Anonymous checks passed: apex redirect 308, login 200, dashboard and material-import login redirects 307, matching/projects API denial 401, local-only page 404.
- No database migrations, environment-variable changes or production data mutations were performed. Matching/choice regressions used local fixtures; no production supplier search or saved product choice was created during QA.

Verification artifacts in the primary checkout: `.tmp/excel-unlocked-live-smoke.json` and `.tmp/excel-unlocked-live.png`.

## Recovery

The prior live application remains the recovery point:

- Commit: `9069ff83f86d5ed67be95601cd6355db82035d38`.
- Deployment: `dpl_A91RiRqi4dZ1965XfBDfucH1XpLG`.
- URL: <https://scripx-oiytssw34-vvs-search.vercel.app>.
- Details: [initial Excel release](excel-material-release-2026-11-13.md).

The production branch was advanced by normal fast-forward push. The remote protected `codex/demo-2026-11-09` branch remained at `1a7e91eba4207d27edefd0c316237e09d515deb8`. Existing primary-checkout work was preserved. Future publication continues to require an explicit user request.
