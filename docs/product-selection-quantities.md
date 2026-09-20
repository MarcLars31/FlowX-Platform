# Product selection and order quantities

Products and accessories use the same checkbox. Clicking it again removes the selection. Accessory search stays open for multiple selections, with editable quantities next to each result and in the selected accessory list.

Manually added products and accessories use the **total for the PDF post**. Five fittings for a 68 m pipe post export as five, not 340. The original PDF quantity is unchanged. An explicit main-product quantity and unit are stored in `product_snapshot.orderQuantity`; new accessory quantities carry `quantityBasis: "total"`. Excel and PDF material exports use these totals, and the product summary uses the main-product override.

Snapshots with no accessory basis retain their previous per-PDF-unit calculation. The editor labels these legacy amounts separately and offers conversion to a total. Suggested per-unit accessories are converted using the PDF quantity when selected; if the PDF quantity is missing, the user must enter a total.

Apply `supabase/migrations/20260920120000_add_product_order_quantities.sql` before deploying this UI. RPC v4 approves the product and saves the quantities in one transaction through the existing access checks. If the RPC is unavailable, the API returns 503 without falling back to a quantity-losing approval. Project totals are deliberately excluded from reusable per-unit accessory memory.

Validation performed locally:

- Mapping validation, accessory round trips, legacy compatibility, and real Excel workbook quantity assertions.
- Browser checks for selecting/deselecting multiple accessories, quantity editing, manual products/accessories, save payloads, main-product changes, and mobile layout.
- Actual v2/v3/v4 SQL functions in PGlite with fixture tables and stubs for existing authorization/base persistence: total persistence, legacy ratios, excluded total memory, transactional rollback, invalid input, unauthenticated/unauthorized calls, and the review path.
- TypeScript and lint checks. Full unit suite: 576/577 passed; the existing PDF dropzone test expects Swedish text while the local Norwegian translation returns Norwegian text.

No production database or deployment was changed for this UI work.
