import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { normalizeRecipients, scheduleCampaign } from '../src/services/schedule.service';
import { prisma } from '../src/db/prisma';
import { emailQueue } from '../src/queue/queue';
import { defaultRedis } from '../src/redis/connection';

describe('Schedule Service & Recipient Normalization', () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create test user
    const testUser = await prisma.user.upsert({
      where: { email: 'test-scheduler@example.com' },
      update: {},
      create: {
        googleId: 'test-google-id-' + Date.now(),
        email: 'test-scheduler@example.com',
        name: 'Test Scheduler',
      },
    });
    testUserId = testUser.id;
  });

  afterAll(async () => {
    await emailQueue.close();
    await defaultRedis.quit();
    await prisma.$disconnect();
  });

  it('normalizes, lowercases, trims, and dedupes recipients', () => {
    const raw = [
      '  Alice@Example.COM  ',
      'invalid-email',
      'alice@example.com', // duplicate
      'bob@domain.org',
      'bad@@email.com',
      'CHARLIE@test.io',
    ];

    const { valid, invalidCount, duplicateCount } = normalizeRecipients(raw);
    expect(valid).toEqual(['alice@example.com', 'bob@domain.org', 'charlie@test.io']);
    expect(invalidCount).toBe(2);
    expect(duplicateCount).toBe(1);
  });

  it('schedules 3 emails with correct round-robin sender assignment and delay spacing', async () => {
    const startTime = new Date(Date.now() + 120000); // 2 mins ahead
    const delaySeconds = 5;

    const result = await scheduleCampaign(testUserId, {
      subject: 'Integration Schedule Test',
      body: '<p>Testing schedule API</p>',
      emails: ['r1@sendora.test', 'r2@sendora.test', 'r3@sendora.test'],
      startTime,
      delaySeconds,
      hourlyLimit: 50,
    });

    expect(result.status).toBe(201);
    expect(result.data.total).toBe(3);
    expect(result.data.persisted).toBe(true);
    expect(result.data.queueStatus).toBe('queued');

    // Verify DB campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: result.data.campaignId },
      include: { emails: { orderBy: { seq: 'asc' }, include: { sender: true } } },
    });

    expect(campaign).toBeDefined();
    expect(campaign?.emails.length).toBe(3);

    // Verify delays and round-robin senders
    const emails = campaign!.emails;
    expect(emails[0].seq).toBe(0);
    expect(emails[1].seq).toBe(1);
    expect(emails[2].seq).toBe(2);

    const t0 = emails[0].scheduledAt.getTime();
    const t1 = emails[1].scheduledAt.getTime();
    const t2 = emails[2].scheduledAt.getTime();

    expect(t1 - t0).toBe(5000);
    expect(t2 - t1).toBe(5000);

    // Verify round robin senders
    expect(emails[0].senderId).not.toBe(emails[1].senderId);

    // Verify BullMQ delayed jobs
    for (const email of emails) {
      const job = await emailQueue.getJob(email.id);
      expect(job).toBeDefined();
      expect(job?.data.emailId).toBe(email.id);
      // Clean up test job
      await job?.remove();
    }
  });
});
