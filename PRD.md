# PRD — Production-Grade Email Scheduler Service + Dashboard

> **Audience:** an AI coding agent that will implement this project end-to-end.
> **Companion files:** `implementation_guide.md` (step-by-step build order), `design.md` (UI/visual spec — **provided; the frontend must follow it**, see §12).
> **Deliverable at the end:** a working monorepo + `README.md` + `report.md` (see §15).

---

## 0. Agent Operating Rules (read first)

1. Read this PRD fully, then `implementation_guide.md`, then start building. Follow the phase order in the guide.
2. **Hard constraints (never violate):**
   - ❌ No cron of any kind (no `crontab`, `node-cron`, `agenda`, `cron` npm package, `setInterval`-based schedulers for sending). Scheduling is done **only** with BullMQ delayed jobs.
   - ✅ Persistence across restarts: delayed jobs live in Redis; DB is the source of truth.
   - ✅ Strong duplicate avoidance: deterministic BullMQ `jobId`, atomic database claims and stale-claim recovery prevent concurrent duplicate processing. Ordinary SMTP plus a separate PostgreSQL transaction cannot provide absolute exactly-once delivery; document the ambiguous SMTP-accepted/DB-not-updated window explicitly.
   - ✅ Rate-limit counters live in Redis (not in memory) and are atomic.
   - ✅ Everything configurable via env (no hardcoded limits/delays/concurrency).
3. TypeScript `strict: true` in both backend and frontend. No `any` unless justified in a comment.
4. Where external credentials are missing (Google, Slack), implement the full flow anyway, make it work with env values, and mark that item **"implemented, unverified (credentials not available)"** in `report.md`. Never fake/mock these flows.
5. Commit after each phase with a clear message. Keep commits small.
6. When finished, write `report.md` in the repo root using the template in §15. Be honest about gaps — an accurate report is worth more than a flattering one.
7. Do not commit `.env`. Commit `.env.example` files.
8. The frontend must follow `design.md` (Gmail-inspired, white + shades of red). Where `design.md` and this PRD differ on **frontend routes, layout or visuals**, `design.md` wins. On **backend behaviour, API, schema and env**, this PRD wins.

---

## 1. Product Overview

**Sendora Email Scheduler** accepts email-send requests, stores them in a relational DB, schedules them with **BullMQ delayed jobs** (Redis-backed), and sends them via **Ethereal Email (fake SMTP)** from multiple senders. A React dashboard lets a Google-authenticated user compose/schedule campaigns, view scheduled and sent emails, connect Slack for rate-limit alerts, and (backend) search emails through Elasticsearch and watch queues in a live Bull Board dashboard.

### 1.1 Goals
- Reliable scheduled sending that survives server restarts without loss or duplication.
- Behaves sensibly under load (1000+ emails at the same time, hourly limits exceeded).
- Clean, well-structured TypeScript backend and frontend.

### 1.2 Non-Goals
- Real email deliverability, bounce handling, open/click tracking, unsubscribe flows.
- Multi-tenant billing, roles/permissions beyond "each user sees only their own data".
- Actually sending thousands of emails through Ethereal.

---

## 2. Functional Requirements

### 2.1 Backend

| ID | Requirement |
|----|-------------|
| B1 | REST API to schedule a campaign (subject, body, list of recipient emails, start time, delay between emails, hourly limit). |
| B2 | Persist campaigns and individual emails in PostgreSQL. |
| B3 | For each email create a BullMQ **delayed job** (`delay = scheduledAt - now`), `jobId = email.id`. |
| B4 | Send via Ethereal SMTP using **multiple senders** (default 3, created via `nodemailer.createTestAccount()` in a seed script and stored in DB). |
| B5 | Worker with **configurable concurrency** (`WORKER_CONCURRENCY`). |
| B6 | **Minimum spacing between SMTP send starts per sender** (`MIN_DELAY_BETWEEN_EMAILS_MS`), enforced cluster-wide with a Redis reservation acquired immediately before each SMTP call. |
| B7 | **Hourly rate limit per sender** (`MAX_EMAILS_PER_HOUR_PER_SENDER`, optionally lowered per campaign), Redis atomic counter keyed by `sender + UTC hour window`. Over-limit jobs are **rescheduled into the next hour window, never dropped or failed**. |
| B8 | **Slack notification** when a sender's hourly limit is hit (OAuth-connected per user; skip silently if not connected). |
| B9 | **Persistence/restart safety**: after restart, future emails still send at the right time; boot-time reconciliation re-enqueues DB rows missing from the queue. Strong duplicate avoidance is required, with the SMTP-accepted/DB-not-updated ambiguity documented as an unavoidable limitation for ordinary SMTP. |
| B10 | **Idempotency**: DB atomic claim + deterministic `jobId` + deterministic SMTP `Message-ID`. |
| B11 | **Elasticsearch** indexing of every email (create + status change) and a search endpoint. |
| B12 | **Bull Board** live dashboard mounted at `/admin/queues` (auth-protected). |
| B13 | Google OAuth login (real), session via httpOnly JWT cookie. |
| B14 | Retry transient SMTP failures (exponential backoff, `EMAIL_MAX_ATTEMPTS`); mark `failed` with error message after final attempt. |

### 2.2 Frontend

