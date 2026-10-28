# Deployment

For a quick trial with test data, use Render instead: [RENDER.md](RENDER.md).

## Hosting

TMGS holds public-service personnel data, including sensitive data. For real records, host it in Kenya, on a government data centre or a Kenyan provider, so the Data Protection (General) Regulations, 2021 on processing for public purposes are met. Confirm the requirement with the Office of the Data Protection Commissioner during the impact assessment.

Pilot sizing (one county, a few thousand teachers): 2 vCPU, 4 GB RAM, 50 GB disk is ample. Uploaded files live in the database, so size the database for them (10 MB maximum per file). At national scale use a managed PostgreSQL with replicas; the app itself is stateless and scales horizontally, and the built-in rules schedule uses a database lock so only one instance runs each scan.

## Install (one host, Docker)

```bash
git clone <repo> /srv/tsc-tmgs && cd /srv/tsc-tmgs
cp .env.example .env
bash deploy/generate-secrets.sh >> .env      # then delete the empty duplicate keys above them
nano .env                                      # set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD
mkdir -p deploy/certs                          # fullchain.pem and privkey.pem for the domain
docker compose up -d --build
docker compose logs -f app
```

The log shows, in order: migrations applied, reference data loaded, the first National Admin created, the server listening. Then:

1. Open the domain and sign in with the bootstrap email and password.
2. Set up two-step sign-in, then change the password under **Rules and settings**.
3. Remove `BOOTSTRAP_ADMIN_PASSWORD` from `.env` and run `docker compose up -d` again. It is ignored once any officer exists, but should not stay on disk.
4. Follow the setup steps on the dashboard: sub-counties, schools, officers, teachers, rule thresholds.

## What runs where

| Piece | How it runs |
| --- | --- |
| Web pages | Exported to static files at build time and served by the app |
| API | The same Node.js process, under `/api` |
| Document files | Stored in PostgreSQL (`DocumentFile` table) |
| Compliance scan | Inside the app, once every `RULES_INTERVAL_HOURS` (default 24), with a database lock |
| TLS | nginx (`deploy/nginx.conf`) in front of the app |

## Backups

Install `deploy/backup-and-rules.cron` on the host. It dumps the database nightly (this includes document files) and keeps 30 days. Copy backups off the host too. The cron's rules line is optional: the app already runs the scan itself.

## Secrets

| Variable | What it protects | If lost or leaked |
| --- | --- | --- |
| `JWT_OFFICER_SECRET` | Officer sessions | Rotate: everyone signs in again |
| `JWT_TEACHER_SECRET` | Teacher sessions | Rotate: teachers sign in again |
| `DATA_ENCRYPTION_KEY` | Sensitive records and two-step secrets | **Lost: encrypted records cannot be read.** Keep in a key vault, backed up separately from the database |
| `NATIONAL_ID_PEPPER` | National-ID match keys | Changing it breaks portal registration for teachers not yet registered |

The app refuses to start in production if any secret is a development value or if two-step sign-in is off.

## Updating

```bash
git pull && docker compose up -d --build
```

Migrations apply on start. Take a backup first.

## Without Docker

Node 22 and PostgreSQL 16 on the host. Build the pages with `npm ci && npm run build` in `frontend/`. In `backend/`: `npm ci`, then run `npx prisma migrate deploy && node prisma/seed.js && node src/server.js` under systemd with the environment from `backend/.env.example`. Put nginx in front with `proxy_pass http://127.0.0.1:4000`.
