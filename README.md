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
npm run prisma:generate
npx prisma migrate deploy
npm run seed:senders
npm run dev
```

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
- Elasticsearch indexing is non-blocking; `npm run reindex` rebuilds it from PostgreSQL.

If enqueueing fails after the database commit, Sendora preserves the campaign and performs targeted queue recovery. The API returns `202` with `persisted: true` and `queueStatus: "pending_reconciliation"` if jobs remain missing.

## Exactly-once limitation

A deterministic `Message-ID` improves correlation but does not guarantee provider-side deduplication. If SMTP accepts a message and the process crashes before PostgreSQL is updated to `sent`, recovery can submit it again. Sendora provides strong duplicate avoidance, not absolute exactly-once delivery across ordinary SMTP and PostgreSQL.

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
