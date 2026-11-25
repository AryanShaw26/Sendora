# Temporary queue cleanup preview endpoint

This read-only endpoint inspects completed jobs in the same configured `emailQueue` instance used by Bull Board and checks each job against the existing Prisma `Email` table. It has no delete, retry, or requeue operation.

## Deploy

1. Set `ADMIN_EMAILS` in the production Render Web Service environment to the comma-separated email address or addresses allowed to inspect the preview. An empty or unset value denies every user.
2. Deploy the backend commit using the service's existing Docker configuration. The backend Docker build copies `src`, runs `npm run build`, and includes the compiled route in `dist`.
3. Wait for the `sendora-api` deployment to become healthy. No database migration is required.

The endpoint fails closed outside `NODE_ENV=production`, for a missing/local Redis endpoint, for a missing/local PostgreSQL URL, or if either configured connection cannot be verified. It reuses `emailQueue` and the shared Prisma client and never returns connection credentials.

## Production request

Send an authenticated `GET` request to:

```text
https://<production-backend-host>/api/admin/queue-cleanup/preview
```

PowerShell example using an already-issued administrator JWT stored in the caller's environment:

```powershell
curl.exe --request GET `
  --url "https://<production-backend-host>/api/admin/queue-cleanup/preview" `
  --header "Authorization: Bearer $env:SENDORA_ADMIN_JWT" `
  --header "Accept: application/json"
```

The existing JWT middleware validates the token. The authenticated account email must also match `ADMIN_EMAILS`; unauthenticated requests receive 401 and authenticated non-admin requests receive 403.

## Interpreting the response

- `queue.name` and `queue.prefix` identify the BullMQ queue inspected.
- `queue.countsBeforeInspection` reports each supported BullMQ state before the scan.
- `completedJobsInspected` is the number of listed completed jobs individually checked.
- Each `jobs` entry reports `jobId`, `emailId`, state at the start and end of inspection, whether either identifier matched an Email row, the matching Email IDs, whether state changed during inspection, and `candidate`.
- A job is a candidate only if it existed, was still completed at both state checks, and neither `job.id` nor `job.data.emailId` matched an Email record.
- `candidateCount` totals those entries; `inspectedAt` is the report timestamp.
- A 409 response means completed jobs changed during pagination, so no complete report was produced; run a fresh preview.
- A 503 response means production configuration or a Redis/PostgreSQL connection could not be verified.

This report is informational only. Review the complete production response before authorizing any separate cleanup implementation. Remove this temporary endpoint after verification.
