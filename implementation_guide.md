# Implementation Guide — Email Scheduler (companion to `PRD.md`)

> Follow phases **in order**. Each phase ends with a **Verify** step — do not move on until it passes. Commit after every phase.
> `PRD.md` is the source of truth for requirements, schema, API, env vars and acceptance criteria. This guide is the *how* and the *order*.

---

## Working Agreement

- **Never** use cron or cron-like libraries/patterns. Delayed BullMQ jobs only.
- Keep a running list of deviations, unverified items and bugs as you go — you will need them for `report.md`.
- `design.md` is provided in the repo root. Read it fully before Phase 8 and follow it for all frontend routes, layout, components and visuals. It overrides the PRD on those points; the PRD wins on backend behaviour, API, schema and env.
- Prefer small, pure, testable modules (time windows, lead parsing, rate limiter) and write a few `vitest` tests for them.
- Don't ask the user questions unless a credential/decision is truly blocking; otherwise make a sensible choice and record it in `report.md`.

---

## Phase 0 — Repo & Infra

1. Create the monorepo layout from PRD §11 (`backend/`, `frontend/`, root `docker-compose.yml`, `.gitignore` ignoring `node_modules`, `.env`, `dist`, `*.log`).
2. Add `docker-compose.yml` from PRD §5.6.
3. `docker compose up -d` and confirm all three services are healthy.

**Verify**
```bash
docker compose ps
docker compose exec redis redis-cli ping            # PONG
docker compose exec postgres pg_isready -U sendora
curl -s localhost:9200 | head
```

---

## Phase 1 — Backend Skeleton

```bash
cd backend
npm init -y
npm i express cors helmet cookie-parser zod pino bullmq ioredis @prisma/client nodemailer \
      jsonwebtoken google-auth-library axios @elastic/elasticsearch \
      @bull-board/api @bull-board/express dotenv
npm i -D typescript tsx @types/node @types/express @types/cors @types/cookie-parser \
      @types/jsonwebtoken @types/nodemailer prisma pino-pretty vitest eslint prettier concurrently
npx tsc --init
npx prisma init
```

**tsconfig essentials:** `"strict": true`, `"target": "ES2022"`, `"module": "commonjs"` (or NodeNext with consistent imports), `"outDir": "dist"`, `"rootDir": "."` (or `src` + separate scripts tsconfig), `"esModuleInterop": true`, `"skipLibCheck": true`.

**`package.json` scripts**
```json
{
  "scripts": {
    "dev": "concurrently -n api,worker \"tsx watch src/server.ts\" \"tsx watch src/worker.ts\"",
    "dev:api": "tsx watch src/server.ts",
    "dev:worker": "tsx watch src/worker.ts",
    "build": "tsc -p .",
    "start:api": "node dist/src/server.js",
    "start:worker": "node dist/src/worker.js",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "seed:senders": "tsx scripts/seed-senders.ts",
    "reindex": "tsx scripts/reindex.ts",
    "load-test": "tsx scripts/load-test.ts",
    "test": "vitest run"
  }
}
```

Build in this order:
1. `src/config/env.ts` — load `dotenv`, validate **every** variable from PRD §13.1 with zod (coerce numbers/booleans), export a typed `env` object, throw a readable error on invalid config.
2. `src/config/logger.ts` — pino (pretty in dev).
3. `src/db/prisma.ts` — singleton `PrismaClient`.
4. `src/redis/connection.ts` — two factories: `createRedis()` (normal, for counters/locks) and `createBullConnection()` with `maxRetriesPerRequest: null` for BullMQ.
5. `src/app.ts` — Express app factory: helmet, cors (`origin: env.FRONTEND_URL, credentials: true`), `express.json({ limit: '5mb' })`, cookie-parser, routes, central error handler (zod errors → 400 with `{ error: { code, message } }`).
6. `src/server.ts` — start HTTP server, graceful shutdown.
7. `GET /health` pinging DB, Redis, ES.

**Verify:** `npm run dev:api` → `curl localhost:4000/health` returns `status: ok`.

---

## Phase 2 — Database

