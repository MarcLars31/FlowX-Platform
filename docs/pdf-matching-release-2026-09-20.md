# PDF extraction and product matching — 2026-09-20

Quantified child posts now keep their PDF hierarchy, inherited requirements and
attribute provenance. Main product identification takes precedence over included
accessories and equipment mentioned elsewhere in a post. Incomplete or conflicting
evidence requires review instead of producing a verified match.

## Changes

- Recover wrapped alphanumeric post numbers and separate repeated post numbers in
  different chapters. Keep measured pipe children distinct from lump-sum work.
- Preserve immediate-parent descriptions and the source post/page of inherited
  attributes. Existing projects are enriched from their saved source pages; saved
  attribute edits are preserved and differences are flagged for review.
- Report unresolved quantity rows and ambiguous parent associations. Browser OCR
  can retry sparse table columns before retaining the better extraction.
- Separate main product intent from accessory wording, including pressure
  switches, actuators, drainage tanks, pipes and sprinkler hoses.
- Apply group-specific completeness checks, connection alternatives, material
  grades, dimensions and fitting ends. Reassess direct catalogue suggestions under
  the same rules as other candidates.
- Keep pipe search material consistent with explicit PDF fields. Plastic and
  copper searches no longer receive a steel outside diameter inferred from DN.
- Extend accessory plans for sprinkler hoses, supports and valve flange parts;
  compatibility and quantities still require documented verification.

Matching engine revision: `ahlsell-product-rules-2026-09-20.1`.
No database migration is required.

## Validation

- All 545 tests in the package's non-HTTP-E2E test scripts passed in the isolated
  release tree. TypeScript, ESLint for `src`, and the Next.js production build
  (`next build --webpack`) passed.
- The saved text from the 13 supplied PDFs still yields 472 rows and 313 product
  posts. This is extraction coverage, not verified product-match accuracy.
- Replaying the saved product evidence for 29 known problematic posts prevents
  all 167 previously green candidate assessments from remaining green. A review
  or rejection does not mean that a correct replacement product has been found.
- Full authenticated production flows and a new live catalogue coverage run are
  not included in the automated local checks.

Next: collect structured technical evidence for exact NRF variants, then measure
precision and coverage against a manually checked sample of pipe, fitting, valve
and sprinkler posts. Keep uncertainty visible until the evidence is sufficient.
