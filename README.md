# TSC Teacher Management & Governance System (TMGS)

A system of record and evidence layer for the Teachers Service Commission: one verified record of every teacher, school and staffing action, with rules that enforce themselves and a transparent readiness score per school.

It is built on the doctrines of the Embu co-operatives system. **The system reports; officers decide.** It never approves, ranks or disciplines a teacher on its own.

The product ships with **no sample data**. It starts with reference data only (regions, the 47 counties, rule settings) and one National Admin created from environment variables; everything else is entered from inside the app.

## What is in Phase 1

| Module | What it does |
| --- | --- |
| Officer Access | National Admin down to Head of Institution, scoped by region, county, sub-county or school. Two-step sign-in for every officer. |
| Teacher & School Registry | Sub-counties, schools with their approved establishment, teachers by TSC number. National IDs are never stored in readable form. |
| Staffing Ledger | Postings, acting appointments, transfers, exits and vacancies. The registration gate is enforced at the moment of posting. |
| Document Management | Sub-County review, then County sign-off; promotion files also need National approval. Nobody decides a document they submitted. Files are stored in the database. |
| Field Quality Assurance | Curriculum Support Officers plan visits, a supervisor signs off, the officer files the report. |
| Compliance Rules | Registration gate, appraisal cycle, acting-appointment limit, staffing norms, transfer eligibility, case timelines. Thresholds are settings, not code. Scans run daily inside the app. |
| Readiness Score | Six weighted factors per school, 0–100, bands AA to D, shown with its working. Schools only, never individual teachers. |
| Teacher Portal | A separate identity. Teachers see their own record, ask for transfers and corrections, and download everything held about them. |
| Audit Trail | Every action logged; the database refuses edits and deletes; entries are hash-chained so tampering is detectable. |

## The home page and the TSC logo

The address opens on a public landing page with the two sign-in doors. The official logo is TSC property; the copy provided is in place and is saved as `frontend/public/brand/tsc-logo.png`; replace it with TSC master artwork (PNG or SVG) when available, then run `npm run build` in `frontend/`.

## How it runs

One Node.js process serves both the API (`/api/...`) and the web pages, on one address, backed by PostgreSQL. Nothing else is required:

- **No external services.** The web app makes no third-party requests (the typeface is self-hosted).
- **No disk.** Uploaded document files live in the database, so they are covered by database backups.
- **No cron.** The daily compliance scan runs inside the app and catches up whenever it starts or wakes.
- **No manual database steps.** Each start applies pending migrations and loads reference data; both are safe to repeat.

## Try it on Render

`render.yaml` is a ready Blueprint: **New → Blueprint** in Render, choose this repository, enter your email and a temporary password for the first admin. Full walkthrough, free-tier behaviour and the data caveat: [docs/RENDER.md](docs/RENDER.md). Use test data only on Render; it hosts outside Kenya.

## Run it locally

Needs Node 22 and PostgreSQL 16.

```bash
# 1. Web app: export the pages once (re-run after frontend changes)
cd frontend && npm install && npm run build

# 2. API, which also serves the pages
cd ../backend
cp .env.example .env     # set DATABASE_URL, the four secrets (deploy/generate-secrets.sh),
                         # and BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
npm install              # also generates the Prisma client
npx prisma migrate deploy
node prisma/seed.js      # reference data + the first National Admin
npm start                # http://localhost:4000
```

Sign in with the bootstrap email and password, set up two-step sign-in, and follow the setup steps on the dashboard.

For frontend work with hot reload, run `npm run dev` in `frontend/` (port 3000) with `frontend/.env.development.local` pointing `NEXT_PUBLIC_API_URL` at `http://localhost:4000`, and set `NODE_ENV=development` and `CORS_ORIGIN=http://localhost:3000` in `backend/.env`.

## Verify it

```bash
cd backend
npm run check      # every module loads; every router sits behind the right identity check
npm test           # 152 tests on a separate test database: engines, crypto (RFC 6238 vectors),
                   # and live HTTP access-control tests using test-only fixtures
npm run db:drift   # migrations match schema.prisma exactly (exit code 0)
cd ../frontend && npm run build
```

Browser tests in `tests-e2e/` (instructions in each file header):

- `coldstart.py` starts from an **empty** production-mode database: bootstrap admin, two-step setup, sub-counties, school, officer, teacher, posting, a document file round-trip, the built-in rules schedule, the teacher portal, and a check that no request leaves the server.
- `e2e.py` walks the approval and registration-gate flows on the test fixtures.

CI (`.github/workflows/ci.yml`) runs the drift check, wiring check, tests and build on every push.

> **Test fixtures are not product data.** `backend/tests/fixtures/load.js` holds invented schools and people used only by the automated tests. The product seed never loads them, and the loader refuses to run when `NODE_ENV=production`.

> **One check to run once.** The migration SQL was written by hand, because Prisma's migration engine could not be downloaded in the environment this was built in. Every table and column is exercised by the tests; index and constraint names are confirmed by `npm run db:drift` (CI runs it on every push). If it ever reports differences, `npx prisma migrate dev --name align` generates a corrective migration.

## Layout

```
backend/     Node.js + Express API, Prisma 7 (PostgreSQL driver adapter), Jest tests
  prisma/      schema, migrations, seed (reference data + first admin only)
  src/
    modules/     one router per module
    rules/       pure rule evaluators, the runner, and the built-in schedule
    score/       pure readiness-score engine + its data loader
    lib/         scoping, crypto (AES-256-GCM, TOTP), audit chain, HTTP helpers
  scripts/     wiring check, manual rules run, local database reset
  tests/       unit and live API tests; fixtures/ holds test-only data
frontend/    Next.js 15 officer app and teacher portal, exported as static pages
tests-e2e/   browser tests (Playwright, Python)
deploy/      nginx, secrets generator, backup cron
docs/        Render trial, deployment, data protection, API reference, verification record
Dockerfile   one image: exported web pages + API
render.yaml  Render Blueprint
```

## Deploy for real use

Kenya-based hosting, one Docker image behind nginx: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Before the pilot: open items for TSC

- Owning directorate and a named sponsor; the pilot county.
- Every rule threshold: all ten are marked **Placeholder** in Rules and settings until confirmed.
- Readiness score weights, validated with Staffing and Quality Assurance.
- Regional groupings: seeded as the former provinces; confirm against TSC regional offices.
- Sub-county lists per county, as TSC records them.
- Which TSC systems expose an API (registration, appraisal, payroll, ID verification). Until then, CSV import.
- Kenya-based hosting and the data protection impact assessment ([docs/DATA-PROTECTION.md](docs/DATA-PROTECTION.md)).