1. Paste the Prisma schema from PRD §5.2 into `prisma/schema.prisma`.
2. `npx prisma migrate dev --name init`.
3. `scripts/seed-senders.ts`:
   ```ts
   import nodemailer from 'nodemailer';
   // for i in 1..ETHEREAL_SENDER_COUNT (skip if active senders >= count):
   const acct = await nodemailer.createTestAccount();   // needs internet
   await prisma.sender.create({ data: {
     email: acct.user, displayName: `Sender ${i}`,
     smtpHost: acct.smtp.host, smtpPort: acct.smtp.port,
     smtpUser: acct.user, smtpPass: acct.pass,
   }});
   ```
   Idempotent: running it twice must not create extra senders beyond the configured count.
4. Print the created Ethereal usernames and a hint: *log in at https://ethereal.email/login or use the `previewUrl` stored per email*.

**Verify:** `npm run seed:senders` → 3 rows in `Sender` (`npx prisma studio` or `psql`).

---

## Phase 3 — Queue, Enqueue, Reconcile

`src/queue/queue.ts`
```ts
import { Queue } from 'bullmq';
export const emailQueue = new Queue(env.QUEUE_NAME, {
  connection: createBullConnection(),
  defaultJobOptions: {
    attempts: 1,                              // SMTP retries handled in worker logic (PRD §6)
    removeOnComplete: { age: 86_400, count: 5000 },
    removeOnFail: false,
  },
});
```

`src/queue/enqueue.ts`
- `enqueueEmails(emails: {id: string; scheduledAt: Date}[])` → `addBulk` in chunks of 500:
  ```ts
  emailQueue.addBulk(chunk.map(e => ({
    name: 'send-email',
    data: { emailId: e.id },
    opts: { jobId: e.id, delay: Math.max(0, e.scheduledAt.getTime() - Date.now()) },
  })));
  ```
  Adding the same `jobId` twice is a no-op in BullMQ — this is idempotency layer #1.

`src/queue/reconcile.ts`
```ts
export async function reconcileQueue() {
  // cursor-paginate Email rows where status in ('scheduled','processing')
  // for each: const job = await emailQueue.getJob(email.id);
  //           if (!job) await emailQueue.add('send-email', { emailId: email.id },
  //                { jobId: email.id, delay: Math.max(0, email.scheduledAt.getTime() - Date.now()) });
  // log counts: checked, re-enqueued
}
```
Call it on API boot and on worker boot when `RECOVERY_ON_BOOT=true`. Use batches of ~500 and `Promise.all` per batch (`getJob` is cheap).

**Gotcha:** a job that already completed/failed in BullMQ but whose DB row is still `scheduled` (e.g. crash) is also "missing" from the queue if `removeOnComplete` removed it → reconcile may re-add it → worker's atomic claim + status check prevents concurrent duplicate processing. The SMTP-accepted/DB-not-updated crash window remains ambiguous and can cause a duplicate; deterministic Message-ID is not SMTP deduplication.

---

## Phase 4 — Schedule API

`src/services/schedule.service.ts` implementing PRD §4.2-A:
1. zod schema (`src/routes/schedule.routes.ts`) with limits from PRD §10.1; refine `hourlyLimit <= env.MAX_EMAILS_PER_HOUR_PER_SENDER`.
2. Normalize recipients: trim, lowercase, validate with a simple robust regex or zod `.email()`, dedupe; if zero valid → 400.
3. Load active senders; if none → 500 with message "Run npm run seed:senders".
4. `base = max(startTime, now)`; for `i`: `scheduledAt = base + i * delaySeconds * 1000`; `senderId = senders[i % senders.length].id`.
5. In a Prisma transaction: create `Campaign`; `email.createMany` in chunks of 1000 (set `id` explicitly with `crypto.randomUUID()` so you can enqueue without re-querying; set `originalScheduledAt = scheduledAt`, `seq = i`, `subject`).
6. After commit, call `enqueueEmails(...)`. Treat the database as the durable source of truth: if `addBulk` fails or partially succeeds, do not roll back/delete the committed campaign. Run an immediate targeted reconciliation for its email IDs using `jobId = email.id`. If all jobs are confirmed present, continue normally. If any remain missing, log the failure and return `202 Accepted` with `campaignId`, `persisted: true`, and `queueStatus: "pending_reconciliation"`; boot-time reconciliation will retry. The frontend must show the campaign as saved/pending recovery and must not blindly resubmit it.
7. Then call `indexEmails(...)` (ES) wrapped in try/catch.
8. Return `201` only when all jobs are enqueued; use the `202` recovery response described above when DB persistence succeeded but queueing remains incomplete.

