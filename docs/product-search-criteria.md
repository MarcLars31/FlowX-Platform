# Used search criteria

Each automatic product proposal exposes **Vis brukte søkekriterier**. The
server returns the search guide, technical input fields and their recorded
post/page origins, the effective requirements, and the attempted supplier
queries for that particular result. Queries are recorded after normalization
and the three-query limit; failures remain visible. Exact article lookups
are distinguished from catalogue queries. Input fields are not presented as
hard supplier filters. Requirements needing interpretation remain visible.

Manual main-product lookups show the submitted lookup separately from the
project requirements evaluated afterwards. Accessory searches retain their
existing component-specific checks and do not claim main-product criteria.

**Sammenlign med produktopplysningene** shows each requirement against the
observed product value, outcome, original product evidence, source and recorded
retrieval date. Missing parent-page metadata never borrows a child's page.
Only ordinary HTTPS evidence URLs become clickable links; catalogue/version
labels remain text.

The existing authenticated routes and requirement revisions scope the data.
The UI hides criteria from an older requirement revision. These are the current
search results, not a persisted attestation of a historical product selection.
No database migration or production publication is part of this change.

Synthetic regression fixtures in `product-search-trace.test.ts` cover inherited
origins, unresolved requirements, actual queries and failures, manual lookups,
missing product evidence and safe source rendering. No customer data or live
supplier requests are used in those tests.

Validation on 11 November 2026: all 1,248 release tests passed, together with
TypeScript and zero-warning ESLint. The Next.js production build passed.
The actual components and application stylesheet were inspected in a local
synthetic browser fixture, including expanded criteria, product evidence,
keyboard activation and a 390-pixel mobile viewport without horizontal overflow.

## Development branch integration

The same search trace and evidence display are integrated into
`codex/scipx-upgrades`, preserving its grouped product cards, series search,
project roles, review workflow and reports. Chapter post lists show headings,
post descriptions, quantities and status without expanded PDF source text.
When a post is opened, its main-post text and PDF pages are fully visible above
its underposts in the product card. The separate main-post reading dialog
remains available. Information-only chapters retain their text, and chapter
warnings remain visible even when source text is hidden in the post list.

Validation: 1,353 release tests, TypeScript and zero-warning ESLint passed.