| ID | Requirement |
|----|-------------|
| F1 | Real Google login → redirect to dashboard. Header shows user **name, email, avatar** + **Logout**. |
| F2 | Dashboard shell with a sidebar (**Scheduled Emails**, **Sent Emails**, Campaigns, Settings), a header with search, and a primary **Compose New Email** button in the sidebar. |
| F3 | Compose as a Gmail-style floating compose window (`design.md` §7): subject, body, CSV/TXT lead upload with **detected email count**, start time, delay between emails, hourly limit, **Schedule** button. |
| F4 | Scheduled table: Email, Subject, Scheduled time, Status. Loading state + empty state. |
| F5 | Sent table: Email, Subject, Sent time, Status (`sent`/`failed`). Loading state + empty state. |
| F6 | "Connect Slack" / "Disconnect Slack" control with connection status. |
| F7 | Toast notifications + basic error handling. Auto-refresh (polling) of tables. |
| F8 | Clean folder structure, reusable UI components, DRY, typed API responses/props. |
| F9 | Visual design follows `design.md` (Gmail-inspired, white + shades of red): tokens, typography, components, responsive behaviour, accessibility. |
| F10 | Public pages: **landing page** (`/`), **login** (`/login`) and **register** (`/register`) pages (both start Google OAuth; no password fields), and a 404 page. |
| F11 | Additional app pages: **Campaigns** (progress per campaign), **Search** (Elasticsearch results), **Settings** (Slack connect/disconnect/test, senders list, queue-dashboard link, account), and an **email detail drawer**. |

---

## 3. Tech Stack

### 3.1 Backend
| Concern | Choice |
|---|---|
| Runtime | Node.js 20 LTS |
| Language | TypeScript 5.x (`strict`) |
| Framework | Express 4.x |
| Queue | BullMQ 5.x + `ioredis` 5.x (Redis 7) |
| Database | PostgreSQL 16 |
| ORM | Prisma (latest stable) |
| SMTP | Nodemailer 6.x → Ethereal (`smtp.ethereal.email:587`) |
| Search | Elasticsearch 8.x + `@elastic/elasticsearch` |
| Queue dashboard | `@bull-board/api` + `@bull-board/express` |
| Auth | `google-auth-library` (OAuth2 auth-code flow) + `jsonwebtoken` + `cookie-parser` |
| Validation | `zod` |
| HTTP misc | `cors`, `helmet`, `axios` (Slack calls) |
| Logging | `pino` (+ `pino-pretty` in dev) |
| Dev tooling | `tsx` (dev runner), `tsc` (build), `eslint`, `prettier`, `vitest` (tests) |
| Process manager | `concurrently` for running API + worker in dev |

### 3.2 Frontend
| Concern | Choice |
|---|---|
| Build tool | Vite |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS 3.4 |
| Routing | `react-router-dom` 6 |
| Data fetching | `@tanstack/react-query` + `axios` (`withCredentials: true`) |
| CSV parsing | `papaparse` |
| Toasts | `react-hot-toast` |
| Icons | `lucide-react` |
| Fonts | Roboto + Poppins via Google Fonts `<link>` (see `design.md` §2.2) |
| Dates | `date-fns` |

### 3.3 Infra
Docker Compose with **Postgres, Redis (AOF persistence on), Elasticsearch (single node, security off for local dev)**.

---

## 4. System Architecture

### 4.1 Components

```
┌────────────────────┐        HTTPS/JSON (cookie auth)        ┌──────────────────────────────┐
│  React Dashboard   │ ─────────────────────────────────────▶ │  Express API (server.ts)     │
│  (Vite, Tailwind)  │ ◀───────────────────────────────────── │  - Auth (Google), Slack OAuth│
└────────────────────┘                                        │  - Schedule / list / search  │
                                                              │  - Bull Board (/admin/queues)│
                                                              └───────┬───────────┬──────────┘
                                                                      │           │
                                        Prisma (SQL)                  │           │ BullMQ add / addBulk
                                                                      ▼           ▼
                                                           ┌────────────────┐  ┌──────────────────────┐
                                                           │  PostgreSQL    │  │  Redis (AOF on)      │
                                                           │  source of     │  │  - BullMQ queue      │
                                                           │  truth         │  │  - rate counters     │
                                                           └───────▲────────┘  │  - sender send-locks │
                                                                   │           │  - slack dedupe keys │
                                                                   │           └──────────▲───────────┘
                                                                   │                      │
                                                     ┌─────────────┴──────────────────────┴───────┐
                                                     │  Worker process (worker.ts)                │
                                                     │  BullMQ Worker, concurrency = N            │
                                                     │  claim → lock → rate-limit → SMTP → update │
                                                     └───────┬──────────────────┬─────────────────┘
                                                             │                  │
                                                  Nodemailer │                  │ index/update
                                                             ▼                  ▼
                                                   Ethereal SMTP        Elasticsearch ("emails")
                                                                        Slack webhook (on limit hit)
```

The API and the worker are **separate entrypoints** of the same codebase (`src/server.ts`, `src/worker.ts`) so the worker can be scaled to multiple instances. All cross-instance coordination (rate limit, send delay, Slack dedupe) goes through Redis; all durable state goes through Postgres.

### 4.2 Core Flows

**A. Schedule flow**
1. `POST /api/schedule` (authenticated) with subject, body, `emails[]`, `startTime`, `delaySeconds`, `hourlyLimit`.
2. Validate (zod), dedupe & lowercase recipients, reject invalid addresses.
3. Create `Campaign`. For recipient index `i` (0-based): `scheduledAt = max(startTime, now) + i * delaySeconds`; `senderId = activeSenders[i % activeSenders.length].id` (round-robin).
4. Bulk insert `Email` rows (`status = scheduled`) in chunks of 1000, in one transaction.
5. After the database transaction commits, enqueue with `queue.addBulk` (chunks of 500): `{ name: 'send-email', data: { emailId }, opts: { jobId: email.id, delay: max(0, scheduledAt - now), attempts: 1, removeOnComplete: { age: 86400, count: 5000 }, removeOnFail: false } }`.
   (BullMQ-level `attempts` is 1; SMTP retry is handled explicitly in worker logic so that rate-limit deferrals never consume attempts. See §6.)
