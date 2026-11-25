import { prisma } from "../db/prisma";
import { emailQueue, EmailJobData } from "./queue";
import { Queue } from "bullmq";
import { logger } from "../config/logger";
import { env } from "../config/env";
import { SMTP_OUTCOME_UNKNOWN_PREFIX } from "../workers/emailProcessor";

async function reviveFailedJob(
  job: NonNullable<Awaited<ReturnType<typeof emailQueue.getJob>>>,
): Promise<boolean> {
  const recoveryCount = job.data.recoveryCount || 0;
  if (recoveryCount >= env.QUEUE_MAX_RECOVERY_CYCLES) {
    logger.error(
      { jobId: job.id, recoveryCount },
      "Failed job reached its bounded recovery limit; operator action is required",
    );
    return false;
  }

  await job.updateData({ ...job.data, recoveryCount: recoveryCount + 1 });
  await job.retry("failed", {
    resetAttemptsMade: true,
    resetAttemptsStarted: true,
  });
  return true;
}

export async function reconcileQueue(
  queue: Queue<EmailJobData> = emailQueue,
  emailIds?: string[],
): Promise<{ checked: number; reenqueued: number }> {
  logger.info("Starting queue reconciliation check against PostgreSQL...");
  let checked = 0;
  let reenqueued = 0;
  const batchSize = 500;
  let cursor: string | undefined = undefined;

  while (true) {
    const emails: Array<{
      id: string;
      scheduledAt: Date;
      status: string;
      processingStartedAt: Date | null;
      errorMessage: string | null;
    }> = await prisma.email.findMany({
      where: {
        ...(emailIds ? { id: { in: emailIds } } : {}),
        OR: [
          { status: "scheduled" },
          {
            status: "processing",
            OR: [
              { errorMessage: null },
              {
                errorMessage: {
                  not: { startsWith: SMTP_OUTCOME_UNKNOWN_PREFIX },
                },
              },
            ],
          },
        ],
      },
      take: batchSize,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: "asc" },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        processingStartedAt: true,
        errorMessage: true,
      },
    });

    if (emails.length === 0) {
      break;
    }

    checked += emails.length;
    cursor = emails[emails.length - 1].id;

    // Check presence in BullMQ in parallel
    const checks = await Promise.all(
      emails.map(async (email) => {
        const job = await queue.getJob(email.id);
        const state = job ? await job.getState() : "missing";
        if (job && state === "failed") {
          const recovered = await reviveFailedJob(job);
          return { email, recovered, shouldEnqueue: false };
        }
        const isStaleProcessing =
          email.status === "processing" &&
          email.processingStartedAt !== null &&
          email.processingStartedAt.getTime() <=
            Date.now() - env.STALE_PROCESSING_MS;
        return {
          email,
          recovered: false,
          shouldEnqueue:
            !job && (email.status === "scheduled" || isStaleProcessing),
        };
      }),
    );

    const missing = checks.filter((c) => c.shouldEnqueue).map((c) => c.email);
    reenqueued += checks.filter((c) => c.recovered).length;

    if (missing.length > 0) {
      const now = Date.now();
      const jobsToAdd = missing.map((email) => {
        const delay = Math.max(0, email.scheduledAt.getTime() - now);
        return {
          name: "send-email",
          data: { emailId: email.id },
          opts: {
            jobId: email.id,
            delay,
          },
        };
      });

      await queue.addBulk(jobsToAdd);
      reenqueued += missing.length;
      logger.info(
        { reenqueuedCount: missing.length },
        "Re-enqueued missing delayed jobs into BullMQ",
      );
    }
  }

  logger.info({ checked, reenqueued }, "Queue reconciliation completed");
  return { checked, reenqueued };
}

export async function targetedReconcileEmails(
  emailIds: string[],
): Promise<{ confirmed: number; missing: string[] }> {
  if (emailIds.length === 0) {
    return { confirmed: 0, missing: [] };
  }

  const emails = await prisma.email.findMany({
    where: {
      id: { in: emailIds },
      status: { in: ["scheduled", "processing"] },
    },
    select: { id: true, scheduledAt: true },
  });

  const jobs = await Promise.all(
    emails.map(async (email) => ({
      email,
      job: await emailQueue.getJob(email.id),
    })),
  );

  const present = jobs.filter(({ job }) => !!job);
  const missing = jobs.filter(({ job }) => !job).map(({ email }) => email);

  for (const { job } of present) {
    if (job && (await job.getState()) === "failed") {
      await reviveFailedJob(job);
    }
  }

  if (missing.length > 0) {
    const now = Date.now();
    await emailQueue.addBulk(
      missing.map((email) => ({
        name: "send-email",
        data: { emailId: email.id },
        opts: {
          jobId: email.id,
          delay: Math.max(0, email.scheduledAt.getTime() - now),
        },
      })),
    );
  }

  const missingIds = missing.map((email) => email.id);
  const confirmations = await Promise.all(
    emailIds.map(async (id) => {
      const job = await emailQueue.getJob(id);
      return !!job && (await job.getState()) !== "failed";
    }),
  );
  const confirmedAfterRecovery = confirmations.filter(Boolean).length;
  const remainingMissing = emailIds.filter(
    (_id, index) => !confirmations[index],
  );

  return { confirmed: confirmedAfterRecovery, missing: remainingMissing };
}
