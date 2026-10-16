# Scipx Web Platform

Next.js application for the Scipx Platform.

## Run Locally

```bash
cd apps/web
npm install
npm run dev
```

Open `http://localhost:3000`.

## Administrative account HTTP test

After the four marked test accounts have been seeded and the web application
is running, copy `.env.test.example` to `.env.test.local`, opt in with
`RUN_TEST_ACCOUNT_E2E=true`, and run:

```powershell
npm.cmd run test:e2e:test-accounts
```

The test signs in through the real login route and verifies central admin
pages, customer pages, direct APIs, and cross-tenant organization tampering.
It skips when the opt-in test configuration is absent and refuses production
environment signals and known production hosts. Remote staging additionally
requires HTTPS, `E2E_ALLOW_REMOTE_STAGING=true`, and an exact
`E2E_EXPECTED_HOST`. Passwords are read only from test configuration and are
never included in test messages.

Before sending the first login request, the suite calls the normally inactive
`/api/test-support/readiness` endpoint. The web-server process must have
`TEST_ACCOUNT_E2E_SUPPORT_ENABLED=true`, a unique 32-byte-or-longer
`TEST_ACCOUNT_E2E_READINESS_TOKEN`, and an exact
`TEST_ACCOUNT_EXPECTED_SUPABASE_HOST`. The test runner must receive the same
token plus its independent `E2E_EXPECTED_SUPABASE_HOST` assertion. The endpoint
checks the Supabase URL actually loaded by the running server and refuses known
production databases, production environment signals, insecure remote URLs,
and host mismatches. It returns 404 while disabled or when the token is absent.
An optimized Vercel Preview build may report `NODE_ENV=production`; that single
build-mode value is accepted only when `VERCEL_ENV=preview` and
`TEST_ACCOUNT_ENVIRONMENT=staging`. `VERCEL_ENV=production` is always refused.

For local testing, do not start Next.js with the repository's ordinary
`.env.local` configuration: it may point to a live database. Inject the isolated
local/test Supabase URL and the readiness variables into the web-server process
itself. `.env.test.local` is loaded by the test command but is not, by itself,
proof that an already running Next.js server uses the same database.

## Demo Flow

- `/` - demo login
- `/dashboard` - KPI dashboard and recent projects
- `/projects/new` - create project form
- `/projects/demo` - engineering workspace and pipeline
- `/projects/demo/material-list` - generated material list
- `/products` - product search and detail panel

All data is static mock data in `src/lib/mock-data.ts`.