6. If enqueueing throws or only partially succeeds after the DB commit, do not delete or roll back the persisted campaign. Attempt an immediate targeted reconciliation for the campaign. If all jobs are confirmed enqueued, continue normally; if not, return `202 Accepted` with `{ campaignId, total, firstScheduledAt, lastScheduledAt, queueStatus: 'pending_reconciliation', persisted: true }`. Log the enqueue failure and let boot-time reconciliation retry. The client must display that the campaign is saved and pending queue recovery; it must not blindly resubmit the campaign.
7. Bulk-index into Elasticsearch (non-blocking; failures are logged and retried by reindex script, never fail the request).
8. On the normal path, return `201 { campaignId, total, firstScheduledAt, lastScheduledAt, queueStatus: 'queued', persisted: true }`.

**B. Worker flow (per job)** — see pseudocode in §6.

**C. Restart / recovery flow**
- Delayed jobs are stored in Redis (AOF persistence on) → they survive process and container restarts.
- On API boot (and optionally worker boot) run `reconcileQueue()`:
  - Select `Email` rows with `status IN ('scheduled','processing')`.
  - For each, `queue.getJob(email.id)`; if missing, re-add it with `delay = max(0, scheduledAt - now)` and the same `jobId`.
  - Rows stuck in `processing` longer than `STALE_PROCESSING_MS` are claimable again (see claim query in §6).
- Result: persisted DB rows are the recovery source. Reconciliation re-adds missing jobs using the same deterministic `jobId`; atomic DB claims prevent concurrent workers from processing the same row. This provides strong duplicate avoidance, not an absolute exactly-once guarantee across SMTP and PostgreSQL. The SMTP-accepted/DB-update crash window is documented in §6 and the README.

**D. Rate-limit flow** — see §7.

**E. Slack flow** — see §9.

**F. Auth flow** — see §8.

---

## 5. Database Configuration & Schema

### 5.1 PostgreSQL
- Version 16, database `sendora`, user `sendora`.
- Connection via `DATABASE_URL` (Prisma). Timestamps are stored in UTC (`timestamptz`).
- Migrations through `prisma migrate dev` (committed to repo).

### 5.2 Prisma schema (`backend/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum EmailStatus {
  scheduled
  processing
  sent
  failed
}

model User {
  id               String            @id @default(uuid())
  googleId         String            @unique
  email            String            @unique
  name             String
  avatarUrl        String?
  createdAt        DateTime          @default(now()) @db.Timestamptz
  campaigns        Campaign[]
  emails           Email[]
  slackIntegration SlackIntegration?
}

model Sender {
  id          String   @id @default(uuid())
  email       String   @unique        // Ethereal username (e.g. xyz@ethereal.email)
  displayName String
  smtpHost    String   @default("smtp.ethereal.email")
  smtpPort    Int      @default(587)
  smtpUser    String
  smtpPass    String                  // Ethereal fake creds; not sensitive, but never log
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now()) @db.Timestamptz
  emails      Email[]
}

model Campaign {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  subject      String
  body         String   @db.Text
  startTime    DateTime @db.Timestamptz
  delaySeconds Int
  hourlyLimit  Int
  totalEmails  Int
  createdAt    DateTime @default(now()) @db.Timestamptz
  emails       Email[]

  @@index([userId, createdAt])
}

model Email {
  id                  String      @id @default(uuid())
  campaignId          String
  campaign            Campaign    @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  userId              String
  user                User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  senderId            String
  sender              Sender      @relation(fields: [senderId], references: [id])
  recipient           String
  subject             String
  seq                 Int                                  // position within campaign (0-based), used for ordering
  status              EmailStatus @default(scheduled)
  scheduledAt         DateTime    @db.Timestamptz          // current intended send time (updated on deferral)
  originalScheduledAt DateTime    @db.Timestamptz          // never changes
  sentAt              DateTime?   @db.Timestamptz
  processingStartedAt DateTime?   @db.Timestamptz
  attempts            Int         @default(0)              // SMTP attempts made
  deferredCount       Int         @default(0)              // times deferred (rate limit / send-delay lock)
  messageId           String?                              // SMTP Message-ID
  previewUrl          String?                              // Ethereal preview URL
  errorMessage        String?     @db.Text
  createdAt           DateTime    @default(now()) @db.Timestamptz
  updatedAt           DateTime    @updatedAt @db.Timestamptz

  @@unique([campaignId, recipient])
  @@index([userId, status, scheduledAt])
  @@index([status, scheduledAt])
  @@index([senderId, status])
}

