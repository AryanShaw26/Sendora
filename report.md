# Implementation Report

## 1. Summary
Sendora is a production-grade email scheduler service and web dashboard. It accepts email campaigns, persists them in PostgreSQL, and schedules them with BullMQ delayed jobs backed by Redis (with AOF persistence). It supports multi-sender distribution with Ethereal SMTP, configurable per-sender minimum delay spacing, per-sender atomic hourly rate limiting (with automatic rescheduling of over-limit emails to the next UTC hour window), Slack alert webhooks, full-text Elasticsearch indexing, Bull Board administrative queue monitoring, and a responsive Gmail-inspired React dashboard adhering to `design.md`.

## 2. Requirements Checklist
| ID | Requirement | Status (Done / Partial / Not done / Unverified) | Notes / file references |
|----|-------------|----------------------------------------------------|-------------------------|
| B1 | REST API to schedule a campaign | In Progress | Phase 4 |
| B2 | Persist campaigns and individual emails in PostgreSQL | In Progress | Phase 2 |
| B3 | BullMQ delayed job for each email (`jobId = email.id`) | In Progress | Phase 3 |
| B4 | Multi-sender Ethereal SMTP support | In Progress | Phase 2, Phase 5 |
| B5 | Worker with configurable concurrency | In Progress | Phase 5 |
| B6 | Per-sender minimum spacing between send starts | In Progress | Phase 5 |
| B7 | Per-sender atomic hourly rate limit (Lua, next window reschedule) | In Progress | Phase 5 |
| B8 | Slack notification on rate limit hit | In Progress | Phase 7 |
| B9 | Persistence / restart safety & reconciliation | In Progress | Phase 3, Phase 5 |
| B10 | Idempotency (atomic DB claim, deterministic jobId, Message-ID) | In Progress | Phase 5 |
| B11 | Elasticsearch indexing & search endpoint | In Progress | Phase 7 |
| B12 | Bull Board live dashboard at `/admin/queues` | In Progress | Phase 6 |
| B13 | Google OAuth login + httpOnly JWT cookie session | In Progress | Phase 6 |
| B14 | Retry transient SMTP failures with exponential backoff | In Progress | Phase 5 |
| F1 | Google login & dashboard shell with user menu | In Progress | Phase 8 |
| F2 | Dashboard shell (sidebar, navigation, compose button) | In Progress | Phase 8 |
| F3 | Gmail-style floating compose window & lead uploader | In Progress | Phase 8 |
| F4 | Scheduled table (Email, Subject, Time, Status) | In Progress | Phase 8 |
| F5 | Sent table (Email, Subject, Sent time, Status) | In Progress | Phase 8 |
| F6 | Slack Connect / Disconnect in Settings | In Progress | Phase 8 |
| F7 | Toast notifications, auto-refresh polling | In Progress | Phase 8 |
| F8 | Typed API client, reusable UI components | In Progress | Phase 8 |
| F9 | Visual design tokens from `design.md` | In Progress | Phase 8 |
| F10 | Public pages (Landing, Login, Register, 404) | In Progress | Phase 8 |
| F11 | App pages (Campaigns, Search, Settings, Detail Drawer) | In Progress | Phase 8 |
| AC 1 | Docker compose up starts Postgres, Redis, ES healthy | Done | `docker-compose.yml` verified |
| AC 2 | Backend starts API + worker; `/health` returns ok | Done | Verified: `{"status":"ok","db":"up","redis":"up","elasticsearch":"up"}` |
| AC 3 | Google login works; header shows user info | Pending | Phase 6, Phase 8 |
| AC 4 | Scheduling 5 emails sends via Ethereal with previewUrl | Pending | Phase 5 |
| AC 5 | Restart test: future emails preserved and sent | Pending | Phase 10 |
| AC 6 | Concurrent-worker duplicate avoidance (atomic claim) | Pending | Phase 10 |
| AC 7 | Rate limit: over-limit emails rescheduled to next hour | Pending | Phase 5, Phase 10 |
| AC 8 | Min delay: consecutive send starts spaced >= min delay | Pending | Phase 5, Phase 10 |
| AC 9 | Concurrency configurable via env | Pending | Phase 5 |
| AC 10 | Slack alerts on rate limit hit | Pending | Phase 7 |
| AC 11 | Elasticsearch search matches emails | Pending | Phase 7 |
| AC 12 | Bull Board shows live jobs | Pending | Phase 6 |
| AC 13 | Load test with 1000+ emails | Pending | Phase 10 |
| AC 14 | No cron usage anywhere in codebase | Pending | Verified during audit |
| AC 15 | Frontend loading/empty/error states | Pending | Phase 8, Phase 9 |
| AC 16 | README.md and report.md complete | In Progress | Phase 11 |
| AC 17 | Frontend matches `design.md` visual specs | Pending | Phase 9 |

