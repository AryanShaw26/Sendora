# Sendora --- Intelligent Email Scheduling & Delivery Platform

Sendora is a full-stack email scheduling platform for composing
campaigns, scheduling messages, distributing sends across multiple SMTP
senders, monitoring queue activity, and receiving Slack notifications
when sender rate limits are reached.

It uses React, Express, PostgreSQL, Redis, BullMQ, Nodemailer, Ethereal
Email, and Elasticsearch.

> **Email testing note:** Sendora uses Ethereal Email for test SMTP.
> Messages are captured for preview and are not delivered to recipients'
> real inboxes.

## 1. Features

### Backend

-   Express REST API built with TypeScript.
-   Campaign and email persistence using PostgreSQL and Prisma.
-   Delayed email scheduling using BullMQ and Redis.
-   Multiple Ethereal SMTP sender accounts with round-robin assignment.
-   Configurable worker concurrency.
-   Per-sender minimum delay between send starts.
-   Atomic hourly rate limiting using Redis Lua scripts.
-   Automatic deferral of jobs that exceed sender hourly limits.
-   Slack notifications for rate-limit events.
-   Queue reconciliation after service restarts.
-   Atomic database claims to reduce duplicate processing.
-   SMTP retries with exponential backoff.
-   Elasticsearch email indexing and search.
-   Bull Board queue monitoring.
-   Google OAuth authentication with HTTP-only JWT cookie sessions.

### Frontend

-   Responsive React dashboard and Google sign-in.
-   Dashboard navigation and user menu.
-   Email composition interface.
-   Recipient entry and CSV/TXT upload.
-   Campaign scheduling with configurable timing and hourly limits.
-   Scheduled, sent, and failed email views.
-   Campaign progress and status tracking.
-   Email detail view with Ethereal preview links.
-   Email search.
-   Slack connection, status, test notification, and disconnect
    controls.
-   Sender account information and Bull Board navigation.
-   Loading, empty, and error states.

## 2. Technology Stack

  Component          Technology
  ------------------ ------------------------------
  Frontend           React, TypeScript, Vite
  Styling            Tailwind CSS
  Backend            Node.js, Express, TypeScript
  Database           PostgreSQL
  ORM                Prisma
  Queue              BullMQ
  Queue storage      Redis
  Email transport    Nodemailer
  SMTP testing       Ethereal Email
  Search             Elasticsearch
  Authentication     Google OAuth, JWT
  Notifications      Slack
  Queue monitoring   Bull Board
  Deployment         Vercel, Render, Neon

## 3. Project Structure

``` text
Sendora/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── scripts/
│   │   ├── seed-senders.ts
│   │   ├── start-all.js
│   │   ├── reindex.ts
│   │   └── load-test.ts
│   ├── src/
│   │   ├── config/
│   │   ├── db/
│   │   ├── redis/
│   │   ├── queue/
│   │   ├── workers/
│   │   ├── services/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── server.ts
│   │   └── worker.ts
│   ├── tests/
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── types/
│   ├── package.json
│   └── .env.example
├── docker-compose.yml
├── README.md
└── report.md
```

## 4. Prerequisites

Install: - Node.js 20 or later - npm - Docker Desktop with Docker
Compose - Git

You will also need credentials for the services you enable: PostgreSQL,
Redis, Google OAuth, Slack OAuth, and Ethereal sender accounts (created
by the sender seeder).

## 5. Run Locally

### 5.1 Clone the repository

``` bash
git clone https://github.com/AryanShaw26/Sendora.git
cd Sendora
```

### 5.2 Start infrastructure

From the repository root:

``` bash
docker compose up -d
docker compose ps
```

Check Redis:

``` bash
docker compose exec redis redis-cli ping
```

Expected response:

``` text
PONG
```

Check PostgreSQL:

``` bash
docker compose exec postgres pg_isready -U sendora
```

The project's Docker Compose configuration exposes PostgreSQL on host
port `5433`, Redis on `6379`, and Elasticsearch on `9200`.

### 5.3 Configure and run the backend

``` bash
cd backend
cp .env.example .env
```