model SlackIntegration {
  id             String   @id @default(uuid())
  userId         String   @unique
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  teamId         String?
  teamName       String?
  channelName    String?
  webhookUrlEnc  String   @db.Text   // AES-256-GCM encrypted incoming-webhook URL
  createdAt      DateTime @default(now()) @db.Timestamptz
  updatedAt      DateTime @updatedAt @db.Timestamptz
}
```

### 5.3 Status semantics
| Status | Meaning | Shown in |
|---|---|---|
| `scheduled` | Waiting for its time (includes emails deferred by rate limit / send delay) | Scheduled tab |
| `processing` | Claimed by a worker, SMTP in flight | Scheduled tab (as "Sending") |
| `sent` | Accepted by SMTP | Sent tab |
| `failed` | Final failure after `EMAIL_MAX_ATTEMPTS` | Sent tab |

### 5.4 Redis keys
| Key | Type | Purpose | TTL |
|---|---|---|---|
| `bull:email-queue:*` | BullMQ | Queue (prefix configurable) | – |
| `rate:{senderId}:{YYYYMMDDHH}` | integer | Emails sent by sender in UTC hour window | 2 h |
| `sendlock:{senderId}` | string | Earliest next permitted SMTP send start for this sender | `MIN_DELAY_BETWEEN_EMAILS_MS` |
| `slack:notify-lock:{senderId}:{YYYYMMDDHH}` | string | Short-lived in-flight lock preventing concurrent Slack posts | 30 s |
| `slack:notified:{senderId}:{YYYYMMDDHH}` | string | Successful-notification dedupe key; written only after Slack confirms success | 2 h |

### 5.5 Elasticsearch index `emails`
```json
{
  "mappings": {
    "properties": {
      "id":          { "type": "keyword" },
      "userId":      { "type": "keyword" },
      "campaignId":  { "type": "keyword" },
      "recipient":   { "type": "text", "fields": { "raw": { "type": "keyword" } } },
      "subject":     { "type": "text" },
      "body":        { "type": "text" },
      "status":      { "type": "keyword" },
      "senderEmail": { "type": "keyword" },
      "scheduledAt": { "type": "date" },
      "sentAt":      { "type": "date" },
      "errorMessage":{ "type": "text" }
    }
  }
}
```
Document `_id` = `email.id`. Index on creation; partial-update on every status change. ES outages must **never** break scheduling or sending (log + continue; `npm run reindex` rebuilds from Postgres).

### 5.6 Docker Compose (`docker-compose.yml`, repo root)
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: sendora
      POSTGRES_PASSWORD: sendora
      POSTGRES_DB: sendora
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sendora"]
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--appendfsync", "everysec"]
    ports: ["6379:6379"]
    volumes: ["redisdata:/data"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.4
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=-Xms512m -Xmx512m
    ports: ["9200:9200"]
    volumes: ["esdata:/usr/share/elasticsearch/data"]

volumes:
  pgdata:
  redisdata:
  esdata:
```

---

## 6. Worker Logic (authoritative spec)

Queue name: `email-queue` (env `QUEUE_NAME`). Worker options: `{ connection, concurrency: WORKER_CONCURRENCY }`. Redis connection for BullMQ must use `maxRetriesPerRequest: null`. The processor signature is `(job, token)`; deferrals use `job.moveToDelayed(timestamp, token)` followed by `throw new DelayedError()` so that deferral **does not consume attempts or count as failure**.

```
process(job, token):
  email = prisma.email.findUnique(job.data.emailId, include sender, campaign)
  if !email                       → return (nothing to do)
  if email.status in (sent, failed) → return                       // idempotent skip

  // 1. ATOMIC CLAIM (idempotency)
  claimed = UPDATE emails
            SET status='processing', processingStartedAt=now()
            WHERE id = :id
              AND ( status='scheduled'
                    OR (status='processing' AND processingStartedAt < now() - STALE_PROCESSING_MS) )
  if claimed == 0 → return                                         // another worker owns it

  // 2. HOURLY RATE LIMIT (per sender, atomic Lua — see §7)
  limit   = min(campaign.hourlyLimit, MAX_EMAILS_PER_HOUR_PER_SENDER)
  window  = utcHourKey(now)
  allowed = LUA check_and_incr(rate:{sender}:{window}, limit, ttl=7200)
  if !allowed:
      nextWindowStart = startOfNextUtcHour(now)
      update email: status='scheduled', scheduledAt=nextWindowStart, deferredCount++
      notifySlackOnce(email.userId, sender, window)                // non-blocking, errors swallowed
      defer(job, token, nextWindowStart)                            // DelayedError

  // 3. MINIMUM SPACING BETWEEN SEND STARTS (per sender)
  // Acquire immediately before invoking SMTP, not before waiting/rate checks.
  ok = redis SET sendlock:{sender} 1 NX PX MIN_DELAY_BETWEEN_EMAILS_MS
  if !ok:
      release rate slot — no SMTP attempt started
      wait = PTTL sendlock:{sender}   (min 50 ms)
      update email: status='scheduled', scheduledAt=now + wait + smallJitter, deferredCount++
      defer(job, token, now + wait + smallJitter)                   // DelayedError

  // 4. SEND
  try:
      info = transporter(sender).sendMail({
        from: sender.email, to: email.recipient, subject, html/text: campaign.body,
        messageId: `<${email.id}@sendora.local>`                // stable correlation ID; SMTP server is not required to deduplicate it
      })
      update email: status='sent', sentAt=now, attempts++, messageId, previewUrl=nodemailer.getTestMessageUrl(info)
      esUpdate(email)
  catch err:
      DECR rate counter (the slot was not used)                    // optional but recommended
      attempts++
      if attempts < EMAIL_MAX_ATTEMPTS:
          backoff = 2^attempts * 5000 ms
          revert status → 'scheduled'; scheduledAt = now + backoff
          defer(job, token, now + backoff)
      else:
          update email: status='failed', errorMessage=err.message; esUpdate(email)
```

Notes:
- **Crash-safety and delivery semantics:** if the process dies after the claim but before SMTP is invoked, BullMQ stalled-job recovery and the stale-claim clause allow safe recovery. A crash after the SMTP server accepts the message but before PostgreSQL records `sent` is ambiguous: recovery may send it again. A deterministic `Message-ID` is useful for correlation but does **not** guarantee SMTP-side deduplication. Do not claim absolute exactly-once delivery. Document this limitation in both `README.md` and `report.md`; report any observed duplicate risk honestly.
- Reuse one Nodemailer transporter per sender (cache in a `Map<senderId, Transporter>`), not one per job.
- Worker must handle `SIGTERM/SIGINT`: `await worker.close()` (graceful), then close Prisma/Redis.
- Set `lockDuration` generously (e.g. 60 000 ms) and `stalledInterval` default.

