import { Queue, Worker } from "bullmq";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { createBullConnection, defaultRedis } from "../src/redis/connection";
import { processEmail } from "../src/workers/emailProcessor";
import * as mailerService from "../src/services/mailer.service";
import { utcHourKey } from "../src/utils/time";

describe("Worker infrastructure retries", () => {
  const queueName = `infra-retry-test-${Date.now()}`;
  const queue = new Queue<{ emailId: string }>(queueName, {
    connection: createBullConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30, jitter: 0.5 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await defaultRedis.quit();
    await prisma.$disconnect();
  });

  it("retries a transient PostgreSQL failure during the initial lookup", async () => {
    const user = await prisma.user.findFirstOrThrow();
    const templateSender = await prisma.sender.findFirstOrThrow({
      where: { isActive: true },
    });
    const sender = await prisma.sender.create({
      data: {
        email: `infra-retry-sender-${Date.now()}@sendora.test`,
        displayName: "Infrastructure retry test sender",
        smtpHost: templateSender.smtpHost,
        smtpPort: templateSender.smtpPort,
        smtpUser: templateSender.smtpUser,
        smtpPass: templateSender.smtpPass,
        isActive: true,
      },
    });
    let campaignId: string | undefined;
    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        subject: "Infrastructure retry test",
        body: "Test",
        startTime: new Date(),
        delaySeconds: 0,
        hourlyLimit: 100,
        totalEmails: 1,
      },
    });
    campaignId = campaign.id;
    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        userId: user.id,
        senderId: sender.id,
        recipient: `infra-retry-${Date.now()}@sendora.test`,
        subject: campaign.subject,
        seq: 0,
        status: "scheduled",
        scheduledAt: new Date(),
        originalScheduledAt: new Date(),
      },
    });
    const originalFindUnique = prisma.email.findUnique.bind(prisma.email);
    const lookup = vi
      .spyOn(prisma.email, "findUnique")
      .mockRejectedValueOnce(
        new Error("FATAL: the database system is starting up"),
      )
      .mockImplementation((args) => originalFindUnique(args));
    const smtpSend = vi.spyOn(mailerService, "sendEmail").mockResolvedValue({
      messageId: `<${email.id}@sendora.local>`,
      previewUrl: null,
    });
    const worker = new Worker(queueName, processEmail, {
      connection: createBullConnection(),
      concurrency: 1,
    });

    try {
      await worker.waitUntilReady();
      const completed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error("Timed out waiting for the retried job to complete"),
            ),
          10000,
        );
        worker.on("completed", (job) => {
          if (job.id === email.id) {
            clearTimeout(timer);
            resolve();
          }
        });
        worker.on("failed", (job, error) => {
          if (
            job?.id === email.id &&
            job.attemptsMade >= (job.opts.attempts ?? 1)
          ) {
            clearTimeout(timer);
            reject(error);
          }
        });
      });

      await queue.add("send-email", { emailId: email.id }, { jobId: email.id });
      await completed;

      expect(lookup).toHaveBeenCalled();
      expect(lookup.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(smtpSend).toHaveBeenCalledTimes(1);
      const persisted = await prisma.email.findUniqueOrThrow({
        where: { id: email.id },
      });
      expect(persisted.status).toBe("sent");
    } finally {
      await worker.close();
      lookup.mockRestore();
      smtpSend.mockRestore();
      await defaultRedis.del(`sendlock:${sender.id}`);
      await defaultRedis.del(`rate:${sender.id}:${utcHourKey()}`);
      if (campaignId) {
        await prisma.campaign.delete({ where: { id: campaignId } });
      }
      await prisma.sender.delete({ where: { id: sender.id } });
    }
  });
});
