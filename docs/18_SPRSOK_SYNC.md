# Sprsok synchronization

## Why products were missing

The legacy implementation queried `sprsok_products` directly. It had no source
client, page/cursor loop, retry state, reconciliation job, versioned search
index, or failure queue. The web API returned at most 100 rows and the UI always
requested 50 without pagination. Therefore a table containing more than 50
matching products could never be fully browsed in the product interface.

Read-only diagnostics on 2026-08-05 found 414 legacy rows. All seven display
fields were populated. There were 22 groups sharing a normalized SIN, but those
rows represented distinct variants; there were no exact duplicates across all
seven display fields. Deduplication must therefore never use SIN alone.

## Architecture

The versioned migration `20260805140000_create_sprsok_sync_pipeline.sql` adds:

- resumable sync runs, page logs, source snapshots and structured errors;
- idempotent product upsert using `source + external_product_id`, with a
  supplier/article/variant fallback only when the source id is absent;
- a review queue for incomplete rows and manual field locks;
- a search index updated by product writes, plus an explicit full reindex RPC;
- a non-blocking datasheet-discovery queue;
- an administrative reconciliation view.

The web search uses the indexed view after migration. It falls back to the
legacy table only when PostgREST explicitly reports that the new view is not
installed, allowing the web deployment and database migration to be released
separately. Other database errors are not hidden by the fallback.

## Configuration

Copy the Sprsok variables from `apps/web/.env.example` into the server or CLI
environment. The real URL and response contract must be confirmed with the
source owner; the repository does not guess an endpoint. Cursor and offset
pagination are both supported. HTTPS is required outside local development.

## Commands

Run from `apps/web`:

```powershell
npm.cmd run product-sync -- sync --source sprsok --dry-run --max-pages 2
npm.cmd run product-sync -- sync --source sprsok --resume --apply
npm.cmd run product-sync -- reconcile --source sprsok --dry-run --output sprsok-report.csv
npm.cmd run product-sync -- reconcile --source sprsok --repair --output sprsok-repair.csv
npm.cmd run product-sync -- reindex --source sprsok --dry-run
npm.cmd run product-sync -- reindex --source sprsok --apply
```

Dry-run is the default for sync and reindex. A write requires both an explicit
`--apply` (or `--repair`) and `PRODUCT_SYNC_WRITES_ENABLED=true` in the execution
environment. Dry-run writes run diagnostics/snapshots but never changes products
or the search index. `--repair` imports missing source keys and reindexes missing
database keys without deleting or deactivating products.

## Administration

Platform administrators can open `/admin/sprsok`, filter and export current
discrepancies, run a dry synchronization, confirm a real synchronization, and
repair or reindex selected records. All corresponding API routes verify the
platform role on the server.

## Deployment order

1. Configure and test the source API in a non-production environment.
2. Apply the migration.
3. Run `reindex --dry-run`, then `reindex`.
4. Run a bounded sync dry-run and inspect `/admin/sprsok`.
5. Run the first real sync and export the reconciliation report.

No migration or source write is performed by adding these files to the
repository.
