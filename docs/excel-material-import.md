# Excel material lists and Ahlsell article matching

Feature developed on `codex/scipx-upgrades`. Publication is tracked separately in the release record; no database migration is required.

Open **Excel till NRF** in the organization navigation (`/material-import`). The page and its matching API require `project.product_suggestion.view` through the existing organization authorization. This is a standalone material-list workflow: it does not create project requirements or change saved project product choices.

## Workflow

1. Select an `.xlsx` workbook, at most 5 MB and 1,000 material rows. The browser reads the file with the existing ExcelJS dependency. It scans every worksheet for a header containing description, unit and quantity; Norwegian, Swedish and English header aliases are supported. Titles, leading blank rows, repeated headers and multiple sheets are supported.
2. Choose **Sök alla och välj högst** to search every valid row and automatically select the highest-scored result, including a fresh search for rows with previous results or choices. **Sök återstående** and individual row searches give suggestions for manual selection. Each request sends one material description, dimensions, unit, category and reviewer additions to the authenticated API. The supplier receives product search terms, not the workbook or quantities. Search uses the existing public Ahlsell Norway catalogue, variant expansion, technical evaluation, shared supplier budget and evidence cache.
3. Choose freely among search results, including articles with technical conflicts or an unverified page identity. No acknowledgement checkbox is required. The comparison details remain visible as information and accompany the chosen product in the export. Search by another description or exact article number to find other products. Automatic selection occurs only when explicitly starting or continuing the all-row automatic mode; its choices remain freely editable.
4. Download a new Excel workbook. Original material fields, sheet names and row numbers accompany separate **proposed** and **selected** article columns, product URLs, status, checks and errors. The original workbook is never modified.

## Data and failure handling

- List and review state live in the current browser tab. Download before leaving the page; this release has no durable import session or project persistence.
- Quantity zero is preserved and does not initiate a supplier search. Missing/invalid quantities, units, descriptions and Excel errors stay visible and are exported; fix them in the source workbook before searching.
- Formula cells use saved Excel results. Missing cached results are flagged. ScipX does not recalculate formulas.
- A bare dimension is not assumed to be DN. The reviewer can specify nominal diameter or outside diameter. Fitting tuples retain all ports; matching numeric tuples still require port-order and system checks.
- Conflicting documented diameters and fitting tuples are shown as information without blocking selection. Missing material grades, bend angles, press systems and operating points remain review items.
- One row is searched at a time. Rate-limit responses respect the entire `Retry-After` and resume automatically. Transient failures move to a later retry pass, with increasing recovery pauses. Cancellation restores the current row's latest state; unvisited rows retain their previous state. Automatic mode retains the exact remaining row IDs for continuation, including previously selected rows. Authentication/permission failures stop for user action; invalid row responses remain errors without automatic repeat requests.
- Product numbers are labelled **NRF / article number** because a supplier article identifier is not always a registered NRF number.
- The parser rejects unsupported, corrupt, encrypted and oversized ZIP containers. File parsing and workbook generation run in the browser; no server-side workbook upload endpoint is added.

## Automatic recovery after errors and long pauses — development, 13 November 2026

The user requested continued searching without having to click **Fortsätt** after search errors or longer pauses. This follow-up is implemented on `codex/scipx-upgrades` and **has not been published**. The current live application remains the [scores and automatic-choice release](excel-auto-selection-release-2026-11-13.md).

- HTTP 429 and HTTP 503 with `Retry-After` now wait for the full requested delay, including waits longer than five minutes, and retry automatically. Persistent throttling increases the minimum pause without shortening the supplier's requested wait. Long waits are split internally when needed to avoid browser timer overflow. All waits remain cancellable and display a countdown.
- Transient network/server/invalid-response failures retain the bounded quick retries and 65-second request/body deadline. A failed row does not prevent later rows from being processed. The queue then retries only unsuccessful transient rows; completed results and their automatic choices are not repeated.
- Three consecutive transient failures, and each new pass over failed rows, trigger a recovery delay increasing from 30 seconds to at most five minutes. Recovery continues while the tab remains open until requests succeed or the user stops. HTTP 400 and other permanent row responses remain visible for correction; HTTP 401/403 stop immediately for login or permission action. An unavailable endpoint (404) is treated as a recoverable service failure.
- Original row positions, attempt numbers, current errors and the exact remaining queue stay consistent across recovery. Earlier product choices survive failure and explicit cancellation. The queue preserves manual/automatic selection mode. The next row is paced from the most recent request retry, including after a long supplier pause, rather than the original row start.
- The UI explains automatic recovery and the login exception, shows **Omsökning efter sökfel** and **Återupptar efter sökfel**, and keeps **Stoppa sökningen** available. **Fortsätt automatval** remains useful after an explicit stop or login/permission interruption.