### Pages Inventory (`design.md` §3)
| Page / Route | Status | Notes |
|---|---|---|
| `/` (Landing) | Pending | Phase 8 |
| `/login` (Sign in) | Pending | Phase 8 |
| `/register` (Create account) | Pending | Phase 8 |
| `/dashboard` (Redirects to scheduled preserving query) | Pending | Phase 8 |
| `/dashboard/scheduled` (Scheduled Emails) | Pending | Phase 8 |
| `/dashboard/sent` (Sent Emails) | Pending | Phase 8 |
| `/dashboard/campaigns` (Campaigns) | Pending | Phase 8 |
| `/dashboard/search?q=` (Search) | Pending | Phase 8 |
| `/dashboard/settings` (Settings) | Pending | Phase 8 |
| `*` (404) | Pending | Phase 8 |

### Component Inventory (`design.md` §9)
| Component | Status | Notes |
|---|---|---|
| `Button` | Pending | Phase 8 |
| `IconButton` | Pending | Phase 8 |
| `Input` / `Textarea` | Pending | Phase 8 |
| `Badge` / `StatusBadge` | Pending | Phase 8 |
| `Chip` | Pending | Phase 8 |
| `Table` | Pending | Phase 8 |
| `Skeleton` | Pending | Phase 8 |
| `EmptyState` | Pending | Phase 8 |
| `Modal` / `Drawer` / `Dropdown` | Pending | Phase 8 |
| `Snackbar` (Toast) | Pending | Phase 8 |
| `Avatar` | Pending | Phase 8 |
| `FileDropzone` | Pending | Phase 8 |
| `Logo` & `ProductMockup` | Pending | Phase 8 |
| `ProgressBar` | Pending | Phase 8 |

## 3. Architecture Decisions & Deviations
- **Delayed BullMQ Jobs:** Zero cron. Every email is enqueued with `jobId = email.id` and delay computed against UTC timestamps.
- **Database Source of Truth & Reconciliation:** PostgreSQL stores the state of truth. If BullMQ loses jobs (e.g. queue purge or transient failure), `reconcileQueue()` re-enqueues missing jobs safely without duplicate records.
- **Rate Limit & Send Spacing Separation:** Hourly limits are tracked via Redis Lua scripts against UTC hour windows (`YYYYMMDDHH`). Minimum delay between send starts is enforced per sender via a Redis `SET NX PX` lock acquired immediately before calling SMTP `sendMail`.
- **SMTP/DB Crash Ambiguity:** We document that while atomic DB claims and deterministic IDs prevent concurrent duplicate processing, an SMTP-accepted send followed by an immediate crash before PostgreSQL updates to `sent` cannot be deduplicated by standard SMTP servers.

## 4. How to Run (verified commands)
### Infrastructure:
```bash
docker-compose up -d
docker-compose ps
```

## 5. Test Evidence
- Phase 0 Verification:
  - Docker Compose started `sendora-postgres-1`, `sendora-redis-1`, `sendora-elasticsearch-1`.
  - Redis responded to `ping` with `PONG`.
  - Postgres responded to `pg_isready -U sendora` with accepting connections.

## 6. Known Issues & Limitations
- Standard SMTP does not guarantee server-side deduplication via `Message-ID`. If a crash occurs after SMTP accepts a message but before the DB status is committed as `sent`, recovery may re-send the message.

## 7. Items Needing the User's Action
- Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) to be filled in `.env` if verifying with live Google accounts.
- Slack App credentials (`SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`) to be filled in `.env` if connecting to live Slack workspaces.
- GitHub repository access for `Mitrajit` and `Yadav036`.

## 8. Suggested Demo Script (≤ 5 min)
(To be updated in Phase 11)

## 9. Possible Improvements
(To be updated in Phase 11)
