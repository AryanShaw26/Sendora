import { Queue, Worker } from "bullmq";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { env } from "../src/config/env";
import { createBullConnection, defaultRedis } from "../src/redis/connection";
import { reconcileQueue } from "../src/queue/reconcile";

describe("BullMQ failed-job recovery", () => {
  const queueName = `recovery-test-${Date.now()}`;
  let campaignId: string | undefined;
  const queue = new Queue<{ emailId: string; recoveryCount?: number }>(
    queueName,
    {
      connection: createBullConnection(),
      defaultJobOptions: {
        attempts: env.QUEUE_INFRA_MAX_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: env.QUEUE_INFRA_RETRY_DELAY_MS,
          jitter: 0.5,
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
    },
  );

  afterAll(async () => {
    if (campaignId) {
      await prisma.campaign.deleteMany({ where: { id: campaignId } });
    }
    await queue.obliterate({ force: true });
    await queue.close();
    await defaultRedis.quit();
    await prisma.$disconnect();
  });

  it("revives a failed job when its database email remains scheduled", async () => {
    const [user, sender] = await Promise.all([
      prisma.user.findFirstOrThrow(),
      prisma.sender.findFirstOrThrow({ where: { isActive: true } }),
    ]);
    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        subject: "Recovery test",
        body: "Recovery test",
        startTime: new Date(),
        delaySeconds: 0,
        hourlyLimit: 1,
        totalEmails: 1,
      },
    });
    campaignId = campaign.id;
    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        userId: user.id,
        senderId: sender.id,
        recipient: `recovery-${Date.now()}@sendora.test`,
        subject: campaign.subject,
        seq: 0,
        status: "scheduled",
        scheduledAt: new Date(),
        originalScheduledAt: new Date(),
      },
    });

    const worker = new Worker(
      queueName,
      async () => {
        throw new Error("simulated transient PostgreSQL startup failure");
      },
      { connection: createBullConnection(), concurrency: 1 },
    );

    try {
      await worker.waitUntilReady();
      const failed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Timed out waiting for the test job to fail")),
          10000,
        );
        worker.on("failed", (job) => {
          if (job?.id === email.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      });

      await queue.add(
        "send-email",
        { emailId: email.id },
        {
          jobId: email.id,
          attempts: 1,
          removeOnFail: false,
        },
      );
      await failed;
    } finally {
      await worker.close();
    }

    const originalJob = await queue.getJob(email.id);
    expect(await originalJob?.getState()).toBe("failed");

    const recovery = await reconcileQueue(queue, [email.id]);
    expect(recovery.reenqueued).toBe(1);

    const recoveredJob = await queue.getJob(email.id);
    expect(recoveredJob).toBeDefined();
    expect(await recoveredJob?.getState()).toBe("waiting");
    expect(recoveredJob?.data.recoveryCount).toBe(1);

    await recoveredJob?.remove();
    await prisma.campaign.delete({ where: { id: campaign.id } });
    campaignId = undefined;
  });
});
