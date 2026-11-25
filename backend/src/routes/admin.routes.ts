import { Router, Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { authMiddleware } from "../middleware/auth";
import { emailQueue } from "../queue/queue";
import { prisma } from "../db/prisma";
import { randomUUID } from "node:crypto";

const router = Router();

function adminEmailAllowlist(): Set<string> {
  return new Set(
    (typeof env.ADMIN_EMAILS === "string" ? env.ADMIN_EMAILS : "").split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const email = req.user?.email.trim().toLowerCase();
  if (!email || !adminEmailAllowlist().has(email)) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Administrator access required" },
    });
    return;
  }
  next();
}

function readInfoField(info: string, field: string): string | null {
  return info.match(new RegExp(`^${field}:(.+)$`, "m"))?.[1] ?? null;
}

const PREVIEW_QUEUE_STATES = [
  "active",
  "waiting",
  "delayed",
  "completed",
  "failed",
  "paused",
  "waiting-children",
  "prioritized",
];
const PREVIEW_PAGE_SIZE = 100;
const PREVIEW_CONNECTION_TIMEOUT_MS = 10_000;

type PreviewJob = {
  id?: string;
  data?: { emailId?: string };
  getState(): Promise<string>;
};

export interface QueuePreviewSource {
  name: string;
  opts: { prefix?: string };
  waitUntilReady(): Promise<unknown>;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  getJobs(types: "completed"[], start: number, end: number): Promise<PreviewJob[]>;
  getJob(jobId: string): Promise<PreviewJob | undefined>;
}

export interface QueuePreviewEmailStore {
  findMany(args: {
    where: { id: { in: string[] } };
    select: { id: true };
  }): Promise<Array<{ id: string }>>;
}

export type QueuePreviewDatabaseCheck = () => Promise<unknown>;

export class QueuePreviewError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "QueuePreviewError";
  }
}

function validateProductionConnections(): void {
  if (env.NODE_ENV !== "production") {
    throw new QueuePreviewError("Production connections are required", 503, "PRODUCTION_CONFIG_REQUIRED");
  }
  const redisHost = env.REDIS_HOST.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !redisHost ||
    redisHost === "localhost" ||
    redisHost === "::1" ||
    redisHost === "0:0:0:0:0:0:0:1" ||
    /^127(?:\.\d{1,3}){3}$/.test(redisHost) ||
    !Number.isInteger(env.REDIS_PORT) ||
    env.REDIS_PORT < 1 ||
    env.REDIS_PORT > 65535
  ) {
    throw new QueuePreviewError("Production Redis configuration is missing", 503, "REDIS_CONFIG_REQUIRED");
  }

  try {
    const databaseUrl = new URL(env.DATABASE_URL);
    const databaseHost = databaseUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
      !databaseHost ||
      databaseHost === "localhost" ||
      databaseHost === "::1" ||
      databaseHost === "0:0:0:0:0:0:0:1" ||
      /^127(?:\.\d{1,3}){3}$/.test(databaseHost)
    ) {
      throw new Error("Invalid production PostgreSQL endpoint");
    }
  } catch {
    throw new QueuePreviewError("Production PostgreSQL configuration is missing", 503, "DATABASE_CONFIG_REQUIRED");
  }
}

function getJobIdentifiers(job: PreviewJob): string[] {
  return [...new Set([job.id, job.data?.emailId].filter((id): id is string => Boolean(id)))];
}

async function withConnectionTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Connection verification timed out")), PREVIEW_CONNECTION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timeout!);
  }
}

