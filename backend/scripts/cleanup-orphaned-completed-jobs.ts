import { Job, Queue } from "bullmq";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { defaultRedis } from "../src/redis/connection";
import { EmailJobData, emailQueue } from "../src/queue/queue";

type EmailMatch = { id: string };

export interface CleanupEmailStore {
  findMany(args: {
    where: { id: { in: string[] } };
    select: { id: true };
  }): Promise<EmailMatch[]>;
}

export interface CleanupQueue {
  name: string;
  opts: { prefix?: string };
  getJobs(types: "completed"[], start: number, end: number): Promise<Array<Job<EmailJobData>>>;
  getJob(jobId: string): Promise<Job<EmailJobData> | undefined>;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
}

const QUEUE_STATES = [
  "active",
  "waiting",
  "delayed",
  "completed",
  "failed",
  "paused",
  "waiting-children",
  "prioritized",
];

type CandidateCheck = {
  jobId: string;
  state: string;
  databaseMatch: { matched: boolean; emailIds: string[] };
  eligible: boolean;
  reason: string;
};

function relatedEmailIds(job: Job<EmailJobData>): string[] {
  return [...new Set([job.id, job.data?.emailId].filter((id): id is string => Boolean(id)))];
}

async function inspectJob(
  queue: CleanupQueue,
  emailStore: CleanupEmailStore,
  jobId: string,
): Promise<CandidateCheck> {
  const job = await queue.getJob(jobId);
  if (!job) {
    return {
      jobId,
      state: "missing",
      databaseMatch: { matched: false, emailIds: [] },
      eligible: false,
      reason: "job no longer exists",
    };
  }

  const state = await job.getState();
  const ids = relatedEmailIds(job);
  const matches = ids.length
    ? await emailStore.findMany({ where: { id: { in: ids } }, select: { id: true } })
    : [];
  const matchedIds = matches.map(({ id }) => id);
  const eligible = state === "completed" && matchedIds.length === 0;

  return {
    jobId,
    state,
    databaseMatch: { matched: matchedIds.length > 0, emailIds: matchedIds },
    eligible,
    reason: eligible
      ? "completed job has no matching Email record"
      : state !== "completed"
        ? "job is no longer completed"
        : "matching Email record exists",
  };
}

/** Reports all completed jobs and, only when explicitly requested, removes reverified orphans. */
export async function runOrphanJobCleanup(options: {
  queue: CleanupQueue;
  emailStore: CleanupEmailStore;
  confirmDelete: boolean;
  write?: (line: string) => void;
}): Promise<{ removed: number; candidates: CandidateCheck[] }> {
  const { queue, emailStore, confirmDelete, write = console.log } = options;
  const beforeCounts = await queue.getJobCounts(...QUEUE_STATES);
  write(`Queue before: ${JSON.stringify(beforeCounts)}`);

  // Snapshot every completed job ID once. Reindexing during deletion cannot skip jobs.
  const snapshot = await queue.getJobs(["completed"], 0, -1);
  const checks: CandidateCheck[] = [];
  for (const job of snapshot) {
    if (!job.id) {
      write("Excluded completed job without an ID");
      continue;
    }
    checks.push(await inspectJob(queue, emailStore, job.id));
  }

  write("Completed-job verification report:");
  for (const check of checks) write(JSON.stringify(check));

  const eligible = checks.filter((check) => check.eligible);
  write(`Verified orphan candidates: ${eligible.length}`);
  if (!confirmDelete) write("DRY-RUN: no jobs were removed.");

  let removed = 0;
  if (confirmDelete) {
    for (const candidate of eligible) {
      try {
        // Recheck immediately before each individual removal to close the report/action gap.
        const latest = await inspectJob(queue, emailStore, candidate.jobId);
        if (!latest.eligible) {
          write(`Skipped ${candidate.jobId}: ${latest.reason}`);
          continue;
        }

        const job = await queue.getJob(candidate.jobId);
        if (!job || (await job.getState()) !== "completed") {
          write(`Skipped ${candidate.jobId}: state changed before removal`);
          continue;
        }

        // One final database check immediately before the per-job removal call.
        const finalIds = relatedEmailIds(job);
        const finalMatches = finalIds.length
          ? await emailStore.findMany({ where: { id: { in: finalIds } }, select: { id: true } })
          : [];
        if (finalMatches.length > 0) {
          write(`Skipped ${candidate.jobId}: Email record appeared before removal`);
          continue;
        }

        await job.remove();
        if (await queue.getJob(candidate.jobId)) {
          write(`Removal not confirmed for ${candidate.jobId}: job still exists`);
          continue;
        }
        removed += 1;
        write(`Removed completed orphan job ${candidate.jobId}`);
      } catch (error) {
        const errorType = error instanceof Error ? error.name : "UnknownError";
        write(`Skipped ${candidate.jobId}: verification/removal failed (${errorType})`);
      }
    }
  }

  const afterCounts = await queue.getJobCounts(...QUEUE_STATES);
  write(`Queue after: ${JSON.stringify(afterCounts)}`);
  write(`Jobs removed: ${removed}`);
  return { removed, candidates: checks };
}

export function assertProductionConnection(): void {
  if (env.NODE_ENV !== "production") {
    throw new Error("This maintenance script must run with NODE_ENV=production.");
  }
  if (/^(localhost|127(?:\.\d{1,3}){3}|::1)$/i.test(env.REDIS_HOST)) {
    throw new Error("Refusing to run: REDIS_HOST resolves to a local Redis instance.");
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--confirm-delete")) {
    throw new Error("Usage: node dist/scripts/cleanup-orphaned-completed-jobs.js [--confirm-delete]");
  }
  const confirmDelete = args.includes("--confirm-delete");
  assertProductionConnection();

  await emailQueue.waitUntilReady();
  const redisClient = await emailQueue.client;
  console.log(
    `Connected to configured Redis host ${env.REDIS_HOST}:${env.REDIS_PORT}; queue=${emailQueue.name}; prefix=${emailQueue.opts.prefix ?? "bull"}; database=${redisClient.options.db ?? 0}`,
  );

  await runOrphanJobCleanup({
    queue: emailQueue,
    emailStore: prisma.email,
    confirmDelete,
  });
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      console.error(`Completed-job cleanup failed (${errorType}). Check the service logs for diagnostic details.`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await Promise.allSettled([emailQueue.close(), defaultRedis.quit(), prisma.$disconnect()]);
    });
}
