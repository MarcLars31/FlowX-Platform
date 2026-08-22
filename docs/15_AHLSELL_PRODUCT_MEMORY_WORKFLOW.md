# Ahlsell product-memory workflow

## Purpose

This concept does not require a licensed manufacturer or distributor product
catalogue. Scipx extracts project requirements, while an authorized Ahlsell
specialist registers the real product decision and the accessories normally
ordered with it.

The Ahlsell wordmark is used only in the clearly labelled meeting concept. A
production partnership must use approved brand assets and written permission.

## Workflow

1. A user creates a project and uploads a technical description.
2. Scipx extracts traceable requirements from the PDF.
3. For every extracted purchase row, Scipx builds a prefilled search on
   Ahlsell's public website from the PDF values, such as K-factor, DN,
   temperature, orientation, response and finish.
4. For the seven verified test descriptions, a deliberately small set of
   exact public article matches can also be shown. A match only fills a draft;
   it never approves the product.
5. An authorized distributor user enters, or explicitly applies a verified
   draft containing:
   - product name;
   - Ahlsell article number;
   - optional manufacturer;
   - internal reasoning;
   - zero or more accessory names, article numbers and quantities.
6. The user checks the values and presses **Godkänn produkt**.
7. The project receives a selected product snapshot.
8. The same decision is stored in organization-scoped product memory.
9. When a later requirement has the same normalized technical
   fingerprint, previously used products and accessories are shown in usage
   order. A specialist must still confirm the choice.

## Public Ahlsell matching boundary

- This is an assisted search for the uploaded test descriptions, not an
  Ahlsell catalogue integration or a local copy of Ahlsell's catalogue.
- Public article facts in `ahlsell-public-match.ts` are manually verified,
  date stamped and intentionally limited.
- Rows without an exact match open Ahlsell's public search with the extracted
  technical values. The user selects the actual variant.
- Conflicting requirements, mixed orientations and suspicious K/DN
  combinations produce warnings instead of automatic suggestions.
- Scipx never signs in to Ahlsell, reads customer prices or stock, or stores
  Ahlsell credentials. Current approvals, price and availability must be
  checked before ordering.

## Data ownership and safety

- Memory is isolated by `organization_id` through RLS.
- Product decisions require project access and
  `project.product_suggestion.create`.
- Only confirmed installation requirements can receive a product.
- Removal lines are rejected by the database function.
- The browser cannot select another organization by changing a request body.
- Product selection is persisted through a security-definer database function
  that rechecks the current user, project, requirement and permission.
- Every saved selection creates an audit-log entry.
- The memory is advisory. It never turns a historical choice into automatic
  technical approval.
- A public Ahlsell candidate is advisory and remains unapproved until the user
  presses **Godkänn produkt**.

## Database objects

- `project_requirements.mapping_fingerprint`
- `distributor_product_memories`
- `distributor_product_memory_accessories`
- `project_requirement_mapping_fingerprint(...)`
- `save_distributor_product_mapping(...)`

The current project decision remains in `project_product_suggestions` with
`product_id = null` and `product_snapshot.source = distributor_manual`. This
reuses the existing project history, access control and audit-oriented model
without pretending that a global product catalogue exists.
