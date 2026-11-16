# Sprinkler reference matching — 14 November 2026

Development only on `codex/scipx-upgrades`. No deployment, promotion, production migration, environment change or saved product selection was made. The live release remains the one recorded in `excel-recovery-and-export-release-2026-11-14.md`.

## Result

The supplied reference list exposed dropped DN columns, incomplete product vocabulary, missing explicit sprinkler properties and several incorrect article assignments. The implementation preserves source DN and fitting tuples, recognizes the product families, and uses independently checked public article identities to improve retrieval in both material-list matching and the ordinary hybrid search.

The original list and project quantities are not a product catalogue. The committed index contains 69 public article identities with their supplier headings, labelled technical fields, source URL, retrieval time and page SHA-256. It contains no project quantities, project codes or implied requirement-to-article approvals. An article in the index may be useful under its actual product type even when its assignment in the supplied list was wrong.

`sprinkler-reference-search.ts` returns at most two article-number search hints. Material matching refreshes those exact articles alongside the existing general search workflow; the hybrid search can choose one hint for its existing exact-article lookup. An explicit user query remains authoritative. The index is never returned as a technical candidate or used to increase a candidate's score. A failed lookup or a different replacement article cannot become a result from static reference data. Current exact-article facts take precedence over sparse duplicate search results, then undergo the existing assessment and score caps.

## Interpretation and safeguards

- An explicitly labelled DN column remains DN. Unlabelled dimensions still need a measure system. Multiple fitting dimensions retain their order. Conflicting DN/dimension columns require correction.
- `Stålrør Bend` and the corresponding fitting headings are interpreted as fittings for steel pipe, preserving the original description. They do not invent a steel fitting-body requirement. Explicit body-material requirements remain effective.
- `rillekupling`, `anborringsklammer` and `overgang` select the fitting family; a cross is not a pipe or an automatic two-tee replacement. Compact `90bend` catalogue wording identifies a bend without supplying a missing requirement angle.
- Explicit sprinkler K-factor, QR/SR, orientation, temperature in `grader` and nominal thread sizes become technical requirements. Unknown thread sizes are not guessed from K-factor or a fraction inside a mixed size.
- Documented equal nominal port sizes may establish a single DN. Different or unreadable port sizes cannot.
- Rigid versus flexible coupling is a technical conflict, capped at 34. Historical choices cannot remove it.
- The new reference path does not prefer ambiguous sizes, dry heads with conflicting source descriptions, crosses, water-shield assemblies or protected-head assemblies. Full mounting, accessory compatibility and project-specific replacement/quantity rules still require review. Existing free manual choices and expressly started highest-score selection remain unchanged.

## Source verification

All 70 unique numbers were checked by exact article number against public Ahlsell pages: 69 resolved to that exact identity; 3253502 returned no article. There are 75 nonempty source rows, including 73 with a number in the article column. Fourteen rows have a confirmed discrepancy or missing article. Selected examples:

