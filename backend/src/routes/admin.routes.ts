import { Router, Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { authMiddleware } from "../middleware/auth";
import { emailQueue } from "../queue/queue";
import { prisma } from "../db/prisma";

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

export const adminRouter = router;
