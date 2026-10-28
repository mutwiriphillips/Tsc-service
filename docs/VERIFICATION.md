# Verification record

Nothing is called done until it passes these checks, run against a real PostgreSQL 16 database.

## Round 2 — 27 October 2026: no sample data, standalone, Render-ready

| Check | Result |
| --- | --- |
| Syntax and wiring (`npm run check`) | 32 of 32 modules load; 72 routes on 16 routers; every router behind the correct identity check |
| Unit, access-control and live endpoint tests (`npm test`) | 152 of 152 pass |
| Web app build (static export) | Pass; no API address baked into the pages |
| **Cold start from an empty database** (`tests-e2e/coldstart.py`, production mode, random secrets, two-step sign-in on) | 11 of 11 pass |
| Fixture click-through on the single-address setup (`tests-e2e/e2e.py`) | 7 of 7 pass |
| External requests made by the web app | 0 |
| Production safety | Refuses to start on development secrets |

The cold start proves the product needs nothing outside itself:

1. The seed on an empty database loads 8 regions, 47 counties and 10 rule settings, and creates exactly one officer, the bootstrap National Admin. Run again, it changes nothing.
2. That admin signs in and is made to set up two-step sign-in before reaching the app.
3. The empty dashboard lists the setup steps; the admin adds sub-counties, a school, a County Director and a teacher, and posts the teacher, all from inside the app.
4. A PDF uploaded with a document is stored in the database and downloads byte for byte.
5. With no cron and no manual trigger, the built-in schedule ran the compliance scan about 30 seconds after start and raised an "Under-staffed" flag.
6. The teacher registers on the portal with TSC number and national ID and sees the posting.
7. Signing in again requires the two-step code.
8. Detail pages open by direct link; unknown pages return 404.

### Bugs caught in this round

1. **Sign-in rate limit locked out busy officers.** The limit covered every `/api/auth` request, including the "who am I" lookup each page makes, so about 30 page views in 15 minutes would have returned errors. Now only credential checks are limited; a test asserts the lookup carries no limit. Found by the cold-start run.
2. **Sub-county names typed twice with different capitals kept the last spelling.** Now the first is kept. Found by a new test.
3. **Render can't hand a public address from one service to another**, which a separate web service would have needed to reach the API. Resolved by design: one service serves both.

## Round 1 — 27 October 2026: Phase 1 build

145 tests, 7 browser click-throughs, production build, production safety. Bugs caught then: a County Director officer filter that would have shown unassigned CSOs nationwide; seed appraisal data in the wrong term; the mobile menu button showing on desktop; the typeface loaded from Google Fonts.

## Not verifiable in this environment

- `npm run db:drift`: Prisma's migration engine could not be downloaded here, so the hand-written migrations' index and constraint names are confirmed by CI or a one-off run. Every table and column is exercised by the tests.
- The Docker image and the Render deploy were written but not run here. The commands they run (`npm ci`, `npm run build`, `prisma migrate deploy`, `node prisma/seed.js`, `node src/server.js`) are the ones exercised above, apart from `prisma migrate deploy` (see the first point).
