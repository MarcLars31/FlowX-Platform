# Excel material import production release — 13 November 2026

The user explicitly requested publishing the new Excel function live in ScipX. The existing Vercel project was used, with manual promotion. No database migrations, production data mutations or environment-variable changes were performed.

## Published application

- Production branch: `Frontend-`.
- Live application commit: `9069ff83f86d5ed67be95601cd6355db82035d38`.
- Matching development application commit: `661d91c6120fefe4a113664d924089ce7c33183f` on `codex/scipx-upgrades`. The `apps/web` and `supabase` trees were confirmed identical to the release.
- Vercel team/project: `vvs-search` / `scripx`.
- Deployment: `dpl_A91RiRqi4dZ1965XfBDfucH1XpLG`.
- Deployment URL: <https://scripx-oiytssw34-vvs-search.vercel.app>.
- Live feature: <https://www.scipx.ai/material-import>.
- Build completed at 19:09 CET; manually promoted at approximately 19:10 CET on 13 November 2026. Vercel subsequently showed **Production / Current**, with `www.scipx.ai` assigned to this deployment.
- Automatic custom production domain assignment was verified **Disabled** before the push and after promotion.

The release adds **Excel till NRF** to organization navigation. Users can read an `.xlsx` material list, search the public Ahlsell Norway catalogue, review verified article candidates and download a new workbook with separate proposed and selected article columns. Review state remains in the browser tab; no project records are created. See [feature documentation](excel-material-import.md).

## Verification

- Local release checks passed TypeScript, zero-warning ESLint, 1,369 standard tests and 14 isolated timing/database tests: **1,383 tests passed**.
- Local production build passed. Production dependency audit reported **0 vulnerabilities**.
- Vercel ran `build:production`, including the audit, full release checks and production build; deployment finished **Ready** in 5 minutes 52 seconds. Existing middleware/unpdf warnings did not block the build.
- Local HTTP checks verified authentication, invalid and oversized input, and public Ahlsell article matching against an isolated local backend. Exact article 5002206 and fitting 1954193 were verified; conflicting dimensions were blocked. No supplier matching requests were issued against production during release QA.
- Authenticated live browser verification showed the new navigation and page. The local fixture workbook loaded **247 rows**, with **242 searchable rows**, **3 zero-quantity rows** and **2 invalid rows**. The error filter correctly identified source rows 127 and 128 with missing units.
- Browser download succeeded. The downloaded workbook was reopened with ExcelJS and contained **247 material rows**, original source fields, separate selected/proposed article columns and review/error fields. No products were automatically selected. Import, filtering and export ran in the browser without production database changes.
- The earlier local browser file-picker automation limitation was resolved by verifying the same client-side flow in the published application. Candidate matching was validated through the isolated local API and automated tests; a complete interactive candidate-selection flow was not exercised against production.
- No browser console errors were recorded for the live import/export check.
- Anonymous live checks: apex redirects to `www` (308), login loads (200), dashboard and material import redirect to login (307), matching API and projects API reject anonymous access (401), local-only page remains unavailable (404).

Local verification artifacts in the primary checkout: `.tmp/excel-material-release-tests.log`, `.tmp/excel-material-build.log`, `.tmp/excel-material-live-smoke.json`, `.tmp/excel-material-live.png`. The client-generated test export is `C:/Users/marcu/Downloads/excel-material-example-NRF.xlsx`.

## Recovery and protected work

The previous live deployment is the recovery point:

- Commit: `95bc076f9875a175155fb6a14ee0b659ebe86797`.
- Deployment: `dpl_4iuCbt42WhS8MbtG1fNf4og4tFUD`.
- URL: <https://scripx-nmxu1b0j1-vvs-search.vercel.app>.
- Earlier verification: [13 November application release](production-release-2026-11-13.md).

Production was advanced with a normal fast-forward push. The protected remote `codex/demo-2026-11-09` remained at `1a7e91eba4207d27edefd0c316237e09d515deb8`. Existing user work in the primary checkout was preserved. Future publication still requires an explicit user request.
