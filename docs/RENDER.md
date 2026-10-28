# Trying TMGS on Render

`render.yaml` sets up everything: one web service that serves both the API and the web pages, and one PostgreSQL database. Nothing else is needed: no separate frontend service, no cron job, no disk.

## Use test data only

Render's nearest region to Kenya is Frankfurt, so data hosted there leaves the country. That is fine for trying the product with invented records. **Do not load real teacher records into the Render trial.** Real data belongs on Kenya-based hosting once the data protection impact assessment is done (see DEPLOYMENT.md and DATA-PROTECTION.md).

## Deploy

1. Push this repository to GitHub.
2. In Render: **New → Blueprint**, choose the repository. Render reads `render.yaml`.
3. Render asks for two values:
   - `BOOTSTRAP_ADMIN_EMAIL`: your email, used as the first National Admin's sign-in.
   - `BOOTSTRAP_ADMIN_PASSWORD`: a temporary password of 12 or more characters.
4. Select **Apply**. The first build takes about 5 minutes. When it finishes, the service is live at `https://tsc-tmgs.onrender.com` (Render adds a suffix if that name is taken; the dashboard shows the address).

What happens on every start, in order: database migrations apply; reference data loads (8 regions, 47 counties, 10 rule settings); the first National Admin is created if, and only if, there are no officers yet; the server starts. Steps two and three are safe to repeat.

## First sign-in

1. Open the address. Sign in with the bootstrap email and password.
2. Set up two-step sign-in: scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, or similar) and enter the code.
3. Go to **Rules and settings** and change your password.
4. In Render, open the service's **Environment** tab and delete `BOOTSTRAP_ADMIN_PASSWORD`. It is never used again once an officer exists, but it should not sit in the environment.

The dashboard then shows the setup steps in order: add sub-counties, add schools, add officers, register or import teachers, confirm the rule thresholds.

## Good to know about the free tier

| Behaviour | Effect on TMGS |
| --- | --- |
| The service sleeps after 15 minutes without visits | The first visit after a pause takes up to a minute while it wakes. |
| No persistent disk | Nothing is lost: uploaded document files are stored in the database. |
| Free PostgreSQL expires after 30 days (check Render's current terms) | Upgrade the database plan before then if the trial should continue; otherwise the data is deleted. |
| Cron jobs are a paid feature | Not needed: the compliance scan runs inside the app once a day, catching up when the service wakes. |

## Secrets

Render generates `JWT_OFFICER_SECRET`, `JWT_TEACHER_SECRET`, `DATA_ENCRYPTION_KEY` and `NATIONAL_ID_PEPPER` once and keeps them across deploys. Never regenerate `DATA_ENCRYPTION_KEY` after sensitive records exist: they would become unreadable. Copy its value somewhere safe.

## Moving from Render to Kenya-based hosting

The same repository runs with Docker on any host (`docker compose up -d --build`, see DEPLOYMENT.md). To carry trial data across, `pg_dump` the Render database and restore it on the new host, and set the same `DATA_ENCRYPTION_KEY` and `NATIONAL_ID_PEPPER` there. Better still, start production with a fresh database and real records only.