Verification: all **31 focused tests** passed. The complete release check passed TypeScript, zero-warning ESLint and **1,425 tests (1,411 standard plus 14 isolated timing/database tests)**; the final local Next.js production build passed. Tests cover repeated throttling, a 15-minute countdown with a simulated clock, timer overflow, capped recovery pauses, explicit cancellation, authentication stops, permanent row errors and 242 rows with transient failures, a long supplier pause, highest-score selection and the actual 20/minute limiter. The 242-row test finished with no quota rejection and at most one request in flight, without repeating successful rows.

The actual React component was also exercised in a local browser fixture. Nine HTTP 503 responses exhausted the quick retries on three rows; after the recovery wait all three rows selected the 89-point candidate automatically, without a continuation click. A separate 900-second supplier pause visibly counted down and was stopped immediately, preserving all three previous choices. Final pacing after long retries was verified by the 242-row regression. Development used local fixtures only; no production supplier requests, database changes, configuration changes or publication were performed.

Artifacts in the primary checkout: `.tmp/material-recovery-focused.log`, `.tmp/material-recovery-release-tests.log`, `.tmp/material-recovery-build.log`, `.tmp/material-recovery-completed.txt`, `.tmp/material-recovery-pause.png` and `.tmp/material-recovery-stopped.txt`. The reviewed rule catalogue is `scipx-product-rules-2026-11-13.8`.

## Highest-score choice across every Excel row — published 13 November 2026

The user requested automatic highest-score selection and clarified that “all products” means **all rows in the Excel list**. This follow-up and the result-score change below were manually published at the user's explicit request; see the [scores and automatic-choice release](excel-auto-selection-release-2026-11-13.md) for the live revision, deployment and production verification.

- **Sök alla och välj högst (N)** searches the complete valid, positive-quantity list, independent of the table page and filters. It includes rows with previous results or choices, replacing those choices after a successful new search. Zero-quantity and invalid rows remain visible without supplier requests.
- Each row selects the greatest finite score in the returned candidates, from 0 to 100. The client calculates the maximum even if candidates arrive unsorted. Equal scores keep the server's existing tie-break order. There is no hidden minimum score, identity or technical-conflict gate; low-score choices and their checks remain visible. Empty results stay unselected. Legacy results with no valid scores request a new search or manual selection.
- Automatic choices show **Automatiskt vald produkt**, their article number and points. The reviewer can freely choose another product or remove the choice. Ordinary remaining-row and single-row searches stay manual. Excel exports retain the actual choice and score and add column X, **Valsätt**, distinguishing automatic and manual choices.
- **Fortsätt automatval (N)** resumes the exact failed and unvisited row IDs after stopping, including rows that had old selections before the new run. Completed choices survive cancellation. An unsuccessful repeat search retains its previous choice and exports it alongside the search error. Existing serial pacing, request deadlines, retries and supplier limits are unchanged.

Verification: all 56 focused Excel, selection, scoring and queue tests passed. The complete release check passed TypeScript, zero-warning ESLint and **1,420 tests (1,406 standard plus 14 isolated timing/database tests)**; the local Next.js production build passed. A deterministic fixture exercised 242 valid rows through the actual 20/minute limiter with a simulated clock: all 242 selected the highest score, with no rejected requests and at most one in flight. Three zero-quantity and two invalid rows were excluded. This was not a 242-row public catalogue search.

The actual React import component was exercised in the browser with a local five-row workbook and cached fixture responses: three rows automatically selected 89 points over a deliberately first-listed 24-point candidate; stopping and resuming preserved all choices and the remaining queue; manual replacement remained possible. The downloaded workbook was reopened and verified for all five source rows, actual choices, 24/89/89 scores, manual/automatic provenance and skipped rows. Those development checks did not run a supplier batch or change production. Subsequent publication and live checks are recorded separately in the release record above.

