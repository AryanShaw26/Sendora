import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/db/prisma';
import { defaultRedis } from '../src/redis/connection';
import { tryConsumeSlot, releaseSlot, getRateCount } from '../src/workers/rateLimiter';
import { acquireSendStartSlot } from '../src/workers/sendLock';
import { utcHourKey, startOfNextUtcHour } from '../src/utils/time';
import { processEmail } from '../src/workers/emailProcessor';
import { emailQueue } from '../src/queue/queue';
import { Job, DelayedError } from 'bullmq';

describe('Worker Engine & Rate Limiter Tests', () => {
  const testSenderId = 'test-sender-' + Date.now();
  const window = utcHourKey();

  afterAll(async () => {
    await defaultRedis.del(`rate:${testSenderId}:${window}`);
    await defaultRedis.del(`sendlock:${testSenderId}`);
    await emailQueue.close();
    await defaultRedis.quit();
    await prisma.$disconnect();
  });

  it('enforces atomic hourly rate limits via Redis Lua script and releases slots', async () => {
    const limit = 2;

    const slot1 = await tryConsumeSlot(testSenderId, limit);
    expect(slot1.allowed).toBe(true);
    expect(slot1.count).toBe(1);

    const slot2 = await tryConsumeSlot(testSenderId, limit);
    expect(slot2.allowed).toBe(true);
    expect(slot2.count).toBe(2);

    // 3rd should be denied
    const slot3 = await tryConsumeSlot(testSenderId, limit);
    expect(slot3.allowed).toBe(false);
    expect(slot3.count).toBe(2);

    // Release 1 slot
    await releaseSlot(testSenderId, window);
    expect(await getRateCount(testSenderId, window)).toBe(1);

    // Should now be allowed
    const slot4 = await tryConsumeSlot(testSenderId, limit);
    expect(slot4.allowed).toBe(true);
    expect(slot4.count).toBe(2);
  });

  it('enforces per-sender minimum delay send-lock', async () => {
    const slot1 = await acquireSendStartSlot(testSenderId);
    expect(slot1.acquired).toBe(true);

    // Immediate second attempt must fail
    const slot2 = await acquireSendStartSlot(testSenderId);
    expect(slot2.acquired).toBe(false);
    if (!slot2.acquired) {
      expect(slot2.waitMs).toBeGreaterThan(0);
    }
  });

  it('processes an email, marks it sent with previewUrl, and updates attempts', async () => {
    const sender = await prisma.sender.findFirst({ where: { isActive: true } });
    expect(sender).toBeDefined();

    const user = await prisma.user.findFirst();
    expect(user).toBeDefined();

    const campaign = await prisma.campaign.create({
      data: {
        userId: user!.id,
        subject: 'Worker Test Subject',
        body: '<b>Hello from Worker Test</b>',
        startTime: new Date(),
        delaySeconds: 1,
        hourlyLimit: 100,
        totalEmails: 1,
      },
    });

    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        userId: user!.id,
        senderId: sender!.id,
        recipient: 'worker-test-recipient@ethereal.email',
        subject: 'Worker Test Subject',
        seq: 0,
        status: 'scheduled',
        scheduledAt: new Date(),
        originalScheduledAt: new Date(),
      },
    });

    const mockJob = {
      id: email.id,
      data: { emailId: email.id },
      moveToDelayed: async () => {},
    } as unknown as Job<{ emailId: string }>;

    await processEmail(mockJob);

    const updated = await prisma.email.findUnique({ where: { id: email.id } });
    expect(updated?.status).toBe('sent');
    expect(updated?.sentAt).toBeDefined();
    expect(updated?.previewUrl).toContain('ethereal.email');
    expect(updated?.attempts).toBe(1);
    expect(updated?.messageId).toContain('@sendora.local');
  });

  it('defers email to next UTC hour window when campaign hourly limit is exceeded', async () => {
    const sender = await prisma.sender.findFirst({ where: { isActive: true } });
    const user = await prisma.user.findFirst();

    // Set hourly rate counter in Redis to hit limit
    const key = `rate:${sender!.id}:${utcHourKey()}`;
    await defaultRedis.set(key, '100'); // set high count

    const campaign = await prisma.campaign.create({
      data: {
        userId: user!.id,
        subject: 'Rate Limit Deferral Test',
        body: 'Testing deferral',
        startTime: new Date(),
        delaySeconds: 1,
        hourlyLimit: 1, // limit is 1, but Redis count is 100
        totalEmails: 1,
      },
    });

    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        userId: user!.id,
        senderId: sender!.id,
        recipient: 'deferred-test@ethereal.email',
        subject: 'Rate Limit Deferral Test',
        seq: 0,
        status: 'scheduled',
        scheduledAt: new Date(),
        originalScheduledAt: new Date(),
      },
    });

    let delayedRunAt: number | undefined;
    const mockJob = {
      id: email.id,
      data: { emailId: email.id },
      moveToDelayed: async (runAt: number) => {
        delayedRunAt = runAt;
      },
    } as unknown as Job<{ emailId: string }>;

    // Calling processEmail should throw DelayedError
    await expect(processEmail(mockJob)).rejects.toThrow(DelayedError);

    // Verify DB update
    const updated = await prisma.email.findUnique({ where: { id: email.id } });
    expect(updated?.status).toBe('scheduled'); // Not failed!
    expect(updated?.deferredCount).toBe(1);
    expect(updated?.scheduledAt.getTime()).toBe(startOfNextUtcHour().getTime());
    expect(delayedRunAt).toBe(startOfNextUtcHour().getTime());

    // Reset rate counter
    await defaultRedis.del(key);
  });
});
