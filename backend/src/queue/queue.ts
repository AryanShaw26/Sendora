import { Queue } from "bullmq";
import { env } from "../config/env";
import { createBullConnection } from "../redis/connection";

export interface EmailJobData {
  emailId: string;
  recoveryCount?: number;
}

export const emailQueue = new Queue<EmailJobData>(env.QUEUE_NAME, {
  connection: createBullConnection(),
  defaultJobOptions: {
    attempts: env.QUEUE_INFRA_MAX_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: env.QUEUE_INFRA_RETRY_DELAY_MS,
      jitter: 0.5,
    },
    removeOnComplete: { age: 86_400, count: 5000 },
    removeOnFail: false,
  },
});