**Verify (after Phase 5 auth is available, or temporarily with a dev bypass flag that you REMOVE afterwards):** schedule 3 emails and check rows + delayed jobs (`emailQueue.getDelayedCount()`).

---

## Phase 5 — Worker (the heart of the project)

Files: `src/worker.ts`, `src/workers/emailProcessor.ts`, `src/workers/rateLimiter.ts`, `src/workers/sendLock.ts`, `src/services/mailer.service.ts`, `src/utils/time.ts`.

### 5.1 Time helpers (`utils/time.ts`) — unit-test these
```ts
export const utcHourKey = (d = new Date()) =>
  d.toISOString().slice(0, 13).replace(/[-T]/g, '');          // 'YYYYMMDDHH'
export const startOfNextUtcHour = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1));
```

### 5.2 Rate limiter (`rateLimiter.ts`) — Lua via `redis.defineCommand` or `eval`
```ts
const LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then return {0, current} end
current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2])) end
return {1, current}`;

export async function tryConsumeSlot(senderId: string, limit: number) {
  const key = `rate:${senderId}:${utcHourKey()}`;
  const [allowed, count] = (await redis.eval(LUA, 1, key, limit, 7200)) as [number, number];
  return { allowed: allowed === 1, count, window: utcHourKey() };
}
export const releaseSlot = (senderId: string, window: string) => redis.decr(`rate:${senderId}:${window}`);
```

### 5.3 Send lock (`sendLock.ts`)
The contract is **minimum spacing between SMTP send start times**, not between completion and the next start. Acquire the reservation immediately before invoking `sendMail`, after the hourly rate slot has been reserved. Its TTL begins at that point and represents the earliest next permitted send start. A previous SMTP request may still be in flight when the next start is allowed; that is intentional.

```ts
export async function acquireSendStartSlot(senderId: string) {
  const key = `sendlock:${senderId}`;
  const ok = await redis.set(key, '1', 'PX', env.MIN_DELAY_BETWEEN_EMAILS_MS, 'NX');
  if (ok) return { acquired: true as const };
  const ttl = await redis.pttl(key);
  return { acquired: false as const, waitMs: Math.max(ttl, 50) };
}
```
Do not acquire this reservation before a rate-limit deferral. If the hourly slot was reserved but the send-start slot cannot be acquired, decrement/release that hourly slot and defer until the send-start reservation expires. Once `sendMail` has been invoked, do not delete the send-start reservation on SMTP success or failure.

### 5.4 Mailer (`mailer.service.ts`)
- `Map<senderId, Transporter>` cache; `nodemailer.createTransport({ host, port, secure: false, auth: { user, pass } })`.
- `sendEmail(sender, to, subject, body, emailId)` → `sendMail({ from: \`${sender.displayName} <${sender.email}>\`, to, subject, html: body, text: stripHtml(body), messageId: \`<${emailId}@sendora.local>\` })` → returns `{ messageId, previewUrl: nodemailer.getTestMessageUrl(info) || null }`.

### 5.5 Processor (`emailProcessor.ts`) — implement exactly the algorithm in **PRD §6**
Key implementation notes:
- Signature: `async (job: Job<{emailId: string}>, token?: string)`.
- Atomic claim with a raw query (Prisma `updateMany` with a `where` that includes the OR condition works too and returns `count`):
  ```ts
  const { count } = await prisma.email.updateMany({
    where: {
      id: emailId,
      OR: [
        { status: 'scheduled' },
        { status: 'processing', processingStartedAt: { lt: new Date(Date.now() - env.STALE_PROCESSING_MS) } },
      ],
    },
    data: { status: 'processing', processingStartedAt: new Date() },
  });
  if (count === 0) return;
  ```
- Deferral helper:
  ```ts
  import { DelayedError } from 'bullmq';
  async function defer(job: Job, token: string | undefined, runAt: number): Promise<never> {
    await job.moveToDelayed(runAt, token);
    throw new DelayedError();
  }
  ```
  Always update the DB row (`status: 'scheduled'`, `scheduledAt`, `deferredCount: { increment: 1 }`) **before** calling `defer`.
- Order of checks: **claim → hourly rate-limit reservation → send-start reservation → invoke SMTP**. If the hourly limit denies, defer to the next UTC hour; no send-start reservation has been consumed. If the hourly slot is reserved but the send-start reservation is unavailable, release the hourly slot because SMTP has not started, then defer by the remaining Redis TTL plus small jitter.
- Define and log `sendStartedAt` immediately before `sendMail`. The minimum-delay acceptance test compares these start timestamps, not `sentAt` completion timestamps.
- Next-window time: `startOfNextUtcHour()` with no modulo-based sequence offset. Jobs deferred to the same window may share a timestamp; relative processing order is best-effort. Do not claim strict ordering.
- SMTP failure path with `attempts`/backoff per PRD §6; call `releaseSlot` when the send fails so the slot isn't wasted.
- After every terminal DB update (`sent` / `failed`) call `updateEmailInIndex(...)` inside try/catch.

### 5.6 Worker entrypoint (`worker.ts`)
```ts
const worker = new Worker(env.QUEUE_NAME, processEmail, {
  connection: createBullConnection(),
  concurrency: env.WORKER_CONCURRENCY,
  lockDuration: 60_000,
});
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'job failed'));
worker.on('completed', (job) => logger.info({ jobId: job.id }, 'job completed'));
if (env.RECOVERY_ON_BOOT) await reconcileQueue();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await worker.close(); await prisma.$disconnect(); process.exit(0); });
```
Log the effective config on boot (concurrency, min delay, hourly limit).

**Verify**
1. Schedule 5 emails ~10 s apart → watch logs → 5 rows become `sent` with `previewUrl` (open one to confirm in Ethereal).
2. Set `hourlyLimit=2` for a 6-email campaign: 2 send now; 4 rows get `scheduledAt` at the next UTC hour (+ small offset), `status=scheduled`, `deferredCount=1`, none `failed`.
3. Check ≥ `MIN_DELAY_BETWEEN_EMAILS_MS` spacing between `sentAt` values of the same sender.

---

## Phase 6 — Auth (Google OAuth) + Bull Board

`src/services/auth.service.ts`
- `OAuth2Client(clientId, clientSecret, redirectUri)`.
- `GET /auth/google`: generate random `state`, set short-lived httpOnly cookie `oauth_state`, redirect to `client.generateAuthUrl({ scope: ['openid','email','profile'], state, prompt: 'select_account' })`.
- `GET /auth/google/callback`: compare `state` with cookie; `client.getToken(code)`; `client.verifyIdToken({ idToken, audience })`; upsert `User` by `googleId` (`sub`); sign JWT `{ sub: user.id }` → cookie `token` (`httpOnly`, `sameSite: 'lax'`, `secure: env.COOKIE_SECURE`, `maxAge` 7 d); redirect to `${FRONTEND_URL}/dashboard`. On **any** failure (state mismatch, denied consent, token error) redirect to `${FRONTEND_URL}/login?error=auth_failed`.
- `middleware/auth.ts`: read cookie, verify JWT, load `req.user` (id), else `401`.
- `GET /api/me`, `POST /auth/logout`.

Bull Board:
```ts
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(env.BULL_BOARD_PATH);
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter });
app.use(env.BULL_BOARD_PATH, authMiddleware, serverAdapter.getRouter());
```

**Verify:** log in via browser at `http://localhost:4000/auth/google`; `/api/me` returns your profile; `/admin/queues` loads when logged in and 401s when not.

---

## Phase 7 — Emails API, Elasticsearch, Slack

### 7.1 Emails & campaigns & senders routes (PRD §10)
- `GET /api/emails?status=scheduled|sent` per PRD §10.2 (always `where userId = req.user.id`); join `sender.email`; map to the response shape; return `total` via `count`.
- `GET /api/campaigns` with per-status counts (`groupBy`).
- `GET /api/senders`.

### 7.2 Elasticsearch (`services/search.service.ts`)
- `ensureIndex()` on API boot (create index with mapping from PRD §5.5 if missing).
- `indexEmails(rows)` → bulk; `updateEmailInIndex(id, partial)` → `update` with `doc` (ignore 404 by upserting `doc_as_upsert: true`).
- `searchEmails({ userId, q, status, page, limit })` → bool query: `filter: [{ term: { userId } }, status?]`, `must: multi_match { query: q, fields: ['recipient^2','subject^2','body'], fuzziness: 'AUTO' }`.
- `scripts/reindex.ts`: stream all emails from Postgres in batches → bulk index.
- All ES calls in services are wrapped so failures log a warning and never throw into the scheduling/sending path (search endpoint itself may return 503 with a clear message).

### 7.3 Slack (`services/slack.service.ts`, `services/crypto.service.ts`)
- `crypto.service.ts`: AES-256-GCM `encrypt(plain) → base64(iv|tag|cipher)`, `decrypt(...)` using `Buffer.from(env.ENCRYPTION_KEY, 'hex')`.
- `GET /api/slack/connect` → build authorize URL with `scope=incoming-webhook`, `state = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '10m' })`; respond `{ url }`.
- `GET /api/slack/callback` (no auth middleware — identity comes from the signed `state`): verify state; `axios.post('https://slack.com/api/oauth.v2.access', new URLSearchParams({ client_id, client_secret, code, redirect_uri }))`; check `data.ok`; encrypt `data.incoming_webhook.url`; upsert `SlackIntegration`; redirect `${FRONTEND_URL}/dashboard?slack=connected` (or `?slack=error`).
- `GET /api/slack/status`, `DELETE /api/slack`, `POST /api/slack/test`.
- `notifyRateLimitHit({ userId, senderEmail, senderId, window, limit, nextWindow })`:
  1. Look up the active Slack integration for `userId` first. If missing/disconnected, return without creating any Redis notification key.
  2. If `slack:notified:${senderId}:${window}` already exists, return.
  3. Acquire `slack:notify-lock:${senderId}:${window}` with `SET NX EX 30`; if another notifier owns it, return.
  4. Decrypt the webhook and `axios.post(webhookUrl, { text: ... }, { timeout: 5000 })`. Only after Slack returns a successful response, set `slack:notified:${senderId}:${window}` with a 7200-second TTL.
  5. On HTTP/API failure or timeout, log the error, do not set the success key, and delete the in-flight lock in `finally` so a later rate-limit event can retry. Never throw into the email worker. A crash after Slack accepts the message but before the success key is written can cause a duplicate alert; this is best-effort notification delivery.
- Wire `notifyRateLimitHit` into the processor's rate-limit-denied branch (fire-and-forget, `void notify(...).catch(log)`).

**Verify**
- `curl -b cookie.txt "localhost:4000/api/emails?status=scheduled"` returns items.
- `curl -b cookie.txt "localhost:4000/api/emails/search?q=hello"` returns hits.
- Connect Slack through the browser flow → `POST /api/slack/test` posts to your Slack channel.
- Trigger the rate limit (campaign `hourlyLimit=1`, 3 emails) → a real Slack message appears; disconnect Slack and repeat → no crash; reconnect → messages resume **without restarting** the server.

---

## Phase 8 — Frontend (follow `design.md`)

Read `design.md` completely first. Build the frontend **to the design from the start** — do not build a neutral version and restyle later.

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm i react-router-dom @tanstack/react-query axios papaparse react-hot-toast date-fns lucide-react
npm i -D tailwindcss@3 postcss autoprefixer @types/papaparse
npx tailwindcss init -p
```

**Setup (before any component):**
1. Tailwind `content: ['./index.html','./src/**/*.{ts,tsx}']`; paste the theme extension from `design.md` §2.6 (colors, fonts, shadows, keyframes).
2. `index.html`: Google Fonts `<link>` for Roboto (400;500;700) and Poppins (500;600;700), favicon, `<title>Sendora</title>`.
3. `src/index.css`: Tailwind directives, base styles (`body` bg `surface`, `font-sans`, text `ink`), global focus ring (`design.md` §2.3), `prefers-reduced-motion` rule.

**Build order (matches `design.md` §13.6):**
1. `src/types/` — `User`, `Email`, `EmailStatus`, `PaginatedResponse<T>`, `Campaign` (with status counts), `Sender`, `ScheduleRequest`, `ScheduleResponse`, `SlackStatus`, `ApiError`.
2. `src/api/client.ts` — axios instance (`baseURL = import.meta.env.VITE_API_BASE_URL`, `withCredentials: true`); response interceptor normalizes errors to `ApiError` (message from `error.message` in the body); a `401` on any call other than `/api/me` → redirect to `/login`. Then endpoint modules: `getMe`, `logout`, `scheduleEmails`, `getEmails`, `searchEmails`, `getCampaigns`, `getSenders`, Slack functions.
3. `context/AuthContext.tsx` + `useAuth` (loads `/api/me` with react-query); `routes/ProtectedRoute.tsx` (spinner while loading, redirect to `/login`) and `routes/PublicOnlyRoute.tsx` (authenticated users → `/dashboard`; landing page is the exception and stays accessible).
4. **UI primitives** (`components/ui/*`, `design.md` §9): `Button`, `IconButton`, `Input`, `Textarea`, `Modal`, `Drawer`, `Dropdown`, `Table` (+ responsive card mode below `md`), `Badge`/`StatusBadge`, `Chip`, `Skeleton`, `Spinner`, `EmptyState` (with inline SVG illustrations), `Avatar`, `FileDropzone`, `ProgressBar`, `Logo`. Style `react-hot-toast` as the dark bottom-left snackbar (§9).
5. **Auth page** (`pages/AuthPage.tsx`, `mode: 'login' | 'register'`, `design.md` §5) including the `?error=auth_failed` alert and the brand panel with `ProductMockup`.
6. **App shell** (`components/layout/*`, §6): `Header` (hamburger, logo, `SearchBar`, `UserMenu` with name/email/avatar/Sign out), `Sidebar` (Compose button, nav with count badges, Queue dashboard link, Slack status chip; collapses to icon rail / mobile drawer), `DashboardLayout` (renders `<Outlet />`, mounts `ComposeProvider`, handles `?slack=connected|error` toast and strips the param).
7. `utils/csv.ts` — `parseLeads(file: File): Promise<{ valid: string[]; invalidCount: number; duplicateCount: number }>`: CSV via `papaparse` (no header assumption, scan every cell), TXT split on newlines/commas/semicolons; extract with a robust email regex; lowercase; dedupe. Unit-test it.
8. **Scheduled and Sent pages** (§8.1, §8.2) using a shared `EmailsTable` (`variant: 'scheduled' | 'sent'`) and `EmailDetailDrawer` (§8.5); `useEmails(status, page, limit, campaignId?)` with `refetchInterval: 10_000`; skeleton, empty, error + retry, pagination; `StatusBadge` maps `processing` → "Sending"; "Rescheduled (rate limit)" chip when `deferredCount > 0`.
9. **Compose window** (§7): `ComposeProvider` holds open/minimized/maximized state and an in-memory draft; `ComposeWindow` + `LeadUploader` ("N valid email addresses detected"); live "first/last send" helper text; validation mirroring server limits; `useMutation` → snackbar with **View** action → close → `invalidateQueries(['emails'])`, `['campaigns']`. Convert `datetime-local` to an ISO UTC string before sending. Full-screen on mobile.
10. **Settings page** (§8.6): `SlackCard` (status, Connect → `window.location.href = url`, Send test message, Disconnect with confirm), senders list, queue-dashboard link (`${API}/admin/queues`, new tab), account + Sign out.
11. **Campaigns page** (§8.3) with `CampaignCard` and `ProgressBar`; links to Scheduled/Sent with `?campaignId=`.
12. **Search page** (§8.4): reads `q` from the URL, status filter chips, `<mark>` highlighting, 503 friendly message.
13. **Landing page** (§4) from `components/landing/*`; **404 page** (§8.7).
14. `App.tsx` — router per `design.md` §3 (`/dashboard` → `Navigate` to `/dashboard/scheduled` **preserving `location.search`**), `QueryClientProvider`, `AuthProvider`, `<Toaster />`.

**Verify (manual walk-through):**
- Landing → Get started → register page → Google login → lands on `/dashboard/scheduled`; header shows name, email, avatar; Sign out works.
- Compose with a CSV of 5 addresses (count shows 5), schedule, see rows with correct times, watch them move to Sent; open the detail drawer and the Ethereal preview link.
- Search finds a scheduled and a sent email; Campaigns shows the progress bar updating.
- Empty states (fresh account), loading skeletons (throttle network), error states (stop the backend).
- Slack connect/test/disconnect from Settings; `/dashboard?slack=connected` forwards correctly and shows a snackbar.
- Resize to 360 px, 768 px and 1280 px: sidebar drawer/rail, table → cards, compose full-screen on mobile.

---

## Phase 9 — Design QA against `design.md`

1. Go through `design.md` §3 (pages) and §9 (components) as a checklist; mark each Done/Partial/Not done for `report.md`.
2. Colour audit: only tokens from §2.1/§2.6 are used; no raw hex values in components apart from the inline SVG illustrations and Google "G" mark. `red-300/400` are never used for text on white.
3. Accessibility pass (§11): keyboard-only walkthrough of login, compose, table → drawer, settings; focus trap and `Esc` on Modal/Drawer/Compose/Dropdown; `aria-label` on every icon-only button; status never conveyed by colour alone; `prefers-reduced-motion` respected.
4. Compare each screen with its spec (spacing, radii, copy from §12) and fix visible deviations; record any deliberate deviation in `report.md`.
5. Run `npx tsc --noEmit` and a production build (`npm run build`) in `frontend/`.

---

## Phase 10 — Scripts, Tests, Hardening

1. **`scripts/load-test.ts`:** logs in is not possible from a script, so create a test user directly in the DB (or accept `LOAD_TEST_USER_ID` env/arg), then call the schedule **service function** directly (not HTTP) with 1200 generated addresses (`user1@example.test` …), `startTime = now`, `delaySeconds = 0`, `hourlyLimit` from args (default 50). After scheduling, poll every 5 s for ~60 s and print a table: counts of `scheduled`/`processing`/`sent`/`failed`, deferred count, per-sender sent in current window. Expected: sent per sender never exceeds the limit; no `failed`; the rest deferred to next window.
2. **Unit tests (vitest):** `utcHourKey`, `startOfNextUtcHour`, lead parsing/dedupe, schedule time computation (`scheduledAt` spacing + round-robin sender assignment), rate limiter against a real local Redis if available (otherwise mark skipped).
3. **Duplicate-safety test:** run two worker processes (`npm run dev:worker` in two terminals) and schedule 50 emails; confirm each `Email.id` has exactly one `sent` transition and Ethereal received 50 messages (not 100).
4. **Restart test:** schedule 5 emails starting 2 min ahead; kill API + worker (`Ctrl+C`/`kill -9` both); restart after ~1 min; confirm persisted jobs are recovered and sent at the expected times. Record whether duplicates occurred in this test, but do not claim this proves absolute exactly-once delivery. Also test `docker compose restart redis` mid-run (AOF should preserve; reconcile should repair missing jobs).
5. **DB-commit/enqueue-failure test:** inject a failure after the Prisma transaction commits but before/during `queue.addBulk`. Verify the campaign and email rows remain persisted, immediate targeted reconciliation is attempted, the API returns `202` with `persisted: true` and `queueStatus: "pending_reconciliation"` if jobs remain missing, and a subsequent boot/reconciliation enqueues missing jobs using the same `jobId` without creating duplicate DB rows/campaigns. Verify the frontend displays the saved/pending state and does not blindly resubmit.
6. **SMTP ambiguity documentation test/review:** inspect README and report to confirm they explicitly state that deterministic Message-ID is correlation only and ordinary SMTP cannot guarantee exactly-once delivery across the SMTP-accepted/DB-not-updated crash window.
7. **Cron audit:** `grep -rniE "cron|agenda" backend/src backend/package.json` → must show nothing relevant.
8. Lint & type-check both apps (`npx tsc --noEmit`, `npm run lint` if configured). Fix errors.
9. Security sanity: all `/api/*` scoped by `userId`; no secrets logged; `.env` ignored by git; Slack webhook stored encrypted.

---

## Phase 11 — Documentation & Delivery

1. **README.md** — per PRD §16. Include an architecture diagram (ASCII or Mermaid), the exact chosen values (`MIN_DELAY_BETWEEN_EMAILS_MS=2000`, `MAX_EMAILS_PER_HOUR_PER_SENDER=200`, `WORKER_CONCURRENCY=5`), a "How restart safety works" section, the DB-commit/enqueue-failure recovery behavior and API `202` response, and an explicit SMTP exactly-once limitation. State that deterministic Message-ID does not guarantee provider-side deduplication.
2. **`report.md`** — per PRD §15, filled with **real** results and honest statuses (include the page/component checklist from `design.md` §3/§9). Mark Google/Slack items as *Unverified* if you could not run them with real credentials. Include the SMTP ambiguity, enqueue-failure recovery test result, Slack notification retry behavior, send-start spacing test and best-effort ordering limitation.
3. Ensure `.env.example` files are complete and `.env` is not committed.
4. Final commit. (User will create the private GitHub repo, add `Mitrajit` and `Yadav036`, and record the demo video.)

---

## Common Pitfalls (read before coding)

| Pitfall | Fix |
|---|---|
| BullMQ worker throws `maxRetriesPerRequest` error | Use a dedicated ioredis connection with `maxRetriesPerRequest: null` for Queue/Worker. |
| Deferred jobs consume attempts or show as failed | Use `job.moveToDelayed(ts, token)` + `throw new DelayedError()`; never throw a normal error for deferral. |
| Rate limit race between workers | Only use the Lua check-and-increment; never GET then INCR in JS. |
| Duplicate sends after restart | Keep `jobId = email.id` and atomic DB claims; deterministic Message-ID is correlation only, not SMTP deduplication. Document the SMTP-accepted/DB-not-updated ambiguity. |
| Jobs lost if Redis restarts | Redis AOF on in compose; `reconcileQueue()` on boot. |
| Timezones | Store/compare UTC; windows are UTC hours; frontend converts `datetime-local` → ISO UTC. |
| Cookies not sent from frontend | `withCredentials: true` on axios + `credentials: true` in CORS + exact `origin`. |
| Google `redirect_uri_mismatch` | URI in Google console must exactly equal `GOOGLE_REDIRECT_URI`. |
| Slack rejects redirect URI | Use an HTTPS tunnel and update `SLACK_REDIRECT_URI`/`BACKEND_URL`. |
| Elasticsearch won't start (memory) | Keep `ES_JAVA_OPTS=-Xms512m -Xmx512m`; on Linux set `vm.max_map_count=262144`. |
| Huge `createMany` payloads | Chunk at 1000 rows; `addBulk` at 500 jobs. |
| ES failures breaking sends | Wrap every ES call; log and continue. |
| Slack alert suppression / spam | Check active integration before dedupe; use an in-flight lock and set the success dedupe key only after Slack confirms success. On failure, clear the in-flight lock so a later event can retry. |
| Slack callback lands on `/dashboard?slack=connected` and loses the query | `/dashboard` must `Navigate` to `/dashboard/scheduled` preserving `location.search`. |
| Fonts/icons missing or layout shifts | Load Roboto + Poppins in `index.html`; use only `lucide-react` icons; define Tailwind tokens before components. |
| Auth failure leaves user on a JSON error page | Backend redirects to `/login?error=auth_failed`; `AuthPage` renders the inline alert. |

---

## Definition of Done

- All acceptance criteria in PRD §14 pass (or are honestly marked in `report.md`).
- `README.md` and `report.md` exist in the repo root and are accurate.
- Both apps type-check with strict TypeScript; no cron usage; `.env` not committed.
- Every page in `design.md` §3 and every component in §9 is implemented (or honestly marked otherwise in `report.md`), and the frontend follows the design's tokens, layout and copy.
