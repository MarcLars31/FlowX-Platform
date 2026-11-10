# Project reports: local development

Implemented on `codex/scipx-upgrades` for local testing, 10 November 2026. This change has not been pushed or deployed.

## Open and test

Run `npm run dev:local` from `apps/web`. Open a project's **Kapitler og ansvar** view and choose **Rapporter**. The existing local review fixture is available at:

`http://127.0.0.1:3100/projects/56f2fe03-9978-4f9d-91a8-e8d4bbea7ce5/reports`

The local role buttons select the project leader, employee or reviewer. The existing assignment and review examples are preserved. The review example contains three posts and six review events, including a returned submission, an approval and a reopening.

## Report behavior

- **Prosjektstatus:** current post counts per chapter, department and responsible person, followed by the underlying posts. Counts describe posts, not estimated effort or hours.
- **Frister og tiltak:** unfinished posts, with overdue work first, dates, days overdue, open help requests and suggested next actions. These suggestions do not create new tasks or change the underlying records.
- **Granskningsprotokoll:** submission, approval, return and reopening history with timestamp, actor and comment. An earlier approval does not mean a reopened post is currently approved.

All reports support chapter, department, responsible person, current status and date filters. Dates mean the effective post deadline for status/actions and the event date for the review protocol. Review person/department/status filters describe the current assignment, not the assignment at the time of each event. The UI and exports explain this distinction.

Counts and rows use the same filtered selection. In review mode, only posts with matching events count towards the selection. Completed work is not counted as overdue. Help totals count posts with open help requests, not the number of requests. Calendar comparisons and displayed timestamps use Europe/Oslo, based on the database snapshot time. Work review and technical product verification remain separate.

The screen paginates tables in groups of 40. PDF and Excel include all selected rows, including history beyond 1,000 events. Each export includes project, organization, generation time, access scope and filters. Long comments continue on additional rows/pages with reference cells repeated. Excel has a summary sheet, report-specific sheets, frozen headers and filters. PDF uses landscape A4 with repeated table headings and page numbers. Scandinavian text is supported; characters outside the embedded PDF font are represented explicitly as Unicode code points. Excel retains the original characters.

## Access and consistency

`GET /api/projects/[id]/reports` returns the preview or a PDF/XLSX export. It verifies the authenticated organization and project before calling `read_project_reports`. The migration adds a read-only RPC which derives its visible post IDs from the existing `read_project_management` access rules, then reads only those posts' history and open help requests within the same database snapshot. No service-role bypass or new export privilege is used. A restricted reader cannot export data outside their existing scope.

The internal security-definer helper is isolated in a private schema, uses a fixed search path and requires an authenticated user. The public wrapper is security-invoker. Anonymous execution is denied.

Preview responses include a content version. Export requests reread the authorized data and require that version; changed contents return HTTP 409 and instruct the user to refresh. Invalid filters return HTTP 400. Responses are private and not cached. User-entered Excel text is stored as literal text, not formulas.

Migration `20261110045833_project_management_reports.sql` was created with the Supabase CLI and applied only to the persistent local development database. A future hosted migration and application publication require separate authorization under `AGENTS.md`.

## Verification

- Release check: Next type generation, TypeScript, ESLint and all 1,348 tests passed.
- Report tests cover calendar boundaries, duplicate chapter labels, filters, current versus historical approval, long comments, literal Excel text and multipage PDF output.
- PGlite integration tests apply the migrations and verify manager/employee visibility, more than 1,000 history records, cross-organization denial, revoked membership and unauthenticated denial.
- Local HTTP checks passed for all three reports in both formats as project leader, employee and reviewer (18 combinations), plus stale-version and invalid-date responses.
- Browser checks covered navigation from project management, report switching, current-status and date filtering, empty results, reset and download controls.
- All sample PDF pages were rendered and visually inspected. Excel summary and detail sheets were rendered for layout checks. Final small export-formatting changes were followed by report tests, TypeScript, scoped ESLint and local HTTP checks.
