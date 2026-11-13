# Excel material lists and Ahlsell article matching

Feature developed on `codex/scipx-upgrades`. Publication is tracked separately in the release record; no database migration is required.

Open **Excel till NRF** in the organization navigation (`/material-import`). The page and its matching API require `project.product_suggestion.view` through the existing organization authorization. This is a standalone material-list workflow: it does not create project requirements or change saved project product choices.

## Workflow

1. Select an `.xlsx` workbook, at most 5 MB and 1,000 material rows. The browser reads the file with the existing ExcelJS dependency. It scans every worksheet for a header containing description, unit and quantity; Norwegian, Swedish and English header aliases are supported. Titles, leading blank rows, repeated headers and multiple sheets are supported.
2. Search all remaining rows, or one row. Each request sends one material description, dimensions, unit, category and reviewer additions to the authenticated API. The supplier receives product search terms, not the workbook or quantities. Search uses the existing public Ahlsell Norway catalogue, variant expansion, technical evaluation, shared supplier budget and evidence cache.
3. Choose freely among search results, including articles with technical conflicts or an unverified page identity. No acknowledgement checkbox is required. The comparison details remain visible as information and accompany the chosen product in the export. Search by another description or exact article number to find other products. Nothing is selected automatically.
4. Download a new Excel workbook. Original material fields, sheet names and row numbers accompany separate **proposed** and **selected** article columns, product URLs, status, checks and errors. The original workbook is never modified.

## Data and failure handling

- List and review state live in the current browser tab. Download before leaving the page; this release has no durable import session or project persistence.
- Quantity zero is preserved and does not initiate a supplier search. Missing/invalid quantities, units, descriptions and Excel errors stay visible and are exported; fix them in the source workbook before searching.
- Formula cells use saved Excel results. Missing cached results are flagged. ScipX does not recalculate formulas.
- A bare dimension is not assumed to be DN. The reviewer can specify nominal diameter or outside diameter. Fitting tuples retain all ports; matching numeric tuples still require port-order and system checks.
- Conflicting documented diameters and fitting tuples are shown as information without blocking selection. Missing material grades, bend angles, press systems and operating points remain review items.
- One row is searched at a time. Rate-limit responses respect `Retry-After` with at most two automatic retries. Cancellation restores the current row's previous state; later rows remain pending. Service/authentication failures stop the batch with previous results retained.
- Product numbers are labelled **NRF / article number** because a supplier article identifier is not always a registered NRF number.
- The parser rejects unsupported, corrupt, encrypted and oversized ZIP containers. File parsing and workbook generation run in the browser; no server-side workbook upload endpoint is added.

## Development update after the initial release

The unrestricted-choice change removes technical-conflict, identity-verification and acknowledgement-checkbox gates from Excel product selection. It is not yet published; the release record below describes the initial live version. Validation: all 28 focused Excel/client/rule tests passed, along with TypeScript and zero-warning ESLint. The UI regression covers all combinations of identity verification and technical conflict; workbook tests verify that any selected candidate and its caveats are retained.

## Verification

Automated tests cover real workbook round trips, source row identity, localized quantities, formulas, archive limits, request validation, exact product identity, dimensional conflicts, proposal/selection separation, cancellation and supplier backoff. The existing API guard regression includes the new route.

`node --import tsx scripts/verify-material-import-local.mts` checks the HTTP endpoint against the isolated local platform on port 3100, including anonymous denial and invalid/oversized input. Add `--public-catalog` to read and verify the public Ahlsell test article 5002206 through the local API. It cannot target a remote application or database.

The supplied pasted schedule was converted to a local test workbook: 247 rows were retained, including three zero-quantity rows and two rows with missing units in the unit column. Public read-only searches through the isolated local API found copper pipe 5002206 and the 18 × 15 × 18 press tee 1954193. These are verification examples, not approved material selections.

The feature was manually published on 13 November 2026; see the [release record](excel-material-release-2026-11-13.md). Authenticated browser verification confirmed file selection, 247 parsed rows, the invalid-row filter and successful Excel download. The downloaded workbook was reopened and retained all 247 rows. These client-side checks did not create production data. Candidate matching was verified through the isolated local API and automated tests; interactive candidate selection was not exercised against production.

Validation on 13 November 2026: the complete release check passed TypeScript, zero-warning ESLint and all 1,383 tests (1,369 standard tests plus 14 isolated timing/database tests). The local Next.js production build also passed. Logs are available in the primary checkout under .tmp/excel-material-release-tests.log and .tmp/excel-material-build.log.