export async function inspectCompletedQueue(options: {
  queue: QueuePreviewSource;
  emailStore: QueuePreviewEmailStore;
  checkDatabaseConnection: QueuePreviewDatabaseCheck;
  inspectedAt?: Date;
}): Promise<Record<string, unknown>> {
  const { queue, emailStore, checkDatabaseConnection } = options;
  validateProductionConnections();

  // Both checks use the existing configured clients: no connection is created here.
  await withConnectionTimeout(checkDatabaseConnection());
  await withConnectionTimeout(queue.waitUntilReady());
  const countsBeforeInspection = await withConnectionTimeout(
    queue.getJobCounts(...PREVIEW_QUEUE_STATES),
  );
  const expectedCompleted = countsBeforeInspection.completed ?? 0;
  const listedJobs: PreviewJob[] = [];
  const seenIds = new Set<string>();

  // Offset pagination is checked against the initial count; any concurrent list movement aborts.
  for (let start = 0; start < expectedCompleted; start += PREVIEW_PAGE_SIZE) {
    const end = Math.min(start + PREVIEW_PAGE_SIZE - 1, expectedCompleted - 1);
    const page = await withConnectionTimeout(queue.getJobs(["completed"], start, end));
    if (page.length !== end - start + 1) {
      throw new QueuePreviewError("Completed queue changed during pagination; retry the preview", 409, "QUEUE_CHANGED_DURING_INSPECTION");
    }
    for (const job of page) {
      if (!job.id || seenIds.has(job.id)) {
        throw new QueuePreviewError("Completed queue changed during pagination; retry the preview", 409, "QUEUE_CHANGED_DURING_INSPECTION");
      }
      seenIds.add(job.id);
      listedJobs.push(job);
    }
  }

  if (listedJobs.length !== expectedCompleted) {
    throw new QueuePreviewError("Completed queue changed during pagination; retry the preview", 409, "QUEUE_CHANGED_DURING_INSPECTION");
  }

  const verificationResults = [];
  for (const listedJob of listedJobs) {
    const jobId = listedJob.id!;
    const firstRead = await withConnectionTimeout(queue.getJob(jobId));
    const stateAtStart = firstRead
      ? await withConnectionTimeout(firstRead.getState())
      : "missing";
    const emailId = firstRead?.data?.emailId ?? listedJob.data?.emailId ?? null;
    const identifiers = [...new Set([
      ...getJobIdentifiers(listedJob),
      ...(firstRead ? getJobIdentifiers(firstRead) : []),
    ])];
    const matchingEmails = identifiers.length
      ? await withConnectionTimeout(
          emailStore.findMany({
            where: { id: { in: identifiers } },
            select: { id: true },
          }),
        )
      : [];
    const matchedEmailIds = matchingEmails.map(({ id }) => id);
    const latestJob = await withConnectionTimeout(queue.getJob(jobId));
    const currentState = latestJob
      ? await withConnectionTimeout(latestJob.getState())
      : "missing";
    const stateChangedDuringInspection = currentState !== stateAtStart;
    const databaseRecordExists = matchedEmailIds.length > 0;

    verificationResults.push({
      jobId,
      state: currentState,
      stateAtStart,
      emailId,
      databaseRecordExists,
      matchedEmailIds,
      stateChangedDuringInspection,
      candidate:
        Boolean(firstRead) &&
        stateAtStart === "completed" &&
        currentState === "completed" &&
        !databaseRecordExists,
    });
  }

  return {
    queue: {
      name: queue.name,
      prefix: queue.opts.prefix ?? "bull",
      countsBeforeInspection,
    },
    completedJobsInspected: verificationResults.length,
    jobs: verificationResults,
    candidateCount: verificationResults.filter((result) => result.candidate).length,
    inspectedAt: (options.inspectedAt ?? new Date()).toISOString(),
  };
}

const APPROVED_CLEANUP_JOB_IDS = new Set([
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
  "ced2b33c-e1b5-4416-80bf-5f9266c1a4a2",
]);
const DELETE_CONFIRMATION = "DELETE_19_APPROVED_ORPHANED_JOBS";
const CLEANUP_LOCK_TTL_MS = 120_000;
const LOCK_RENEW_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";
const LOCK_RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

type CleanupJob = PreviewJob & { remove(): Promise<void> };
type CleanupRedisClient = {
  set(key: string, value: string, ...args: Array<string | number>): Promise<string | null>;
  eval(script: string, numberOfKeys: number, ...args: string[]): Promise<number | string>;
};
type CleanupResult = {
  jobId: string;
  result: "removed" | "skipped" | "failed";
  reason: string;
};