---

## 7. Rate Limiting, Delay & Concurrency (authoritative spec)

### 7.1 Three independent controls
| Control | Env var | Scope | Mechanism |
|---|---|---|---|
| Concurrency | `WORKER_CONCURRENCY` | per worker process | BullMQ worker `concurrency` |
| Minimum spacing between send starts | `MIN_DELAY_BETWEEN_EMAILS_MS` (default 2000) | per sender, cluster-wide | Redis `SET NX PX` reservation acquired immediately before the SMTP call |
| Hourly cap | `MAX_EMAILS_PER_HOUR_PER_SENDER` (default 200); campaign `hourlyLimit` can only lower it | per sender per UTC hour, cluster-wide | Redis atomic counter (Lua) |

> Why a per-sender lock instead of BullMQ's `limiter`? BullMQ's limiter is queue-wide, not per sender; with multiple senders it would unnecessarily throttle all of them together. The Redis lock also works across multiple worker instances. Document this trade-off in the README.

**Delay semantics:** the configured delay is the minimum interval between the *start times* of consecutive SMTP send attempts for the same sender, not a pause measured from completion. The Redis reservation is acquired immediately before calling `sendMail`; its TTL represents the next permitted start time. A slow SMTP request may still be in flight when the next permitted start time arrives. This is intentional for provider-throttling simulation. Do not release or extend the reservation merely because SMTP fails or takes longer than the TTL; a send attempt has already started. If the reservation cannot be acquired, release the previously reserved hourly rate slot because no SMTP attempt began, then defer the job until the reservation expires.

### 7.2 Atomic check-and-increment (Lua)
```lua
-- KEYS[1] = rate:{sender}:{window}; ARGV[1] = limit; ARGV[2] = ttlSeconds
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then
  return {0, current}
end
current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2])) end
return {1, current}
```

### 7.3 Behavior when the limit is exceeded
- Job is **not failed, not dropped, not retried-with-attempt**. It is moved to the first moment of the next UTC hour window. Multiple jobs may share that timestamp; BullMQ processing order is **best-effort**, not a strict campaign-order guarantee. Do not use `(seq % 1000)` offsets because they collide for campaigns larger than 1,000 and across campaigns. Strict global/campaign ordering is not a requirement of this version.
- The DB row's `scheduledAt` is updated so the dashboard shows the true new time; `deferredCount` increments.
- If the next window is also saturated, the same logic repeats (each deferral is O(1)).

### 7.4 Behavior under load (1000+ emails at the same time)
- All 1000 are stored as delayed jobs (cheap). When they become due, workers pull them `WORKER_CONCURRENCY` at a time.
- With 3 senders and 200/hour/sender → up to 600 emails go out in the first hour (send starts spaced ≥ `MIN_DELAY` per sender); the remaining ~400 are deferred to the next hour window. Their relative order is best-effort.
- Per-sender min-delay serialises each sender even with high worker concurrency; different senders proceed in parallel.
- Provide `scripts/load-test.ts` (see guide) that schedules ≥1000 emails with a tiny hourly limit to demonstrate this; document expected output in the README.

---

## 8. Authentication (Google OAuth — real)

- Flow: `GET /auth/google` → redirect to Google consent (scopes: `openid email profile`) → `GET /auth/google/callback?code=…` → exchange code with `google-auth-library`, verify ID token, upsert `User` by `googleId` → set **httpOnly** JWT cookie (`SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`) → redirect to `${FRONTEND_URL}/dashboard`.
- On any OAuth failure (bad state, denied consent, token error) redirect to `${FRONTEND_URL}/login?error=auth_failed` instead of returning JSON.
- `GET /api/me` returns `{ id, name, email, avatarUrl }` or `401`.
- `POST /auth/logout` clears the cookie.
- Auth middleware protects every `/api/*` route and `/admin/queues`.
- CORS: `origin = FRONTEND_URL`, `credentials: true`.
- Use a random `state` value (stored in a short-lived cookie) to prevent CSRF on the OAuth callback.

Google Cloud console setup (put in README): create OAuth Client (Web), authorized redirect URI `http://localhost:4000/auth/google/callback`, add your account as a test user.

---

## 9. Slack Integration (real OAuth, live message)

- **Connect:** frontend button → `GET /api/slack/connect` (auth) returns `{ url }` (or redirects) to `https://slack.com/oauth/v2/authorize?client_id=…&scope=incoming-webhook&redirect_uri=…&state=<signed state containing userId>`.
- **Callback:** `GET /api/slack/callback?code&state` → verify `state` → POST `https://slack.com/api/oauth.v2.access` (client id/secret, code, redirect_uri) → read `incoming_webhook.url`, `team.name`, `incoming_webhook.channel` → encrypt webhook URL with AES-256-GCM (`ENCRYPTION_KEY`) → upsert `SlackIntegration` for that user → redirect to `${FRONTEND_URL}/dashboard?slack=connected`.
- **Status / disconnect:** `GET /api/slack/status` → `{ connected, teamName, channelName }`; `DELETE /api/slack` removes the row.
- **Notify:** when a sender's hourly limit is hit, first look up the Slack integration of the **owner of the email being deferred**. If none or inactive → do nothing and do **not** create/consume a deduplication key. If connected, acquire a short-lived in-flight lock (`slack:notify-lock:{senderId}:{window}` via `SET NX EX`). If the lock is acquired and no successful-notification key (`slack:notified:{senderId}:{window}`) exists, POST a message to the webhook. Set the successful-notification key with a 2-hour TTL only after Slack confirms success. On request failure/timeout, log the failure and delete the in-flight lock so a later rate-limit event can retry; do not mark the notification as sent. A process crash after Slack accepts the post but before the success key is written can still produce a duplicate alert, which is acceptable for this best-effort notification.
  > ⚠️ *Hourly email limit reached* — sender `abc@ethereal.email` hit `200/hour` at `14:00 UTC`. Remaining emails are rescheduled to the next window (`15:00 UTC`).
