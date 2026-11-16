# Product classification and search — 2026-10-15

Navigation, PDF extraction, catalogue retrieval and technical comparisons now use
the same product classification. Existing electrical, ventilation and plumbing
groups remain available. Category version 5 invalidates older overview labels.

Search combines words across fields, includes product names and technical aliases,
and places exact normalized article numbers first across pages. K-value filters
match complete numbers, including decimal commas and dual metric/imperial notation.
PostgREST scalar filters use unquoted values; quoting is reserved for nested logic.

Similar products must share a product family and documented technical properties.
Supplier identity affects neither eligibility nor score. Known technical conflicts
exclude candidates. Missing dimensions, temperature and working pressure remain
visible as verification requirements; suggestions are not approved substitutions.

## Database

Migration `20261015120000_enrich_product_search.sql` was applied to FlowX production
on 2026-10-15 using the remote migration history in an isolated deployment directory.
Only this migration was pending in the dry run. It adds `flowx_product_search_v2`;
no product records are modified. Post-migration checks confirmed all 467 search
records remain visible, projection fields match their source, invoker security is
enabled, authenticated/service access remains enabled and anonymous access denied.

## Validation

- Search/classification: 59 tests passed.
- PDF extraction and related flows: 223 tests passed.
- Distributor matching: 362 tests passed.
- Hybrid matching: 22 tests passed; technical evaluation: 23 tests passed.
- TypeScript, targeted ESLint and the Next.js production build passed.
- The complete release suite passed all 1,051 tests with no failures, including
  drainage subpost inheritance. Matching rule descriptions and their audited
  source snapshot are updated to `scipx-product-rules-2026-10-15.3`.
- Read-only integration tests against production found 72 matches for both
  `Viking pendent` and `Viking hängande`, 67 for `Tyco quick response`, and
  147 for K80. Supplier-name changes did not change rankings across all 467 rows.
- Reliable RA0611 returns Reliable RA3211 and Viking VK496 with matching type,
  orientation, K-value and response. Missing technical values require verification.

The production data integration script is
`apps/web/scripts/verify-product-search-production.ts`. It reads credentials from
the environment, requires an explicit expected project reference and performs
only GET requests. The deployment is based on production commit
`761ad9f566ee13e45ef441a155d5878035066103`, preserving newer unrelated work.

## Rollback

Restore the previous application deployment in Vercel if necessary. The additive
view can stay in place: the previous application uses the existing view. No data
rollback is needed. Do not reset migration history or apply unrelated migrations.