Fill in the required values described in [Environment
Variables](#6-environment-variables), then install dependencies and
prepare Prisma:

``` bash
npm install
npm run prisma:generate
npx prisma migrate deploy
```

Create the configured Ethereal sender accounts:

``` bash
npm run seed:senders
```

Start the API and worker:

``` bash
npm run dev
```

The development command starts the API and worker together. They can
also be started separately:

``` bash
npm run dev:api
```

``` bash
npm run dev:worker
```

The API listens on port `4000` by default.

### 5.4 Configure and run the frontend

Open a second terminal:

``` bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

The frontend environment file should point to the backend API:

``` env
VITE_API_BASE_URL=http://localhost:4000
```

## 6. Environment Variables

Use the committed `.env.example` files as the source of truth for the
exact variables required by the current application. Never commit real
`.env` files or secrets.

The following are the principal backend settings.

### General

``` env
NODE_ENV=development
PORT=4000
LOG_LEVEL=info
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:4000
```

### PostgreSQL

For the Docker Compose database, use the connection details configured
in `docker-compose.yml`. The documented host port is `5433`.

Example:

``` env
DATABASE_URL=postgresql://sendora:sendora@localhost:5433/sendora?schema=public
```

For hosted PostgreSQL, use the provider's connection string and required
SSL options.

### Redis

``` env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
QUEUE_NAME=email-queue
```

For hosted Redis, configure its hostname, port, password, and TLS
options according to the provider and backend environment schema. Do not
use `localhost` for a remote production Redis service.

### Elasticsearch

``` env
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_INDEX=emails
```

If Elasticsearch is disabled in a deployment, use the application's
supported configuration for disabling it.

### Google OAuth

``` env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback
```

Create a Google OAuth web client and add this local authorized redirect
URI:

`http://localhost:4000/auth/google/callback`

For production, configure the exact production API callback URL in
Google Cloud Console and in the backend environment.

### Session and encryption

``` env
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
COOKIE_SECURE=false
ENCRYPTION_KEY=
```

`ENCRYPTION_KEY` must be a 32-byte key represented as 64 hexadecimal
characters. Generate one with:

``` bash
openssl rand -hex 32
```

Use `COOKIE_SECURE=true` when serving the application over HTTPS.

### Slack OAuth

``` env
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback
```

Create a Slack application, configure the OAuth redirect URL, and enable
the incoming-webhook permission required by the integration.

For local OAuth testing, use an HTTPS tunnel and configure its exact
callback URL in both the Slack application and backend environment. For
production, use the production API callback URL.

### Ethereal SMTP

``` env
ETHEREAL_SENDER_COUNT=3
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
```

### Scheduler and worker

``` env
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
DEFAULT_HOURLY_LIMIT=100
EMAIL_MAX_ATTEMPTS=3
STALE_PROCESSING_MS=120000
RECOVERY_ON_BOOT=true
```

These settings configure worker parallelism, minimum send spacing,
sender hourly limits, SMTP retry count, stale-processing recovery, and
boot-time reconciliation.

### Bull Board

``` env
BULL_BOARD_PATH=/admin/queues
```

### Frontend

`frontend/.env`:

``` env
VITE_API_BASE_URL=http://localhost:4000
```

## 7. Ethereal Email Setup

Sendora uses [Ethereal Email](https://ethereal.email/) as a test SMTP
service. It captures messages and provides browser preview pages; it
does not deliver messages to recipients' real inboxes.

Create sender accounts from the backend directory:

``` bash
npm run seed:senders
```

The seeder creates and stores the configured number of Ethereal
accounts. The default target is three:

``` env
ETHEREAL_SENDER_COUNT=3
```

Recipients are assigned across active senders using round-robin
distribution. Run the seeder once per database environment, then reuse
the stored sender records. Do not repeatedly seed production unless you
intend to add or repair sender accounts.

After a successful SMTP send:

1.  Open the **Sent** page in Sendora.
2.  Open the email details.
3.  Follow the Ethereal preview URL.

You can also sign in to the Ethereal web interface using the generated
account credentials:

`https://ethereal.email`

A successful Ethereal send means the test SMTP server accepted the
message for preview. It does not mean the recipient received a real
email.

## 8. Architecture Overview

### 8.1 Scheduling flow

Sendora uses BullMQ delayed jobs. It does not depend on a cron-based
email scheduler.

1.  An authenticated user submits a campaign through the React
    dashboard.
2.  The frontend sends campaign details to the Express API.
3.  The API validates and deduplicates recipient addresses.
4.  A campaign record and individual email records are persisted in
    PostgreSQL.
5.  Each email is assigned a sender and scheduled timestamp.
6.  A BullMQ delayed job is created for each email.
7.  The job ID is the corresponding email record ID.
8.  When the job becomes due, a BullMQ worker processes it.
9.  Nodemailer submits the message to Ethereal SMTP.
10. The application records the send outcome and, when available, the
    Ethereal preview URL.

``` text
React Dashboard
      |
      v
Express API
      |
      v
PostgreSQL  <---- durable campaign and email records
      |
      v
BullMQ + Redis
      |
      v
Background Worker
      |
      v
Nodemailer
      |
      v
Ethereal SMTP
      |
      v
Preview URL
```

### 8.2 Persistence and restart recovery

PostgreSQL is the durable source of truth for campaign and email
records. BullMQ uses Redis to store and coordinate scheduled jobs.

Queue reconciliation helps restore eligible work:

1.  The API or worker starts.
2.  Reconciliation reads eligible scheduled and processing email records
    from PostgreSQL.
3.  It checks Redis for a corresponding BullMQ job.
4.  If a job is missing, it can be re-enqueued with the deterministic
    email ID.
5.  Processing records older than the configured stale threshold are
    evaluated by the worker's recovery safeguards.

This supports recovery after process restarts and helps rebuild missing
queue jobs from database state.

**Deployment consideration:** Redis persistence depends on the Redis
provider and plan. A Redis instance without durable persistence can lose
queued job data on restart; PostgreSQL reconciliation is intended to
restore eligible jobs. SMTP outcomes that are uncertain must not be
blindly treated as unsent.

### 8.3 Rate limiting

Hourly limits are enforced per sender. Redis Lua scripts provide atomic
counter updates so multiple workers coordinate against the same sender
limit.

Example with an hourly limit of three:

``` text
Sender A — hourly limit: 3

Email 1  -> Sent
Email 2  -> Sent
Email 3  -> Sent
Email 4  -> Deferred to the next UTC hour window
Email 5  -> Deferred to the next UTC hour window
```

When a sender reaches its hourly limit, additional eligible jobs are
deferred rather than marked failed solely because the limit was reached.
A Slack notification can be sent for connected users.

Relevant settings:

``` env
MAX_EMAILS_PER_HOUR_PER_SENDER=200
DEFAULT_HOURLY_LIMIT=100
```

### 8.4 Concurrency and send spacing

BullMQ worker concurrency controls how many jobs a worker can process
simultaneously:

``` env
WORKER_CONCURRENCY=5
```

Sendora also uses a Redis-backed per-sender send lock to enforce minimum
spacing between send starts:

``` env
MIN_DELAY_BETWEEN_EMAILS_MS=2000
```

The default delay is two seconds. This helps prevent concurrent workers
from starting sends through the same sender too frequently.

### 8.5 Duplicate avoidance and SMTP limitations

Sendora uses deterministic BullMQ job IDs based on email IDs, atomic
database claims before processing, Redis coordination for sender-level
limits and spacing, and deterministic SMTP `Message-ID` values.

These mechanisms reduce duplicate processing, including when multiple
workers are active.

However, SMTP delivery and a PostgreSQL update cannot be committed as
one atomic transaction. If the SMTP server accepts a message and the
application crashes before recording the successful outcome, the final
delivery state may be uncertain. A deterministic `Message-ID` helps
correlate messages but does not guarantee provider-side deduplication.
Sendora therefore does not claim absolute exactly-once SMTP delivery.

## 9. Slack Integration

Slack notifications can alert users when a sender reaches its hourly
sending limit.

1.  Create a Slack application.
2.  Configure the OAuth redirect URL.
3.  Enable the incoming-webhook permission.
4.  Add the Slack client ID, client secret, and redirect URI to the
    backend environment.
5.  Restart or redeploy the backend after changing environment
    variables.
6.  Open **Settings** in Sendora.
7.  Choose **Connect Slack** and complete authorization.
8.  Use the test-message option to verify the connection.

The integration stores the webhook URL encrypted by the backend.

For local OAuth testing, use an HTTPS tunnel and register its exact
callback URL with Slack.

## 10. Bull Board Queue Monitoring

Bull Board provides a live view of the BullMQ queue.

Default route:

``` text
/admin/queues
```

Depending on the current queue state, it can display waiting, active,
delayed, completed, and failed jobs.

The route is protected by the application's authentication middleware.
Use it to inspect whether scheduled work is waiting, being processed,
completed, or failing.

## 11. Elasticsearch Search

Sendora can index email records in Elasticsearch and expose an email
search endpoint.

Example:

``` text
GET /api/emails/search?q=welcome
```

Elasticsearch is used for search and indexing; PostgreSQL remains the
source of truth for campaign and email records. Indexing failures are
designed not to block the core scheduling flow. The reindex script can
rebuild the index from persisted data:

``` bash
cd backend
npm run reindex
```

## 12. Useful API Routes

These are key application routes; consult backend route definitions for
exact request and response schemas.

  Method     Endpoint               Purpose
  ---------- ---------------------- ---------------------------
  `POST`     `/api/schedule`        Schedule a campaign
  `GET`      `/api/emails`          Retrieve email records
  `GET`      `/api/emails/search`   Search emails
  `GET`      `/api/senders`         Retrieve sender accounts
  `GET`      `/api/slack/connect`   Start Slack OAuth
  `GET`      `/api/slack/status`    Check Slack connection
  `POST`     `/api/slack/test`      Send a Slack test message
  `DELETE`   `/api/slack`           Disconnect Slack
  `GET`      `/admin/queues`        Open Bull Board

## 13. Load Testing

The backend includes a load-test script for creating campaigns with
large recipient lists.

``` bash
cd backend
npm run load-test -- 1200 50
```

The example arguments represent 1,200 recipients and an hourly limit of
50. Set `LOAD_TEST_USER_ID` to an existing user if the script requires
one.

Use a non-production environment for load tests unless you have
explicitly prepared production data and queue capacity for the test.

## 14. Verification

Backend tests:

``` bash
cd backend
npm test
```

Backend build:

``` bash
npm run build
```

Frontend build:

``` bash
cd frontend
npm run build
```

### Restart-recovery check

Perform this test in a controlled environment:

1.  Schedule emails for a future time.
2.  Stop the API and worker.
3.  Restart the API and worker.
4.  Verify reconciliation restores eligible missing jobs.
5.  Inspect Bull Board and email records to confirm processing outcomes.

Do not use messages with uncertain SMTP outcomes as proof of safe retry
behavior.

## 15. Deployment

The demonstration deployment uses:

  -----------------------------------------------------------------------
  Component                           Hosting
  ----------------------------------- -----------------------------------
  React frontend                      Vercel

  Express API                         Render

  BullMQ worker                       Runs alongside the API in the
                                      existing Render web service

  PostgreSQL                          Neon

  Redis                               Render Key Value

  Test SMTP                           Ethereal Email
  -----------------------------------------------------------------------

The production API and worker must share the same PostgreSQL database
and Redis queue configuration.

The production launcher starts the API and worker as separate child
processes:

``` bash
node scripts/start-all.js
```

Configure the Render Docker Command to use this launcher when the
deployed Docker image includes the script. The launcher forwards
child-process logs and handles shutdown signals.

Free hosting services may sleep or restart. Background processing is
therefore not guaranteed to run continuously while a free web service is
asleep.

## 16. Known Limitations

-   Ethereal is a test SMTP service. It does not deliver messages to
    real recipient inboxes.
-   SMTP acceptance and database updates cannot be made one atomic
    transaction; a crash between them can leave an uncertain outcome.
-   Exactly-once delivery across ordinary SMTP and PostgreSQL cannot be
    guaranteed.
-   Redis durability depends on the hosting plan and persistence
    configuration.
-   Free hosting services may sleep or restart, affecting continuous
    processing.
-   Google OAuth and Slack require valid external credentials and
    correctly configured callback URLs.
-   Elasticsearch is an optional search dependency, not the source of
    truth for email records.
-   Actual production behavior should be verified using the deployed
    environment; local test results alone do not prove production
    availability.

## 17. Security Notes

-   Never commit `.env` files or production secrets.
-   Keep Google and Slack client secrets private.
-   Use strong random JWT and encryption keys.
-   Use HTTPS and secure cookies in production.
-   Restrict access to Bull Board.
-   Use production database credentials only in trusted deployment
    environments.
-   Rotate any credential that has been accidentally exposed.

## 18. Project Goals

Sendora demonstrates practical full-stack and backend engineering
concepts:

-   Asynchronous job processing.
-   Delayed scheduling.
-   Distributed queue coordination.
-   PostgreSQL-backed persistence.
-   Restart reconciliation.
-   Rate limiting.
-   Configurable concurrency.
-   SMTP integration.
-   OAuth authentication.
-   Slack notifications.
-   Search indexing.
-   Queue observability.
-   Responsive dashboard development.
