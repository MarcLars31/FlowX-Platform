# PDF quantities and pipe retrieval — 2026-09-26

## Fix

The fallback NS3420 reader previously read `Antall` but skipped `Lengde`. It now uses the same quantity parser as the table reader, including wrapped label/unit/amount cells, full nested post numbers, area and volume. Decimal commas and grouped thousands survive display, product selection and Excel. Unit aliases normalize consistently (`M`, `lm`, `meter` → `m`; `stk` → `st`). An unreadable unit remains `?` instead of being guessed as pieces.

For scanned tables, the browser OCR performs a targeted second reading of incomplete unit/quantity cells. Crops are derived from the unit, quantity and price column headings. Full-height table borders are removed from those small crops; only explicit unit-plus-number readings with confidence of at least 75 are accepted. Price columns, dimensions and prose are excluded. Recognized `Im`/`1m` aliases normalize to metres. The existing whole-page recovery guard still prevents losing posts or most specification text.

## Verification

- Reparsed the nine user-supplied PDF extraction caches (4,160 source pages). Reran the OCR pipeline on all 30 scanned pages using the original page renders and the shared production geometry/parser helpers.
- Bilag 9: recovered 214 previously missing quantities. Visually checked a 180 m downpipe and adjacent 30/15/15-piece fittings. The 117 old measured identities reported as removed by a strict ID comparison were retained with the same quantities and pages under their full child post numbers; none were lost.
- Sprinkler2: recovered eight missing amounts. The seven pipe children read 126, 384, 114, 223, 64, 143 and 2 m; the neighbouring valve reads 1 st. All 31 extracted posts now have a quantity or RS, with no unknown units.
- Vågå: all 31 extracted posts have a quantity or RS, with no unknown units. The one changed identity is a corrected OCR post number (`33.332.54` → `33.332.5.4`), verified against page 7; its quantity remains 5 m.
- No previously populated amount changed for the same post/page in this comparison. Remaining quantity-less entries in the wider corpus are retained for review; these checks do not certify every row in every original PDF.
- Local browser fixture: `1 234,50 M` shows as `1 234,5 m` in the table, product card and result. Exported XLSX material cells contain numeric `1234.5` and unit `m`; a separate `15 STK` row contains numeric `15` and `st`.
- Quantity flow, pipe matching, export, grouping, extraction, page continuation and OCR regression tests pass. Scoped ESLint and the production build pass.

## Pipe matching

Pipe retrieval uses the post type/NS code, inherited parent specification, material family/grade, DN or outside diameter, joint, pressure and SDR when available. Normalized metre units help identify dimension-only pipe children. It searches the local MLDL data and Ahlsell public catalogue, then checks product details and technical conflicts. The project's total metres are not a catalogue product length or a search term. Existing pipe regression tests cover incompatible dimensions and fittings; no live catalogue match accuracy claim is made by this review.

## Existing projects

Reopening a project can recover amounts from its stored source text through the existing enrichment path. If the old OCR text omitted a printed amount or unit, the original scanned PDF needs to be read again with the updated OCR. This change does not rewrite production project data or replace approved product choices.
