# Product matching feedback

Scipx records the ranked products that a reviewer actually sees and connects
the latest impression to one of these human outcomes:

- `product_selected`: the reviewer approved an NRF/article number.
- `not_in_assortment`: none of the displayed candidates was acceptable.
- `resolution_cleared`: a previous assortment decision was withdrawn.

The event stream is append-only in `product_learning_events`. Product approval
and assortment decisions are captured by database triggers so a client cannot
silently manufacture positive training labels.

## Reproducible match context

`record_product_candidate_impression_v2` stores at most the first three shown
candidates with their order, technical score, decision state, reasons,
warnings, source, family and learned-history evidence. Event metadata includes:

- matching engine version;
- Victaulic catalog version;
- whether live Ahlsell search was available;
- counts for verified database, live catalog and confirmed-history candidates;
- whether the live result was truncated.

The web route falls back to the original RPC during a rolling deployment. A
telemetry failure never blocks the reviewer from seeing or selecting products.

## Quality measurements

`product_match_outcome_examples` supplies one current human outcome per
requirement, including selected rank and top-1/top-3 correctness.

`product_match_quality_daily` aggregates those labels by organization, day,
engine version and catalog version. This makes a rule or catalog release
comparable with the previous release instead of mixing all historical outcomes.

Confirmed history remains advisory. It can change search order or break a tie,
but it cannot override a technical warning, accessory compatibility review or
hydraulic/listing review.

## Safe improvement loop

1. Deploy the web change and database migration together.
2. Let reviewers approve products or choose “not in assortment” in normal work.
3. Compare top-1 accuracy and top-3 coverage per engine/catalog version.
4. Inspect false positives and false negatives in
   `product_match_outcome_examples`.
5. Add a regression case before changing a synonym, normalization or technical
   rule.
6. Release under a new engine or catalog version and compare again.

Do not train automatic approval directly from raw clicks. Only explicit,
persisted reviewer decisions are labels, and hard technical constraints remain
outside the learned tie-breaker.