Logs and local artifacts are retained in the primary checkout at `.tmp/material-auto-release-tests.log`, `.tmp/material-auto-build.log`, `.tmp/material-auto-ui.png`, `.tmp/material-auto-ui-state.txt` and `.tmp/verify-material-auto-export.cjs`. The reviewed rule catalogue is `scipx-product-rules-2026-11-13.7`.

## Result scores and visible size comparison — published 13 November 2026

The user requested points on every Excel search result and reported apparent wrong sizes for `KRA.017 3322 Normaltykke Stålrør Sprinkler`. They supplied article 1001126, whose Ahlsell nominal-size field is `4" (100)` and outside diameter is 114.3 mm. Those are different measure systems: this article matches DN100, while the installation's pipe series, wall, finish and connection still require review.

This follow-up was manually published together with automatic highest-score selection; see the [scores and automatic-choice release](excel-auto-selection-release-2026-11-13.md).

- Every newly returned result includes a 0–100 match score based on the existing product/requirement ranker, with an explanation of conservative limits. A wrong size caps the score at 24, unknown size at 59, technical conflict at 34, unverified page identity at 69 and remaining technical checks at 89; the lowest applicable cap wins. Results are sorted by the displayed score, with stable technical/size/identity tie-breaks. Points are search support, not a probability or approval.
- Each card shows the requested measure, the product's DN and outside diameter separately, and whether the size matches, differs or needs checking. Compare DN with DN and outside diameter with outside diameter; do not derive one from the other. A bare workbook number remains unspecified until the reviewer chooses a measure system. Explicit DN/mm in the dimension cell is recognized. Foreign, conflicting, expired, interval and multi-size DN evidence cannot establish a confirmed single-size match. Fittings retain every connection size and still require port-order review.
- Exact size candidates are prioritized for the existing six page-detail requests. A stale prose warning claiming a missing DN is removed only when the same measure comparison confirms it. Original technical differences remain visible. Blank specification entries are omitted.
- Selection stays unrestricted, including low-scoring results. Legacy API results without scores request a new search instead of inventing a score. Excel export appends separate selected/proposed scores and size comparisons while retaining the original fields and the user's actual choice.

Verification: 53 focused Excel, queue, selection, scoring, workbook and rule tests passed. The complete release check passed TypeScript, zero-warning ESLint and **1,413 tests (1,399 standard plus 14 isolated timing/database tests)**. The local Next.js production build passed. The real review component was visually inspected in a local static fixture preview; user selection and export behavior were covered by regressions. Those development checks did not change production data or saved choices and did not run a supplier batch. Subsequent publication is recorded separately in the release record above.

In the locally replayed DN100 example, article 1001126 scored **89/100** and a DN80 alternative scored **24/100**. These points depend on the row's requirements and available evidence and are not hard-coded per article. Logs and preview artifacts are retained in the primary checkout: `.tmp/material-scoring-release-tests.log`, `.tmp/material-scoring-build.log`, `.tmp/material-scoring-preview-results.json` and `.tmp/material-scoring-preview.png`. The reviewed rule catalogue is `scipx-product-rules-2026-11-13.6`.

## Search recall improvement — published 13 November 2026

This follow-up was manually published with the steel-pipe/DN and queue fixes; see the [Excel fixes release record](excel-fixes-release-2026-11-13.md). No database migration, production data change or environment-variable change was required.

- Automatic Excel matching now uses up to three catalogue queries: a concise product-family/size query, an alternative catalogue wording or broader family query, and the previous descriptive query. Classification codes, project-purpose wording, repeated fitting sizes and descriptive dimension ranges no longer have to appear in every query. Examples include compressed-air ball valves, press fittings, PP pipes, sprinkler heads and fire cabinets searched also as `brannpost`.
- The full original description, dimension fields and fitting port sequence remain the technical comparison input. Alternative wording is a search hint, not a material-grade equivalence or an approved substitution. Bare sizes are not converted to DN; an explicit DN in the description is reused only when it agrees with the size field.
- Up to 24 candidates remain available instead of cutting the result to six. Technical assessment and size hints determine which six receive product-page requests. The supplier limits stay at one page per query and three variant-family lookups; shared rate limiting and cancellation are unchanged. Additional candidates may have unverified page identities.
- User-entered searches, exact article numbers and URLs are not broadened automatically. Every displayed candidate remains freely selectable. Actual query phrases are visible under **Använda sökord** and exported in the **Sökning** column.

