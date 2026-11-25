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

## Temporary approved cleanup endpoint

The separate `POST /api/admin/queue-cleanup/execute` endpoint accepts only the 19 fixed job IDs approved for this maintenance operation. It additionally requires the exact confirmation phrase below. It uses an atomic Redis lock on the existing queue connection, verifies each job and checks both corresponding Email identifiers immediately before calling BullMQ's individual `job.remove()`. It never performs bulk removal or writes PostgreSQL. Remove this endpoint after the approved cleanup is complete.

Deploy this code through the existing production Docker service after `ADMIN_EMAILS` is configured. The Docker build compiles the route and copies `dist`; no schema migration or worker change is needed. Do not call this endpoint until the approved production preview has been reviewed.

Authenticated production request:

```http
POST https://<production-backend-host>/api/admin/queue-cleanup/execute
Authorization: Bearer <administrator-jwt>
Content-Type: application/json
```

Exact JSON body:

```json
{
  "confirm": "DELETE_19_APPROVED_ORPHANED_JOBS",
  "jobIds": [
    "fc72dcc6-2ed6-4f08-ad70-0363491e543d",
    "8a69ee94-70f9-4fba-96f2-53ffd717adef",
    "41ae12ec-bdf7-4e5c-aaf3-55be7f8d0d28",
    "f6fee3b7-77f2-47d8-add1-db2a7eb1feee",
    "fee7b958-246e-439a-afc4-97c504eff0ab",
    "6283d76f-9f41-4c15-bb2a-357ae897a193",
    "3d63394f-528a-46f3-b5e3-7c9dfd2038cd",
    "34306197-b84d-4476-8127-ff909f48e29d",
    "2857141e-1a8e-4294-b504-2718a2fe9b66",
    "f719a2a6-08a9-47e0-ab0a-a19229f4d64c",
    "b5af3206-29f8-45e9-ba4b-02155bcff421",
    "860edcf9-ede1-4adc-9642-8cea0bcfdf2c",
    "6c9c3b3c-8aad-4dcf-b6af-496d19dbb401",
    "2d3bb819-1630-4756-ae13-1ee32ace203c",
    "ed67acb5-e416-4592-8b0c-24e4ef14810b",
    "84b28711-6e81-4660-aec4-e2deeeb1e084",
    "fd0c1103-77ba-4467-88fa-087516a10785",
    "aea4f343-a746-4518-b668-76925d91c646",
    "ced2b33c-e1b5-4416-80bf-5f9266c1a4a2"
  ]
}
```

The response distinguishes `removed`, `skipped`, and `failed` per job and includes requested, removed, skipped, and failed counts plus queue counts before and after. Only a resolved BullMQ individual removal is counted as removed. Invalid confirmation, duplicates, empty lists, and any ID outside the fixed allowlist are rejected before Redis or PostgreSQL operations.
