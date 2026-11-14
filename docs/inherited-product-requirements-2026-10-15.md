# Product-parent requirements in search

Post 03.30.324.1.1 describes connections to cooling compressor equipment. Its own text omits the Bluepipe system, composite material and PN10 requirements stored on product parent 03.30.324.1. The previous own-post projection removed those requirements before search and technical evaluation.

The read projection now preserves a separate, proven immediate product-parent context. Retrieval and evaluation merge relevant technical fields with the child's fields, including alias-aware precedence for material, DN and PN. Chapter and sibling fields, location and quantities are excluded. A child's material change clears the parent's material grade. Placeholder dimensions such as “Se underposter” do not become search terms. Saved extraction records and product choices are unchanged.

Equipment connections are classified as fittings and search for transitions, unions and couplings. Automatic suggestions require the specified system/grade in product evidence, independent of supplier. Missing dimensions and assembly scope remain verification requirements.

Validation: `npm run build:production` passed dependency audit, TypeScript, ESLint, all 1,058 tests and the production build. Existing unpdf/import.meta and middleware migration warnings remain. Regression coverage checks exact field names (DN must not match energibæreledning), parent provenance, child overrides, legacy numbered blocks, unrelated chapters/families and supplier-independent system relevance.

Read-only live verification using the saved production post and expanded requirement snapshot returned `Bluepipe overgang`, `Bluepipe union` and `Bluepipe kobling`. Ahlsell returned five relevant products: NRF 8754057, 8755032, 8755036, 8754262 and 8755049. All remain VERIFY, since the post does not specify the final connection dimensions and complete assembly details. PN10 retains parent provenance to post 03.30.324.1, page 55. Production UI verification follows deployment.

Rule version: `scipx-product-rules-2026-10-15.4`. This change requires no database migration.