async function executeApprovedCleanup(options: {
  queue: QueuePreviewSource;
  emailStore: QueuePreviewEmailStore;
  redis: CleanupRedisClient;
  jobIds: string[];
}): Promise<Record<string, unknown>> {
  const { queue, emailStore, redis, jobIds } = options;
  validateProductionConnections();
  // The health query is read-only and uses the already-instantiated Prisma client.
  await withConnectionTimeout(prisma.$queryRaw`SELECT 1`);
  await withConnectionTimeout(queue.waitUntilReady());

  const lockKey = `${queue.opts.prefix ?? "bull"}:${queue.name}:admin:cleanup:execute-lock`;
  const lockToken = randomUUID();
  const acquired = await withConnectionTimeout(
    redis.set(lockKey, lockToken, "PX", CLEANUP_LOCK_TTL_MS, "NX"),
  );
  if (acquired !== "OK") {
    throw new QueuePreviewError("Another queue cleanup request is in progress", 409, "CLEANUP_ALREADY_RUNNING");
  }

  let lockLost = false;
  let renewalInFlight = false;
  const renewLock = async (): Promise<boolean> => {
    if (lockLost) return false;
    try {
      const result = await withConnectionTimeout(
        redis.eval(LOCK_RENEW_SCRIPT, 1, lockKey, lockToken, String(CLEANUP_LOCK_TTL_MS)),
      );
      if (Number(result) !== 1) lockLost = true;
      return !lockLost;
    } catch {
      lockLost = true;
      return false;
    }
  };
  const renewalTimer = setInterval(() => {
    if (renewalInFlight || lockLost) return;
    renewalInFlight = true;
    void renewLock()
      .catch(() => { lockLost = true; })
      .finally(() => { renewalInFlight = false; });
  }, CLEANUP_LOCK_TTL_MS / 3);

  const results: CleanupResult[] = [];
  let countsBeforeExecution: Record<string, number> | null = null;
  let countsAfterExecution: Record<string, number> | null = null;
  try {
    countsBeforeExecution = await withConnectionTimeout(
      queue.getJobCounts(...PREVIEW_QUEUE_STATES),
    );

    for (const jobId of jobIds) {
      if (!(await renewLock())) {
        results.push({ jobId, result: "skipped", reason: "cleanup lock ownership was lost" });
        continue;
      }

      let verificationStep = "Redis job lookup";
      try {
        verificationStep = "Redis job lookup";
        const job = await withConnectionTimeout(queue.getJob(jobId)) as CleanupJob | undefined;
        if (!job) {
          results.push({ jobId, result: "skipped", reason: "job does not exist" });
          continue;
        }
        verificationStep = "Redis job state check";
        if (await withConnectionTimeout(job.getState()) !== "completed") {
          results.push({ jobId, result: "skipped", reason: "job state is not completed" });
          continue;
        }
        if (job.id !== jobId) {
          results.push({ jobId, result: "skipped", reason: "job.id does not match submitted ID" });
          continue;
        }
        if (job.data?.emailId !== jobId) {
          results.push({ jobId, result: "skipped", reason: "job.data.emailId does not match submitted ID" });
          continue;
        }

        const identifiers = [...new Set([job.id, job.data.emailId])];
        verificationStep = "PostgreSQL Email lookup";
        const matchingEmails = await withConnectionTimeout(
          emailStore.findMany({ where: { id: { in: identifiers } }, select: { id: true } }),
        );
        if (matchingEmails.length > 0) {
          results.push({ jobId, result: "skipped", reason: "matching Email record exists" });
          continue;
        }

        if (!(await renewLock())) {
          results.push({ jobId, result: "skipped", reason: "cleanup lock ownership was lost before final verification" });
          continue;
        }

        // Re-read every required Redis field immediately before removal.
        verificationStep = "Redis final job lookup";
        const finalJob = await withConnectionTimeout(queue.getJob(jobId)) as CleanupJob | undefined;
        if (!finalJob) {
          results.push({ jobId, result: "skipped", reason: "job disappeared before removal" });
          continue;
        }
        verificationStep = "Redis final state check";
        if (await withConnectionTimeout(finalJob.getState()) !== "completed") {
          results.push({ jobId, result: "skipped", reason: "job state changed before removal" });
          continue;
        }
        if (finalJob.id !== jobId) {
          results.push({ jobId, result: "skipped", reason: "job.id changed before removal" });
          continue;
        }
        if (finalJob.data?.emailId !== jobId) {
          results.push({ jobId, result: "skipped", reason: "job.data.emailId changed before removal" });
          continue;
        }

        verificationStep = "PostgreSQL final Email lookup";
        const finalMatches = await withConnectionTimeout(
          emailStore.findMany({ where: { id: { in: [finalJob.id, finalJob.data.emailId] } }, select: { id: true } }),
        );
        if (finalMatches.length > 0) {
          results.push({ jobId, result: "skipped", reason: "matching Email record appeared before removal" });
          continue;
        }
        if (lockLost) {
          results.push({ jobId, result: "skipped", reason: "cleanup lock ownership was lost before removal" });
          continue;
        }

        try {
          // Await BullMQ directly so a timeout cannot leave a detached removal command running.
          // A resolved Job.remove() is BullMQ's confirmation; failed calls are never retried.
          await finalJob.remove();
          results.push({ jobId, result: "removed", reason: "BullMQ confirmed individual job removal" });
        } catch {
          results.push({ jobId, result: "failed", reason: "BullMQ individual removal failed or could not be confirmed" });
        }
      } catch (error) {
        const suffix = error instanceof Error && error.message.includes("timed out")
          ? " timed out"
          : " failed";
        const reason = `${verificationStep}${suffix}`;
        results.push({ jobId, result: "skipped", reason });
      }
    }

    try {
      countsAfterExecution = await withConnectionTimeout(
        queue.getJobCounts(...PREVIEW_QUEUE_STATES),
      );
    } catch {
      countsAfterExecution = null;
    }
  } finally {
    clearInterval(renewalTimer);
    try {
      await withConnectionTimeout(
        redis.eval(LOCK_RELEASE_SCRIPT, 1, lockKey, lockToken),
      );
    } catch {
      // The lock has a TTL; a failed compare-and-release never deletes another request's lock.
    }
  }

  const removedCount = results.filter(({ result }) => result === "removed").length;
  return {
    requestedJobCount: jobIds.length,
    successfullyRemovedCount: removedCount,
    skippedCount: results.filter(({ result }) => result === "skipped").length,
    failedRemovalCount: results.filter(({ result }) => result === "failed").length,
    results,
    queueCountsBefore: countsBeforeExecution,
    queueCountsAfter: countsAfterExecution,
    executionTimestamp: new Date().toISOString(),
  };
}