- Connect/disconnect/reconnect must work **without redeploy** (integration looked up from DB at notify time).
- Slack may reject non-HTTPS redirect URIs; if so use a tunnel (ngrok / cloudflared) and set `SLACK_REDIRECT_URI` + `BACKEND_URL` accordingly (document in README).
- Provide a dev-only endpoint `POST /api/slack/test` (auth) that sends a test message to verify the connection.

---

## 10. API Specification

Base URL: `http://localhost:4000`. All `/api/*` routes require the auth cookie. Errors use `{ "error": { "code": string, "message": string } }`.

`POST /api/schedule` returns `201` when the campaign is persisted and all jobs are enqueued. If the DB commit succeeded but enqueueing remains incomplete after an immediate reconciliation attempt, return `202 Accepted` with `persisted: true` and `queueStatus: "pending_reconciliation"`; include the `campaignId` so the client can show the saved campaign as pending recovery. Never return an ordinary retryable error that encourages blind campaign resubmission after a successful DB commit.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ status: 'ok', db, redis, elasticsearch }` (no auth) |
| GET | `/auth/google` | Start Google OAuth |
| GET | `/auth/google/callback` | OAuth callback → cookie → redirect |
| POST | `/auth/logout` | Clear cookie |
| GET | `/api/me` | Current user |
| POST | `/api/schedule` | Create campaign + schedule emails |
| GET | `/api/emails` | List emails (paginated) |
| GET | `/api/emails/search` | Elasticsearch search |
| GET | `/api/campaigns` | List user's campaigns (with counts per status) |
| GET | `/api/senders` | List active senders (id, email) |
| GET | `/api/slack/connect` | Get Slack authorize URL |
| GET | `/api/slack/callback` | Slack OAuth callback (state-verified) |
| GET | `/api/slack/status` | Slack connection status |
| DELETE | `/api/slack` | Disconnect Slack |
| POST | `/api/slack/test` | Send test Slack message |
| GET | `/admin/queues` | Bull Board UI (auth required) |

### 10.1 `POST /api/schedule`
Request:
```json
{
  "subject": "Hello",
  "body": "<p>Hi there</p>",
  "emails": ["a@x.com", "b@y.com"],
  "startTime": "2026-11-24T10:00:00.000Z",
  "delaySeconds": 5,
  "hourlyLimit": 100
}
```
Validation: subject 1–200 chars; body 1–50 000 chars; `emails` 1–10 000 valid, deduped; `startTime` ISO date (past → treated as now); `delaySeconds` 0–3600; `hourlyLimit` 1–`MAX_EMAILS_PER_HOUR_PER_SENDER`.
Response `201`:
```json
{ "campaignId": "uuid", "total": 2, "firstScheduledAt": "…", "lastScheduledAt": "…" }
```

### 10.2 `GET /api/emails`
Query: `status=scheduled|sent` (required), `page` (default 1), `limit` (default 20, max 100), `campaignId?`.
- `status=scheduled` → rows with DB status `scheduled` or `processing`, ordered by `scheduledAt ASC`.
- `status=sent` → rows with DB status `sent` or `failed`, ordered by `sentAt DESC` (failed use `updatedAt`).

Response:
```json
{
  "items": [{
    "id": "uuid", "recipient": "a@x.com", "subject": "Hello",
    "status": "scheduled", "scheduledAt": "…", "sentAt": null,
    "senderEmail": "abc@ethereal.email", "previewUrl": null,
    "errorMessage": null, "deferredCount": 0
  }],
  "page": 1, "limit": 20, "total": 134
}
```

### 10.3 `GET /api/emails/search`
Query: `q` (required), `status?`, `page`, `limit`. Always filtered by the authenticated `userId`. Multi-match across `recipient`, `subject`, `body`. Same item shape as above plus `total`.

---

## 11. Project Structure (monorepo)

```
sendora-scheduler/
├── docker-compose.yml
├── README.md
├── PRD.md
├── implementation_guide.md
├── design.md                      # UI/visual spec (provided)
├── report.md                      # written by the agent at the end
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── scripts/
│   │   ├── seed-senders.ts        # creates Ethereal accounts
│   │   ├── reindex.ts             # Postgres → Elasticsearch
│   │   └── load-test.ts           # schedules 1000+ emails
│   └── src/
│       ├── server.ts              # API entrypoint
│       ├── worker.ts              # Worker entrypoint
│       ├── app.ts                 # Express app factory
│       ├── config/                # env.ts (zod-validated), logger.ts
│       ├── db/                    # prisma client
│       ├── redis/                 # connection, lua scripts, helpers
│       ├── queue/                 # queue.ts, enqueue.ts, reconcile.ts
│       ├── workers/               # emailProcessor.ts, rateLimiter.ts, sendLock.ts
│       ├── services/              # schedule, email, sender, mailer, slack, search, auth, crypto
│       ├── routes/                # auth, schedule, emails, campaigns, senders, slack, health
│       ├── middleware/            # auth, error handler, validate
│       ├── types/
│       └── utils/                 # time windows, chunk, email parsing
└── frontend/
    ├── package.json
    ├── .env.example
    ├── index.html
    ├── tailwind.config.ts / postcss.config.js
    └── src/
        ├── main.tsx / App.tsx
        ├── api/                   # axios client + endpoint functions
        ├── types/                 # API response + domain types
        ├── hooks/                 # useAuth, useEmails, useSlack, useSchedule
        ├── context/               # AuthContext
        ├── components/
        │   ├── ui/                # Button, IconButton, Input, Textarea, Modal, Drawer, Dropdown, Table, Badge/StatusBadge, Chip, Skeleton, Spinner, EmptyState, Avatar, FileDropzone, ProgressBar, Logo
        │   ├── layout/            # Header, Sidebar, DashboardLayout, SearchBar, UserMenu
        │   ├── landing/           # Navbar, Hero, ProductMockup, FeaturesGrid, HowItWorks, ReliabilityStrip, CtaBand, Footer
        │   ├── emails/            # EmailsTable, EmailDetailDrawer
        │   ├── compose/           # ComposeWindow, ComposeProvider (open/minimize/maximize state), LeadUploader
        │   ├── campaigns/         # CampaignCard
        │   └── slack/             # SlackConnectButton, SlackCard
        ├── pages/                 # LandingPage, AuthPage (login/register), ScheduledPage, SentPage, CampaignsPage, SearchPage, SettingsPage, NotFoundPage
        ├── routes/                # ProtectedRoute, PublicOnlyRoute
        └── utils/                 # csv parsing, date formatting