Read-only public verification used six representative rows from the supplied schedule, locally without a production database. The user's `SMB.003.04 3454 Stengeventil Teknisk Trykkluft Kuleventil 22mm` query returned zero catalogue hits before shortening. `kuleventil trykkluft 22` returned two product families; the improved matcher verified the 22 × 22 mm page headings for articles [5670637](https://www.ahlsell.no/products/vvs-teknisk/ventiler---filter-og-instrumenter/kuleventiler/5670637/) and [5670645](https://www.ahlsell.no/products/vvs-teknisk/ventiler---filter-og-instrumenter/kuleventiler/5670645/). The supplier specifies oil-free compressed air and M-profile pressing; this does not establish suitability for every compressed-air installation.

The 35–35–28 press tee now also finds Mapress 1951076 alongside A-press 1954203. Other previously empty examples returned check-valve, sprinkler-head and fire-cabinet alternatives. These are recall checks, not approved selections or a measured match rate for all 247 rows: broader searches can contain accessories, different dimensions and technical conflicts. In particular, the fire-cabinet probe did not establish an exact 790 × 790 × 160 match, and the PP row still contains a source-description range that requires review.

Validation: all 44 focused Excel, queue, unrestricted-selection, catalogue and rule-snapshot tests passed; TypeScript and zero-warning ESLint passed. New regressions cover the reported valve, alternative searches, source preservation, exact-query isolation, the 24/6 candidate/detail bounds, prioritizing sizes beyond the first six hits, query display and Excel export. Diagnostic results are retained locally in the primary checkout at `.tmp/material-query-probe.json` and `.tmp/material-search-improved-probe.json`.

## Steel sprinkler pipe follow-up — published 13 November 2026

The user reported no results for `KRA.017 3322 Normaltykke Stålrør Sprinkler` at 100, 150, 200, 25 and 32, and explicitly confirmed these sizes are DN. All five original descriptive queries returned zero public catalogue hits. This follow-up was manually published with the [Excel fixes release](excel-fixes-release-2026-11-13.md).

Three issues were addressed: the normal-weight pipe heading in metres could be classified as a sprinkler head; the supplier uses other names such as `mellom serie`; and variant selection did not prioritize a requested single DN over the active catalogue card. Searches now include `stålrør sprinkler DN…` and `stålrør mellom serie …`. The latter omits the prefix only in the search phrase because the supplier also indexes inch/parenthetical-DN values. The source requirement and selected measure system remain unchanged. Unknown workbook sizes still require the reviewer to choose **Nominell diameter (DN)**; this conversation's confirmation is not a default for other imports.

Labelled DN values such as `1 1/4" (32)` are parsed as DN32 with the exact source text retained. This prevents the previous false DN1 conflict. An unlabelled inch value, outside diameter, size interval or multi-port tuple does not establish a single DN. Freely selectable alternatives and the supplier request budget remain unchanged; pipe series, wall thickness, finish and connection type remain review points.

Read-only local matching against Ahlsell returned page-verified pipe candidates for all five sizes, including:

| Confirmed size | Example article | Supplier description / heading |
| --- | --- | --- |
| DN100 | 1001026 | Blue threaded medium-series steel pipe, 114.3 × 4.5 mm |
| DN150 | 1118638 | Painted grooved steel pipe, 168.3 × 4.0 mm, 6 m |
| DN200 | 1118639 | Painted grooved steel pipe, 219.1 × 4.5 mm, 6 m |
| DN25 | 1001013 | Blue threaded medium-series steel pipe, 33.7 × 3.2 mm |
| DN32 | 1001015 | Blue threaded medium-series steel pipe, 42.4 × 3.2 mm |

These examples establish catalogue availability and the nominal size, not interchangeable pipe specifications or approval for the installation. The final diagnostic data, including source links and the other candidates, are retained in the primary checkout at `.tmp/material-steel-five-dn-final.json`.

Validation: the full local release check passed for the query, classification and variant-ranking changes (log `.tmp/material-steel-release-tests.log`). After the final parenthetical-DN parser adjustment, all 67 focused catalogue, evidence, classification, Excel, client, selection and rule tests passed; TypeScript and zero-warning ESLint also passed. Those development checks did not change production data, migrations, configuration or deployments; subsequent publication is recorded separately.

## Batch-search stall follow-up — published 13 November 2026

