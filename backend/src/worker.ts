import { Worker } from 'bullmq';
import { env } from './config/env';
import { logger } from './config/logger';
import { createBullConnection, defaultRedis } from './redis/connection';
import { prisma } from './db/prisma';
import { processEmail } from './workers/emailProcessor';
import { reconcileQueue } from './queue/reconcile';

async function startWorker() {
  logger.info(
    {
      queue: env.QUEUE_NAME,
      concurrency: env.WORKER_CONCURRENCY,
      minDelayMs: env.MIN_DELAY_BETWEEN_EMAILS_MS,
      maxHourlySender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      recoveryOnBoot: env.RECOVERY_ON_BOOT,
    },
    'Starting Sendora Email Scheduler Worker engine...'
  );

  const worker = new Worker(env.QUEUE_NAME, processEmail, {
    connection: createBullConnection(),
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: 60_000,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed successfully');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job failed in worker');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker system error');
  });

  if (env.RECOVERY_ON_BOOT) {
    try {
      await reconcileQueue();
    } catch (err) {
      logger.error({ err }, 'Boot-time queue reconciliation encountered an error');
    }
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, closing worker gracefully...`);
    try {
      await worker.close();
      logger.info('BullMQ worker closed');
      await prisma.$disconnect();
      logger.info('Prisma disconnected');
      await defaultRedis.quit();
      logger.info('Redis connection closed');
    } catch (err) {
      logger.error({ err }, 'Error during worker shutdown');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startWorker().catch((err) => {
  logger.error({ err }, 'Failed to initialize worker');
  process.exit(1);
});