function parseApprovedCleanupRequest(body: unknown): string[] {
  if (!body || typeof body !== "object") {
    throw new QueuePreviewError("A JSON request body is required", 400, "INVALID_CLEANUP_REQUEST");
  }
  const request = body as { confirm?: unknown; jobIds?: unknown };
  if (request.confirm !== DELETE_CONFIRMATION) {
    throw new QueuePreviewError("Confirmation phrase is missing or invalid", 400, "INVALID_CONFIRMATION");
  }
  if (!Array.isArray(request.jobIds) || request.jobIds.length === 0) {
    throw new QueuePreviewError("jobIds must be a non-empty array", 400, "INVALID_JOB_IDS");
  }
  if (request.jobIds.some((id) => typeof id !== "string")) {
    throw new QueuePreviewError("Every job ID must be a string", 400, "INVALID_JOB_IDS");
  }
  const jobIds = request.jobIds as string[];
  if (new Set(jobIds).size !== jobIds.length) {
    throw new QueuePreviewError("Duplicate job IDs are not allowed", 400, "DUPLICATE_JOB_IDS");
  }
  if (jobIds.some((id) => !APPROVED_CLEANUP_JOB_IDS.has(id))) {
    throw new QueuePreviewError("One or more job IDs are outside the approved allowlist", 400, "JOB_ID_NOT_APPROVED");
  }
  return jobIds;
}

router.get(
  "/queue-diagnostics",
  authMiddleware,
  requireAdmin,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = await emailQueue.client;
      const [serverInfo, counts] = await Promise.all([
        client.info(),
        emailQueue.getJobCounts(
          "active",
          "waiting",
          "delayed",
          "completed",
          "failed",
          "paused",
          "waiting-children",
          "prioritized",
        ),
      ]);

      res.json({
        redis: {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          database: client.options.db ?? 0,
          tlsEnabled: env.REDIS_TLS,
          runId: readInfoField(serverInfo, "run_id"),
          version: readInfoField(serverInfo, "redis_version"),
        },
        queue: {
          name: emailQueue.name,
          prefix: emailQueue.opts.prefix ?? "bull",
          counts,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/queue-cleanup/preview",
  authMiddleware,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const report = await inspectCompletedQueue({
        queue: emailQueue,
        emailStore: prisma.email,
        checkDatabaseConnection: () => prisma.$queryRaw`SELECT 1`,
      });
      res.json(report);
    } catch (error) {
      if (error instanceof QueuePreviewError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      const errorType = error instanceof Error ? error.name : "UnknownError";
      res.status(503).json({
        error: { code: "QUEUE_PREVIEW_UNAVAILABLE", message: "Queue preview could not verify production connections" },
      });
      // Keep operational logs free of connection strings and credentials.
      console.error(`Queue preview unavailable (${errorType})`);
    }
  },
);

router.post(
  "/queue-cleanup/execute",
  authMiddleware,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    let jobIds: string[];
    try {
      jobIds = parseApprovedCleanupRequest(req.body);
    } catch (error) {
      if (error instanceof QueuePreviewError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      res.status(400).json({ error: { code: "INVALID_CLEANUP_REQUEST", message: "Invalid cleanup request" } });
      return;
    }

    try {
      const redis = await emailQueue.client as unknown as CleanupRedisClient;
      const report = await executeApprovedCleanup({
        queue: emailQueue,
        emailStore: prisma.email,
        redis,
        jobIds,
      });
      res.json(report);
    } catch (error) {
      if (error instanceof QueuePreviewError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`Queue cleanup execution unavailable (${errorType})`);
      res.status(503).json({
        error: { code: "QUEUE_CLEANUP_UNAVAILABLE", message: "Cleanup could not verify production connections" },
      });
    }
  },
);

export const adminRouter = router;
