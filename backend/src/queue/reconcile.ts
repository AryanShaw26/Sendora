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
  let confirmed = 0;
  const missing: string[] = [];

  const jobs = await Promise.all(
    emailIds.map(async (id) => {
      const job = await emailQueue.getJob(id);
      return { id, job };
    })
  );

  for (const item of jobs) {
    if (item.job) {
      confirmed++;
    } else {
      missing.push(item.id);
    }
  }

  return { confirmed, missing };
}
