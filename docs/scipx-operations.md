# Scipx operations after the September 2026 remediation

## Release and rollback

Run `npm run build:production` from `apps/web`. The same command is the Vercel
build command; audit, TypeScript and the required regression suites must pass.
Deployments use the London region next to the existing Supabase project.

Apply migrations 20260927150000 through 20260927154000 in order, each in a
transaction with its migration-history record. The scheduler migration creates
an internal capability in Vault and leaves its cron job **disabled**. It sends
only an empty wake-up request to Scipx's own worker; PDF content and user tokens
are never sent in this request. Enable it only after the new Vercel deployment
is ready and the worker rejects unauthenticated calls:

```sql
select cron.alter_job((select jobid from cron.job where jobname='scipx-import-worker'),active:=true);
```

The database chooses the next eligible job, limits execution to one importer,
and issues a 330-second lease. Persistence stops starting operations after
275 seconds. Failed attempts back off and stop after five attempts. Current
submitter permissions are checked before processing, persistence and finalization.
Users can follow/retry their own jobs at `/imports`. Scanned pages still require
the browser OCR step; this can be resumed from Importstatus.

To roll back the web deployment, first disable that cron job with
`active:=false`. Do not remove the new tables, revisions, stored PDFs or jobs.
Queued work remains available for a corrected deployment. Existing completed
customer projects do not need to be reimported. Previously extracted rows retain
their saved data and are read as extraction version 0; new rows use version 1.

## Diagnostics and limits

Structured logs include `project_overview_loaded`, `project_request_failed`,
`import_phase`, `import_attempt_failed`, `import_completed`,
`product_choice_failed` and `session_refresh_temporarily_unavailable`.
Log identifiers, timing and error codes; do not log PDF text, credentials or
full database error payloads. A failed view refresh must not be described as a
failed save when the write already succeeded.

Read-only database checks:

```sql
select status, count(*), min(created_at) as oldest
from public.technical_description_jobs group by status;
select count(*) as overdue_leases from public.technical_description_jobs
where status='running' and lease_until<now()-interval '2 minutes';
select status, return_message, start_time from cron.job_run_details
where jobid=(select jobid from cron.job where jobname='scipx-import-worker')
order by start_time desc limit 20;
select count(*) as entries, pg_total_relation_size('public.ahlsell_shared_responses') as cache_bytes
from public.ahlsell_shared_responses;
select pg_database_size(current_database()) as database_bytes;
```

Ahlsell's outgoing budget is shared by all instances: six active requests,
120 new requests/minute, two-minute public-response cache, 64 entries with at
most 128 kB compressed payload each. The database enforces the entry/body bounds.
429/5xx responses trigger shared backoff. Coordination failure stops outgoing
traffic. This is not a distributed inbound WAF and does not prove capacity for
20 simultaneous users.

Before enabling unattended operational alerts, assign a recipient and delivery
channel. Alert on repeated 5xx/timeouts, oldest queued job over ten minutes,
expired leases not recovered after two cron ticks, repeated failed cron calls,
and database space exceeding the agreed capacity threshold. These alert rules
are an operational setup requirement; structured logs alone are not alerts.

## Backup and recovery: verification still required

The production dashboard inspected on 27 September showed Free/Nano and
“No backups”. No paid upgrade or backup purchase is made by these changes.
Database backups do **not** contain the actual Storage objects:
[Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

A complete recovery plan needs both a database backup and an inventory/copy of
the private `project-files` and `product-documents` buckets, encrypted outside
the active project. Retain object paths, size and checksums alongside the database
snapshot. Keep keys and connection strings outside source control and logs.

Restore into a separate Supabase project first. Reapply schema/RLS, restore the
corresponding database and object snapshot, verify object checksums, then verify
login, tenant boundaries, a large chapter overview, PDF page access, saved
product/accessory choices, comments and Excel. Compare row and object counts.
Record restore duration, snapshot time and any missing data. Never use the live
customer database as the destructive recovery-test target.

## Isolated end-to-end and load verification

There is currently no separate Supabase test database. Local tests cover a real
two-page PDF, interrupted multi-table persistence, duplicate-free retry, chapters,
metres, continuation text and a real Excel file. Local PostgreSQL tests exercise
the new SQL with fixture permissions, competing choices and 20 simultaneous
quota claims. They do not replace production RLS or server-capacity testing.

When an isolated project is available, configure `.env.test.local` according to
the existing test-account readiness contract and run `npm run test:e2e:test-accounts`.
It rejects known production hosts. Use separate test accounts in at least two
organizations. Then exercise upload → chapter → card → save → Excel through the
actual browser/API and 20 concurrent authenticated sessions opening Home,
projects and cards. Record p50/p95, errors, SQL timings and supplier throttles.
Interrupt one importer, allow its lease to expire, and verify recovery with the
browser closed. Do not certify the site for that load until these checks pass.

Scheduler implementation follows the supported
[Supabase Cron](https://supabase.com/docs/guides/cron) and
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) mechanisms.