| Source issue | Verified evidence and treatment |
|---|---|
| Six couplings labelled flexible | The 1452323/25/26/27/28/30 products are rigid Vic 009 couplings. They do not become flexible-coupling references. [Example DN100](https://www.ahlsell.no/products/sprinkler-og-rillesystemer/rillesystem-for-sprinkler-og-vk/rillede-kuplinger-for-sprinkler/1452328/) |
| 9253395 assigned to a reducer | The article is an end cap, 139.7 mm. No reducer mapping was created. [Article](https://www.ahlsell.no/products/sprinkler-og-rillesystemer/rillesystem-for-sprinkler-og-vk/ovrige-rillede-deler/9253395/) |
| 9257329 assigned to two sprinkler-head rows | The article is a DN150 / 168.3 mm 90° bend. It can be retrieved as a bend, never as a head from this reference. [Article](https://www.ahlsell.no/products/sprinkler-og-rillesystemer/rillesystem-for-sprinkler-og-vk/rillede-bend-for-sprinkler/9257329/) |
| 9254551 described as a water shield | The article is a kit of V27 cover/escutcheon parts. No water-shield mapping was created. [Article](https://www.ahlsell.no/products/sprinkler-og-rillesystemer/sprinklerhoder/tilbehor-sprinklerhoder/9254551/) |
| 9253673 assigned to a 25 branch | The article specifies a 1½-inch / DN40 branch. [Article](https://www.ahlsell.no/products/sprinkler-og-rillesystemer/rillesystem-for-sprinkler-og-vk/rillede-anboringsklammer-for-sprinkler/9253673/) |
| Dry head 9255912 | The current page confirms 68°C and 300 mm but a 1-inch connection, conflicting with the list's ½ inch. [Article](https://www.ahlsell.no/products/sprinkler-og-rillesystemer/sprinklerhoder/sprinklerhoder-torr/9255912/) |
| Dry head 9256681 | The heading specifies 1 inch, 317 mm, HSW and VC250; the list differs in connection, length and finish. Additional page/catalogue inconsistencies remain review items. [Article](https://www.ahlsell.no/products/sprinkler-og-rillesystemer/sprinklerhoder/sprinklerhoder-torr/9256681/) |
| 3253502 versus 9253502 | The former was not found; the latter is a real valve. No silent correction or alias was created. [Existing valve](https://www.ahlsell.no/products/sprinkler-og-rillesystemer/rillesystem-for-sprinkler-og-vk/rillede-armaturerventiler-for-sprinkler/9253502/) |

Missing DN25 bend identity, alternate tees/branch saddles, plug/end-cap distinctions, port order, and component quantities remain in the private row-by-row audit.

## Before/after evaluation

Baseline application: `d21be0c`, frozen before implementation. The 75-row evaluation uses unchanged original requirement descriptions and the same frozen local MLDL candidates, with article URLs for the material pipeline. Supplier general search is replaced by a local fixture, not simulated as a live response. Exact lookups and detail requests use the same saved public article pages. Replaying the benchmark prohibits network access. Missing quantities/units do not prevent evaluating a search input; the separate workbook-import check retains those input errors and does not silently fill them.

| Measurement | Before | After |
|---|---:|---:|
| Source NRF present among candidates, 73 rows with NRF | 9 | 19 |
| Source NRF first, same 73 rows | 3 | 14 |
| Checked base article present, 12 selected rows | 0 | 9 |
| Checked base article first, same 12 rows | 0 | 9 |
| Explicit source DN values preserved during import | 0 / 14 | 14 / 14 |
| Fitting tuples preserved as fitting dimensions | 0 / 31 | 31 / 31 |

The twelve cases are seven bends with explicit source DN and five specified standard sprinkler heads. They exclude contradictory IDs, mixed port conventions and substitutions. Base-article retrieval is not proof of full suitability. The full-list counts deliberately measure overlap with source NRFs, not correctness: the source contains errors. These are regression cases from the supplied list, not an independent held-out accuracy estimate or a production/supplier-search benchmark.

Automatic security review rejected the proposed transmission of all project-derived descriptions to supplier search as potentially sensitive. That execution did not run; it was replaced with the offline comparison above. Only public article numbers were used in the completed supplier verification.

## Validation and artifacts

`npm run test:release` passed TypeScript, zero-warning ESLint, 1,424 ordinary tests and 14 isolated timing/database tests: **1,438 total, zero failures**. Ten new tests exercise preserved DN, product families, explicit sprinkler variants, all six rigid/flexible conflicts, unknown sizes and dry/assembly exclusions, multiport evidence, exact-article refresh, replacement IDs, provider failure, manual queries and cancellation.

The reviewed rule catalogue is `scipx-product-rules-2026-11-14.2`. Rule explanations and source hashes were updated together. No publication tag was created.

Private artifacts in the primary checkout, `.tmp/reference-list-20261114/`:

- `verified.json` and individual HTML pages: exact supplier responses and evidence.
- `source-rows.json`, `audit.json`, `report.md`: source provenance and all 75 row decisions.
- `local-search-fixtures.json`, `before.json`, `after.json`: frozen candidates and full results.
- `before-import.json`, `after-import.json`: full workbook-input comparison.
- `release-check.log`: completed validation.

Source text SHA-256: `5198b86b76960fb6cedc44b6da298199d0f08dcb7a3d3e51dfa0dc61133f5a46`.
Frozen local candidate fixture SHA-256: `5348993e8736f9bad3907e5d6b94b1d2f23dd2d2841660f6112339e6ecf04acd`.
