import { describe, it, expect, afterAll } from "vitest";
import { emailQueue } from "../src/queue/queue";
import { enqueueEmails } from "../src/queue/enqueue";
import { defaultRedis } from "../src/redis/connection";
import { prisma } from "../src/db/prisma";
import { env } from "../src/config/env";

describe("BullMQ Queue and Idempotent Enqueue", () => {
  afterAll(async () => {
    await emailQueue.close();
    await defaultRedis.quit();
    await prisma.$disconnect();
  });

  it("enqueues emails with delayed timestamp and respects deterministic jobId", async () => {
    const testId = "test-id-" + Date.now();
    const scheduledAt = new Date(Date.now() + 60000); // 1 minute in future

    const result = await enqueueEmails([{ id: testId, scheduledAt }]);
    expect(result.enqueued).toBe(1);
    expect(result.failedIds.length).toBe(0);

    const job = await emailQueue.getJob(testId);
    expect(job).toBeDefined();
    expect(job?.id).toBe(testId);
    expect(job?.data.emailId).toBe(testId);
    expect(job?.opts.attempts).toBe(env.QUEUE_INFRA_MAX_ATTEMPTS);
    expect(job?.opts.backoff).toEqual({
      type: "exponential",
      delay: env.QUEUE_INFRA_RETRY_DELAY_MS,
      jitter: 0.5,
    });

    // Idempotency: adding the exact same jobId again
    const result2 = await enqueueEmails([{ id: testId, scheduledAt }]);
    expect(result2.enqueued).toBe(1);

    // Cleanup
    await job?.remove();
  });
});
