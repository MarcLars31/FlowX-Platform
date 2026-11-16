# Structured technical evidence per Ahlsell article

Scipx now reads the identified article's technical table, heading and technical subtitle before final matching. It normalizes documented DN, outside diameter, thread, material, connection, pressure, K-factor, temperature, response, orientation and finish. Each observation retains the original text, source URL, source type and retrieval time.

The search terms and the PDF requirements are never copied into product evidence. The product page must identify the requested NRF. The existing N5 catalog alias is accepted only when the visible article number confirms it. Neighboring product variants and recommendation sections are excluded. Conflicting observations remain visible and prevent a green match, including when separately assessed candidates are merged in the browser. Unknown or unsupported units and ranges stay unverified.

Both automatic suggestions and product/accessory lookup use the evidence. Product cards offer a collapsed “Tekniskt produktunderlag” section with source links and timestamps. This is supporting evidence for the existing technical rules, not automatic approval of a complete installation.

## Persistence

Raw snapshots are cached for 12 hours in the existing private Supabase Storage bucket `product-documents`, under `ahlsell-technical-evidence/v1/{market}/{article}.json`. Only the server writes them using the existing server credential. No database migration is required. Snapshots contain public article data, not project requirements or customer documents.

Reads validate schema, NRF, market, source URL, size and age, then reconstruct normalized evidence. Expired or invalid records trigger a fresh page read. Storage failures fall back to live reads; failed product fetches do not overwrite a usable snapshot. Storage requests are bounded to 1.5 seconds and 64 KB. Existing Ahlsell URL, redirect, page-size, timeout and concurrency limits remain active.

## Verification

- All 560 automated tests passed, including 15 evidence regressions for identity, conflicting sources, units, ranges, storage and fallback behavior.
- TypeScript and ESLint checks passed; production build checked separately before publication.
- Live Ahlsell reads and private cache writes/reads succeeded for NRF 9257423 (sprinkler), 9253497 (valve) and 1452326 (coupling). The subsequent reads needed zero Ahlsell page requests.

This release enriches the first six relevant candidates on demand. It does not pre-import the whole Ahlsell catalog or parse downloadable manufacturer PDF datasheets. Missing technical data still requires review. These checks establish correct data handling, not a measured increase in real-project match accuracy.