```

---

## 12. Frontend Details

The visual and interaction design is defined in **`design.md`** — read it fully before building any UI and follow it for routes, layout, components, copy and responsive behaviour. This section lists the functional requirements the design must satisfy.

### 12.1 Routes
| Route | Page | Access |
|---|---|---|
| `/` | Landing page | Public |
| `/login`, `/register` | Auth page (Google OAuth only) | Public-only (authenticated users → `/dashboard`) |
| `/dashboard` | Redirects to `/dashboard/scheduled`, **preserving the query string** (the Slack callback lands on `/dashboard?slack=connected`) | Protected |
| `/dashboard/scheduled` | Scheduled Emails | Protected |
| `/dashboard/sent` | Sent Emails | Protected |
| `/dashboard/campaigns` | Campaigns | Protected |
| `/dashboard/search?q=` | Search results | Protected |
| `/dashboard/settings` | Slack, senders, queue dashboard, account | Protected |
| `*` | 404 | Public |

### 12.2 Functional behaviour
- **Auth:** the "Continue with Google" button does `window.location.href = ${API}/auth/google`. `/login?error=auth_failed` shows an inline error. Header shows avatar, **name and email** (visible at desktop widths; always in the user dropdown) and **Logout** (`POST /auth/logout`).
- **Shell:** header (hamburger, logo, search → `/dashboard/search?q=…`, user menu) and sidebar (Compose, Scheduled, Sent, Campaigns, Settings, Queue dashboard link, Slack status chip). Sidebar counts use `GET /api/emails?status=…&limit=1` (`total`).
- **Compose:** floating window opened from the sidebar (and empty-state CTAs).
  - Fields: Subject, Body, Lead file (`.csv`/`.txt`), Start time (`datetime-local`, default now + 2 min), Delay between emails (seconds, default 5), Hourly limit (default 100).
  - Lead parsing (client-side, `papaparse` + regex): extract every valid email from any column/line, lowercase, dedupe. Show **"N valid email addresses detected"** (+ "M invalid or duplicate skipped").
  - Disable **Schedule** until valid; loading state on submit; success → snackbar + close + invalidate queries; error → snackbar with API message, form kept.
- **Tables (Scheduled / Sent / Search):** columns per F4/F5, skeleton loading, empty state, error state with retry, pagination, polling every 10 s (`refetchInterval`), reusable `StatusBadge`; row click opens the detail drawer (`previewUrl` link when present).
- **Campaigns:** cards from `GET /api/campaigns` with a progress bar and per-status counts; links to Scheduled/Sent filtered by `campaignId`.
- **Search:** `GET /api/emails/search`; handle `503` (Elasticsearch down) with a friendly message.
- **Settings:** Slack connect (fetch `GET /api/slack/connect` → redirect to returned `url`), status, test message, disconnect (confirm); senders from `GET /api/senders`; link to `${API}/admin/queues`; account + sign out. Handle `?slack=connected` / `?slack=error` with a snackbar and strip the param.
- **Types:** every API response and component prop is typed in `src/types`.
- **Styling:** Tailwind theme tokens from `design.md` §2.6 are defined before any component is written; all styling lives in `components/ui/*`, `components/layout/*` and the page/landing components — no one-off colours or spacing values.

---

## 13. Environment Files

### 13.1 `backend/.env.example`
```dotenv
# ---------- General ----------
NODE_ENV=development
PORT=4000
LOG_LEVEL=info
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:4000

# ---------- PostgreSQL ----------
DATABASE_URL=postgresql://sendora:sendora@localhost:5432/sendora?schema=public

# ---------- Redis ----------
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
QUEUE_NAME=email-queue

# ---------- Elasticsearch ----------
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_INDEX=emails

# ---------- Google OAuth ----------
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback

# ---------- Session / Security ----------
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRES_IN=7d
COOKIE_SECURE=false
# 32-byte key as 64 hex chars (generate: openssl rand -hex 32). Used to encrypt Slack webhook URLs.
ENCRYPTION_KEY=

# ---------- Slack OAuth ----------
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback

# ---------- Ethereal / SMTP ----------
ETHEREAL_SENDER_COUNT=3
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587

# ---------- Scheduler behaviour ----------
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
DEFAULT_HOURLY_LIMIT=100
EMAIL_MAX_ATTEMPTS=3
STALE_PROCESSING_MS=120000
RECOVERY_ON_BOOT=true

# ---------- Bull Board ----------
BULL_BOARD_PATH=/admin/queues
```

### 13.2 `frontend/.env.example`
```dotenv
VITE_API_BASE_URL=http://localhost:4000
```

`backend/src/config/env.ts` must validate all variables with zod at startup and fail fast with a readable error listing missing/invalid values.

---

## 14. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| 1 | `docker compose up -d` starts Postgres, Redis, Elasticsearch healthy | `docker compose ps` |
| 2 | `npm run dev` (backend) starts API + worker; `/health` all green | curl |
| 3 | Google login works; header shows name/email/avatar; logout works | browser |
| 4 | Scheduling 5 emails 10 s apart sends them at the right times via Ethereal; `previewUrl` is stored | dashboard + Ethereal inbox |
| 5 | **Restart test:** schedule emails 2 min ahead → stop API+worker → start again → persisted emails are recovered and sent; verify no duplicate in the tested restart scenario, while documenting the SMTP-accepted/DB-update ambiguity | demo / report |
| 6 | **Concurrent-worker duplicate avoidance:** run two worker instances; the atomic DB claim ensures only one worker owns each email at a time and the normal two-worker test produces one SMTP submission per email. Do not interpret this as an absolute exactly-once guarantee across SMTP/DB crash ambiguity | DB transitions, logs, Ethereal inbox |
| 7 | **Rate limit:** with `hourlyLimit=3` and 10 emails, 3 send in the current window and 7 are rescheduled to the next hour (not failed) | DB + dashboard |
| 8 | **Min delay:** consecutive SMTP send start times from the same sender are ≥ `MIN_DELAY_BETWEEN_EMAILS_MS` apart, including when an earlier SMTP request takes longer than the configured delay | timestamped send-start logs; delayed-SMTP integration test |
| 9 | **Concurrency** configurable; changing env changes parallelism | logs |
| 10 | **Slack:** connect via real OAuth; hitting the limit posts a real Slack message; without connection nothing crashes; connecting later works without redeploy | Slack workspace |
| 11 | **Elasticsearch:** `/api/emails/search?q=…` returns matches for scheduled and sent emails | curl |
| 12 | **Bull Board** at `/admin/queues` shows live jobs | browser |
| 13 | **Load:** `load-test` with 1000+ emails completes scheduling quickly; deferral behaviour matches §7.4 | script output |
| 14 | No cron usage anywhere | `grep -ri cron backend/src package.json` returns nothing relevant |
| 15 | Frontend: loading + empty + error states, typed code, reusable components | code review |
| 16 | `README.md` complete per §16 and `report.md` written per §15 | files exist |
| 17 | **Frontend matches `design.md`:** every page in design §3 exists and works (landing, login, register, scheduled, sent, campaigns, search, settings, 404); Gmail-style shell, floating compose window, white + red palette, responsive at 360 px / 768 px / 1280 px, loading/empty/error states | browser walk-through, screenshots noted in `report.md` |

---

## 15. `report.md` Requirement (agent must produce this at the end)

Create `report.md` in the **repo root**. Use this exact structure:

```markdown
# Implementation Report

## 1. Summary
(3–6 sentences: what was built, overall status, how long it took if known.)

## 2. Requirements Checklist
| ID | Requirement | Status (Done / Partial / Not done / Unverified) | Notes / file references |
|----|-------------|----------------------------------------------------|-------------------------|
(Every B1–B14, F1–F11, and acceptance criteria 1–17 from the PRD, plus every page in `design.md` §3 and every component in `design.md` §9.)

## 3. Architecture Decisions & Deviations
(Anything that differs from the PRD and why.)

## 4. How to Run (verified commands)
(Exact commands you actually ran.)

## 5. Test Evidence
(For each acceptance criterion: command run, observed output/summary. Include restart test, duplicate-avoidance test with 2 workers, rate-limit test, load test numbers, the DB-commit/enqueue-failure recovery test, and the Slack notification failure/retry test.)

## 6. Known Issues & Limitations
(Be specific: include the SMTP-accepted/DB-not-updated ambiguity; state that deterministic Message-ID does not guarantee SMTP deduplication; include any unverified queue-recovery, Slack retry, or ordering behavior.)

## 7. Items Needing the User's Action
(Credentials to fill in, Google/Slack app setup steps still pending, repo access for `Mitrajit` and `Yadav036`, demo video.)

## 8. Suggested Demo Script (≤ 5 min)
(Step-by-step with timings.)

## 9. Possible Improvements
```

---

## 16. README Requirements (`README.md`)

Must include: prerequisites; how to run Docker infra; backend setup (env, `prisma migrate`, `seed-senders`, run API + worker); frontend setup; Ethereal setup and where to view sent mail; Google OAuth setup; Slack app setup (incl. HTTPS tunnel note); architecture overview (scheduling, persistence on restart, rate limiting & concurrency incl. chosen **min delay value** and trade-offs, idempotency limitations (including the SMTP/DB ambiguity), behavior under load); feature list mapped to backend (scheduler, persistence, rate limiting, concurrency, Slack, Elasticsearch, Bull Board) and frontend (login, dashboard, compose, tables); known limitations; how to run the load test and restart test.

---

## 17. Submission Checklist (for the user, not the agent)
- Private GitHub repo; grant access to `Mitrajit` and `Yadav036`.
- README + report.md present; `.env` not committed.
- Demo video ≤ 5 min: schedule emails, show Scheduled/Sent tabs, restart scenario, (bonus) rate-limit behaviour under load.