The user reported row 24 remaining at **Söker**, without a pause message. Their pasted list contains 20 completed searches before that row, excluding two zero-quantity rows. This aligns with the endpoint's existing 20 requests/minute limit, but it is not proof of the live request's failure: no production trace was captured. Source inspection also found that the browser had no request/body-read deadline and stopped the entire batch after an individual gateway failure. This fix was manually published with the [Excel fixes release](excel-fixes-release-2026-11-13.md).

- The client now bounds each fetch plus JSON body read to 65 seconds. A hanging request is aborted and recorded as a retryable row error; the next row continues.
- The whole batch runs serially with at least 3.1 seconds between row starts. Empty results count as completed searches and never stop the batch. Table pagination and row filters do not truncate the queue.
- Rate-limit pauses respect `Retry-After` (seconds or HTTP date), show a countdown both above the table and in the active row, and resume automatically. A delay over five minutes pauses for manual continuation instead of shortening the supplier's requested wait. Persistent throttling still stops after two automatic retries.
- Transient network/gateway/invalid-response errors get at most two retries with short delays. Three consecutive row failures pause the batch with an explanation. Authentication/permission loss stops immediately. An explicit user stop restores the current row, preserving earlier results and leaving later rows pending.
- The active row shows elapsed seconds during a request. The completion summary distinguishes searched rows, failed rows, completion and pause. Browser-tab state is still temporary; keep the tab open and download the workbook before leaving.

A deterministic local test ran all **242 rows** through the actual 20/minute limiter with a simulated clock and fixture responses: 242 completed, zero rejected by that limit, at most one request in flight. Separate tests cover stalled fetch and body streams, countdown/resumption, manual cancellation, isolated errors followed by successful rows, three-error pausing and unchanged unrestricted selection. This is a queue test, not 242 public supplier searches or a measured catalogue match rate.

The endpoint's production rate limit, shared supplier budget and database are unchanged. Validation passed: TypeScript, zero-warning ESLint, all 1,404 release tests (1,390 standard plus 14 isolated timing/database tests), and the local Next.js production build. Logs are retained in the primary checkout at `.tmp/material-queue-release-tests.log` and `.tmp/material-queue-build.log`. The combined search-recall, steel-pipe/DN and queue changes were explicitly authorized and manually published; see the [release record](excel-fixes-release-2026-11-13.md) for the live commit, deployment and post-publication checks.

## Unrestricted-choice release

The unrestricted-choice change removes technical-conflict, identity-verification and acknowledgement-checkbox gates from Excel product selection. It was manually published on 13 November 2026; see the [unrestricted-choice release record](excel-free-choice-release-2026-11-13.md). The earlier release record below describes the initial live version. Validation: all 28 focused Excel/client/rule tests passed, along with TypeScript and zero-warning ESLint. The UI regression covers all combinations of identity verification and technical conflict; workbook tests verify that any selected candidate and its caveats are retained.

## Verification

Automated tests cover real workbook round trips, source row identity, localized quantities, formulas, archive limits, request validation, exact product identity, dimensional conflicts, proposal/selection separation, cancellation and supplier backoff. The existing API guard regression includes the new route.

`node --import tsx scripts/verify-material-import-local.mts` checks the HTTP endpoint against the isolated local platform on port 3100, including anonymous denial and invalid/oversized input. Add `--public-catalog` to read and verify the public Ahlsell test article 5002206 through the local API. It cannot target a remote application or database.

The supplied pasted schedule was converted to a local test workbook: 247 rows were retained, including three zero-quantity rows and two rows with missing units in the unit column. Public read-only searches through the isolated local API found copper pipe 5002206 and the 18 × 15 × 18 press tee 1954193. These are verification examples, not approved material selections.

The feature was manually published on 13 November 2026; see the [release record](excel-material-release-2026-11-13.md). Authenticated browser verification confirmed file selection, 247 parsed rows, the invalid-row filter and successful Excel download. The downloaded workbook was reopened and retained all 247 rows. These client-side checks did not create production data. Candidate matching was verified through the isolated local API and automated tests; interactive candidate selection was not exercised against production.

Validation on 13 November 2026: the complete release check passed TypeScript, zero-warning ESLint and all 1,383 tests (1,369 standard tests plus 14 isolated timing/database tests). The local Next.js production build also passed. Logs are available in the primary checkout under .tmp/excel-material-release-tests.log and .tmp/excel-material-build.log.
