import { Queue } from 'bullmq';
import { env } from '../config/env';
import { createBullConnection } from '../redis/connection';

export const emailQueue = new Queue<{ emailId: string }>(env.QUEUE_NAME, {
  connection: createBullConnection(),
  defaultJobOptions: {
    attempts: 1, // SMTP retries handled explicitly in worker logic (PRD §6)
    removeOnComplete: { age: 86_400, count: 5000 },
    removeOnFail: false,
  },
});
