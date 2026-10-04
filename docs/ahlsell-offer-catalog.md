# Ahlsell historical offer catalog

The matching API loads a private catalog for the authenticated project's organization from the existing private `product-documents` bucket. `catalog_imports` records each deployment. The catalog is server data, not a public static asset and not an approved technical product master. Existing MLDL products retain their independent evidence.

Each imported identity has its original article number, product name, discipline, review flags and private source references. Numeric supplier suffixes such as N5 remain distinct. Requirement text, historical prices, customer information, quantities and stock availability are not product facts. Unidentified supplier names, freight, totals and requirement-only rows are not imported as products.

The current source extractor accepts the explicit article columns in the supplied offer spreadsheets and the two recognized Ahlsell PDF table layouts. Other layouts and rows without stable article identity require review. The original files remain unchanged. NS3459 XML supports quantity checks, not article extraction; AFG is not parsed.

## Matching

Only product posts are searched. Retrieval uses their technical description, attributes and applicable immediate parent, never historical post number or file name. Candidates then pass the existing technical ranker and additional cable variant checks. Historical evidence is always marked for review and cannot become a green match on its own. Source exceptions and multiple descriptions retain review warnings. Current public Ahlsell search continues as before.

## Import

Run `apps/web/scripts/import-ahlsell-offer-catalog.mts` with `--file` and `--organization` using service credentials in the environment. It defaults to a read-only dry-run. `--apply` writes an immutable snapshot, publishes the private catalog and verifies the uploaded bytes. Repeating the same version makes no changes. Replacing a different existing version requires its observed `--expected-version`. Preserve and merge existing records in the prepared catalog before replacing it; this deployment tool never edits the global approved product tables.

The server checks organization identity inside the catalog, validates entries, limits input to 6 MB / 10,000 products, and returns no private provenance or commercial fields to the client. Storage failures leave ordinary matching available and are reported in API metadata. The per-organization cache expires after 60 seconds. No schema migration or client storage access is needed.

## Evaluation

Use the production PDF reader, extractor and ranker on unchanged source files. Freeze the pre-change results. Compare local catalog retrieval with external search disabled on both sides, so changing public search responses do not distort the comparison. Report product-post coverage separately from overlap with historical offer articles. Historical article overlap is not technical compliance accuracy. Evaluate without products unique to the source project's offer as an additional transfer check. Keep project-specific outputs and full source references private, outside Git.
