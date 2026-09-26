# Sprinkler matching baseline

## What is saved

The first sprinkler-head review baseline is stored in:

`apps/web/src/lib/__fixtures__/sprinkler-matching-baseline.v1.json`

It contains 18 reviewed requirement positions from:

- `1403 AB - 33 Rev03.pdf`
- `Sprinkler_Vågå svømmehall.pdf`

The baseline pins the SHA-256 hash of both source documents, the verified
Ahlsell workbook and the generated review workbook. Every case stores the
normalized requirement, the original baseline decision, the proposed Ahlsell
article/SIN and structured reason codes. The separate `review` object is where
a later human decision can be recorded without overwriting the original
proposal.

The v1 baseline result is:

| Document | Positions | Quantified units | Candidate positions | Candidate units | No exact match | Unreviewable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1403 | 12 | 835 | 8 | 813 | 3 | 1 |
| Vågå | 6 | 138 | 4 | 130 | 2 | 0 |

"Candidate" means a technical base candidate. It is not an approved or
order-ready product.

## Where the matching engine is stored

The current ScipX matching system is deliberately split into four parts:

1. `apps/web/src/lib/ahlsell-candidate-ranking.ts` parses the technical
   requirement, scores candidates and produces reasons and warnings.
2. `apps/web/src/lib/sprinkler-orientation-lexicon.ts` contains the Norwegian,
   Swedish and English orientation vocabulary.
3. `distributor_product_memories` and
   `distributor_product_memory_accessories` store organization-owned,
   previously approved product choices and accessories.
4. `product_learning_events` stores candidate impressions, approved products,
   "not in assortment" decisions and later corrections as append-only
   feedback. The views `product_candidate_training_examples` and
   `requirement_correction_training_examples` make the history available for
   offline evaluation.

The engine code is versioned in Git. Approved choices and review history are
stored in Supabase/PostgreSQL and protected by organization access rules.

## Active Victaulic catalog

The reviewed Excel sheet is imported into the versioned application catalog:

`apps/web/src/data/victaulic-sprinkler-catalog.json`

`apps/web/src/lib/victaulic-sprinkler-catalog.ts` performs structured matching
against its 83 Ahlsell article variants. Norwegian sprinkler requirements now
use these candidates through `buildAhlsellRequirementGuide` before the external
Ahlsell results are merged into the product review panel.

The catalog stores its source workbook SHA-256. Regenerate it after an approved
Excel update with:

```powershell
node scripts/export-victaulic-sprinkler-catalog.mjs `
  outputs/01a06850-519d-7a72-9375-da59bb3f646a/Ahlsell_sprinkler_head_Victaulic_verified.xlsx `
  apps/web/src/data/victaulic-sprinkler-catalog.json
```

Rows with review flags remain searchable but can never become automatic exact
matches. Extended coverage, dry/open sprinklers, recessed/concealed mounting
and requirements that include guards, water shields or cover plates are also
kept in manual review until their remaining technical checks are modeled.

## Review workflow

For every baseline row:

1. Compare the source PDF requirement, the baseline candidate and its reason
   codes.
2. Set `review.status` to `approved` or `rejected`.
3. Record `review.outcome` as `correct`, `wrong_product` or
   `not_in_assortment`.
4. When a product exists, enter `review.selectedArticleNumber`.
5. Always explain an approved review in `review.comment`.

In the live ScipX workflow the same information is captured automatically when
the reviewer sees candidates and presses **Godkänn produkt** or chooses
**Inte i sortiment**. A previous approved choice may help order later
candidates, but it is only a search hint/tie-breaker and cannot remove current
technical warnings.

## Comparing future versions

Do not rewrite the `baseline` object after review begins. Change only the
separate `review` object, or create a v2 fixture if the normalized source truth
itself changes. After matcher changes, run the same 18 cases and compare:

- proposed article against the approved article;
- baseline reason codes against current warnings;
- false positive, false negative and not-in-assortment outcomes;
- result by position as well as weighted by quantity.

Validate the stored fixture with:

```powershell
cd apps/web
node --import tsx --test src/lib/sprinkler-matching-baseline.test.ts
```

The baseline is both an evaluation asset and an integration test for the active
Victaulic catalog. Human review remains authoritative.
