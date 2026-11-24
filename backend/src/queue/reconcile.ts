import { prisma } from '../db/prisma';
import { emailQueue } from './queue';
import { logger } from '../config/logger';

export async function reconcileQueue(): Promise<{ checked: number; reenqueued: number }> {
  logger.info('Starting queue reconciliation check against PostgreSQL...');
  let checked = 0;
  let reenqueued = 0;
  const batchSize = 500;
  let cursor: string | undefined = undefined;

  while (true) {
    const emails: Array<{ id: string; scheduledAt: Date; status: string }> =
      await prisma.email.findMany({
        where: {
          status: { in: ['scheduled', 'processing'] },
        },
        take: batchSize,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          scheduledAt: true,
          status: true,
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
        const job = await emailQueue.getJob(email.id);
        return { email, exists: !!job };
      })
    );

    const missing = checks.filter((c) => !c.exists).map((c) => c.email);

    if (missing.length > 0) {
      const now = Date.now();
      const jobsToAdd = missing.map((email) => {
        const delay = Math.max(0, email.scheduledAt.getTime() - now);
        return {
          name: 'send-email',
          data: { emailId: email.id },
          opts: {
            jobId: email.id,
            delay,
            attempts: 1,
            removeOnComplete: { age: 86_400, count: 5000 },
            removeOnFail: false,
          },
        };
      });

      await emailQueue.addBulk(jobsToAdd);
      reenqueued += missing.length;
      logger.info({ reenqueuedCount: missing.length }, 'Re-enqueued missing delayed jobs into BullMQ');
    }
  }

  logger.info({ checked, reenqueued }, 'Queue reconciliation completed');
  return { checked, reenqueued };
}

export async function targetedReconcileEmails(
  emailIds: string[]
): Promise<{ confirmed: number; missing: string[] }> {
  if (emailIds.length === 0) {
    return { confirmed: 0, missing: [] };
  }

  const emails = await prisma.email.findMany({
    where: { id: { in: emailIds }, status: { in: ['scheduled', 'processing'] } },
    select: { id: true, scheduledAt: true },
  });

  const jobs = await Promise.all(
    emails.map(async (email) => ({
      email,
      job: await emailQueue.getJob(email.id),
    }))
  );

  const present = jobs.filter(({ job }) => !!job);
  const missing = jobs.filter(({ job }) => !job).map(({ email }) => email);

  if (missing.length > 0) {
    const now = Date.now();
    await emailQueue.addBulk(
      missing.map((email) => ({
        name: 'send-email',
        data: { emailId: email.id },
        opts: {
          jobId: email.id,
          delay: Math.max(0, email.scheduledAt.getTime() - now),
          attempts: 1,
          removeOnComplete: { age: 86_400, count: 5000 },
          removeOnFail: false,
        },
      }))
    );
  }

  const missingIds = missing.map((email) => email.id);
  const confirmations = await Promise.all(
    missingIds.map(async (id) => !!(await emailQueue.getJob(id)))
  );
  const confirmedAfterRecovery = present.length + confirmations.filter(Boolean).length;
  const remainingMissing = missingIds.filter((_id, index) => !confirmations[index]);

  return { confirmed: confirmedAfterRecovery, missing: remainingMissing };
}
