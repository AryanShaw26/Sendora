# Sendora

Sendora is a persistent email scheduling and dashboard application using PostgreSQL, BullMQ/Redis, Ethereal SMTP, Elasticsearch, and React.

## Prerequisites

- Node.js 20+
- Docker with Docker Compose
- npm

## Start infrastructure

```bash
docker compose up -d
docker compose ps
docker compose exec redis redis-cli ping
docker compose exec postgres pg_isready -U sendora
curl http://localhost:9200
```

PostgreSQL is exposed on host port `5433`, Redis on `6379`, and Elasticsearch on `9200`.

## Backend setup

```bash
cd backend
cp .env.example .env
npm install
# Replace JWT_SECRET and ENCRYPTION_KEY with separate random values (Node.js):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run prisma:generate
npx prisma migrate deploy
npm run seed:senders
npm run dev
```

Paste one generated value into `JWT_SECRET` and generate a second value for `ENCRYPTION_KEY`.

`npm run dev` starts the API on port `4000` and the worker. Use `npm run dev:api` or `npm run dev:worker` to start them separately.

## Frontend setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

## Google OAuth

Create a Google OAuth web client and configure:

- Redirect URI: `http://localhost:4000/auth/google/callback`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

With credentials absent, the app provides a development demo login route.

## Slack

Create a Slack app using incoming-webhook OAuth and set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_REDIRECT_URI`. For local OAuth testing, use an HTTPS tunnel and configure the exact tunnel callback URI in both Slack and `.env`.

## Ethereal

`npm run seed-senders` creates and stores three Ethereal sender accounts by default. Sent emails are assigned round-robin across active senders, and the dashboard detail drawer exposes each Ethereal preview URL.

## Architecture and behavior

- Scheduling uses BullMQ delayed jobs only; no cron or cron-like sending logic is used.
- PostgreSQL is the source of truth; campaigns and emails survive API, worker, and Redis restarts.
- BullMQ `jobId` is always `email.id`.
- Boot reconciliation re-enqueues scheduled or processing database rows missing from Redis.
- Processing rows become claimable after `STALE_PROCESSING_MS`.
- Database claims provide atomic duplicate avoidance across workers.
- Hourly counters use Redis Lua scripts.
- Send-start spacing uses a Redis lock and is acquired immediately before SMTP invocation.
- Defaults: 5 workers, 2000 ms send spacing, and 200 emails per sender per UTC hour.
- SMTP retries use explicit exponential backoff without consuming BullMQ attempts.
- BullMQ retries uncaught infrastructure failures with bounded exponential backoff and jitter; reconciliation revives failed jobs a limited number of times.
- A durable `SMTP_OUTCOME_UNKNOWN` marker prevents automatic resend when SMTP may have accepted a message but PostgreSQL did not confirm `sent`. Such emails require operator review.
- Elasticsearch indexing is non-blocking; `npm run reindex` rebuilds it from PostgreSQL.

If enqueueing fails after the database commit, Sendora preserves the campaign and performs targeted queue recovery. The API returns `202` with `persisted: true` and `queueStatus: "pending_reconciliation"` if jobs remain missing.

## SMTP delivery ambiguity

A deterministic `Message-ID` does not guarantee provider-side deduplication. Before SMTP is called, Sendora durably marks the email outcome as uncertain. If SMTP accepts the message but the database update fails, automatic retries and reconciliation skip that email to avoid duplicates. If the process crashes after writing the marker but before sending, the message may not be delivered. Inspect and resolve marker-bearing emails manually; exactly-once delivery cannot be guaranteed across SMTP and PostgreSQL.

## Production deployment

The production Compose file deploys the frontend, API, and a persistent BullMQ worker only. PostgreSQL, Redis, and Elasticsearch must be provisioned as managed, authenticated services; the development `docker-compose.yml` and its credentials are not for production.

1. Copy `backend/.env.production.example` to `backend/.env.production` and fill in unique secrets and managed-service connection details. Keep the production file out of version control.
2. Set `FRONTEND_URL`, `BACKEND_URL`, and the OAuth callback URLs to their public HTTPS origins. Configure `VITE_API_BASE_URL` to the public API origin at frontend build time.
3. Ensure PostgreSQL and Redis are persistent. Enable Redis TLS and authentication; configure Elasticsearch HTTPS and credentials. Use the same backend production environment file for API and worker.
4. Build and migrate once, then start the long-running services:

```powershell
Copy-Item backend\.env.production.example backend\.env.production
$env:VITE_API_BASE_URL = "https://api.example.com"
docker compose -f deploy\compose.production.yml build
docker compose -f deploy\compose.production.yml run --rm migrate
docker compose -f deploy\compose.production.yml up -d
```

The API and frontend bind to loopback ports `4000` and `8080`; put them behind a TLS-terminating reverse proxy and route the public frontend/API hostnames to those ports. Keep at least one worker replica running continuously; do not run it as a short-lived or scale-to-zero function. Run `prisma migrate deploy` as a release step, not on every API or worker startup.

Production configuration is documented in `backend/.env.production.example`. Generate `JWT_SECRET` and `ENCRYPTION_KEY` with cryptographically secure random values. Google OAuth credentials are required by the production configuration; Slack OAuth is optional. Ethereal remains the configured test mailbox service and does not provide real production email delivery; do not use it to deliver real customer mail.

## Load test

```bash
cd backend
npm run load-test -- 1200 50
```

The optional arguments are recipient count and hourly limit. `LOAD_TEST_USER_ID` may be set to an existing user.

## Verification

```bash
cd backend
npm test
npm run build

cd ../frontend
npm run build
```
