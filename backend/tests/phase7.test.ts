import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import http from 'http';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { signUserToken } from '../src/services/auth.service';
import { encrypt, decrypt } from '../src/services/crypto.service';
import { ensureIndex, indexEmails, searchEmails } from '../src/services/search.service';
import { emailQueue } from '../src/queue/queue';
import { defaultRedis } from '../src/redis/connection';

describe('Phase 7 Integration Tests: Emails API, Elasticsearch, Slack', () => {
  let server: http.Server;
  let testUserToken: string;
  let testUserId: string;
  const PORT = 4098;
  const baseUrl = `http://localhost:${PORT}`;

  beforeAll(async () => {
    const app = createApp();
    server = app.listen(PORT);

    const user = await prisma.user.upsert({
      where: { email: 'phase7-test@sendora.local' },
      update: {},
      create: {
        googleId: 'phase7-google-id',
        email: 'phase7-test@sendora.local',
        name: 'Phase 7 Tester',
      },
      select: { id: true },
    });
    testUserId = user.id;
    testUserToken = signUserToken(testUserId);

    await ensureIndex();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await emailQueue.close();
    await defaultRedis.quit();
    await prisma.$disconnect();
  });

  it('correctly encrypts and decrypts secrets with AES-256-GCM', () => {
    const secret = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX';
    const encrypted = encrypt(secret);
    expect(encrypted).not.toBe(secret);
    expect(typeof encrypted).toBe('string');

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('lists active senders on GET /api/senders', async () => {
    const res = await axios.get(`${baseUrl}/api/senders`, {
      headers: { Cookie: `token=${testUserToken}` },
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.items)).toBe(true);
    expect(res.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.data.items[0]).toHaveProperty('email');
    expect(res.data.items[0]).toHaveProperty('isActive', true);
  });

  it('queries scheduled and sent emails with pagination via GET /api/emails', async () => {
    const sender = await prisma.sender.findFirst({ where: { isActive: true } });

    // Seed test campaign and emails
    const campaign = await prisma.campaign.create({
      data: {
        userId: testUserId,
        subject: 'Phase 7 Email List Test',
        body: 'Email listing body',
        startTime: new Date(),
        delaySeconds: 2,
        hourlyLimit: 50,
        totalEmails: 2,
      },
    });

    await prisma.email.createMany({
      data: [
        {
          campaignId: campaign.id,
          userId: testUserId,
          senderId: sender!.id,
          recipient: 'scheduled1@test.local',
          subject: 'Phase 7 Email List Test',
          seq: 0,
          status: 'scheduled',
          scheduledAt: new Date(Date.now() + 60000),
          originalScheduledAt: new Date(Date.now() + 60000),
        },
        {
          campaignId: campaign.id,
          userId: testUserId,
          senderId: sender!.id,
          recipient: 'sent1@test.local',
          subject: 'Phase 7 Email List Test',
          seq: 1,
          status: 'sent',
          scheduledAt: new Date(),
          originalScheduledAt: new Date(),
          sentAt: new Date(),
          previewUrl: 'https://ethereal.email/message/test-preview',
        },
      ],
    });

    // Test GET /api/emails?status=scheduled
    const schedRes = await axios.get(`${baseUrl}/api/emails?status=scheduled`, {
      headers: { Cookie: `token=${testUserToken}` },
    });
    expect(schedRes.status).toBe(200);
    expect(schedRes.data.items.some((e: any) => e.recipient === 'scheduled1@test.local')).toBe(true);

    // Test GET /api/emails?status=sent
    const sentRes = await axios.get(`${baseUrl}/api/emails?status=sent`, {
      headers: { Cookie: `token=${testUserToken}` },
    });
    expect(sentRes.status).toBe(200);
    expect(sentRes.data.items.some((e: any) => e.recipient === 'sent1@test.local')).toBe(true);
    const sentItem = sentRes.data.items.find((e: any) => e.recipient === 'sent1@test.local');
    expect(sentItem.previewUrl).toBe('https://ethereal.email/message/test-preview');
  });

  it('aggregates campaign per-status counts on GET /api/campaigns', async () => {
    const res = await axios.get(`${baseUrl}/api/campaigns`, {
      headers: { Cookie: `token=${testUserToken}` },
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.items)).toBe(true);
    const item = res.data.items[0];
    expect(item).toHaveProperty('counts');
    expect(item.counts).toHaveProperty('scheduled');
    expect(item.counts).toHaveProperty('sent');
  });

  it('indexes and searches emails via Elasticsearch', async () => {
    const emailDoc = {
      id: 'es-test-id-' + Date.now(),
      userId: testUserId,
      campaignId: 'es-camp-id',
      recipient: 'unique.target@customer.com',
      subject: 'Special Elasticsearch Subject Query',
      body: 'Contains special keyword antelope for search validation',
      status: 'scheduled',
      senderEmail: 'sender@ethereal.email',
      scheduledAt: new Date(),
    };

    await indexEmails([emailDoc]);

    const results = await searchEmails({
      userId: testUserId,
      q: 'antelope',
    });

    expect(results.total).toBeGreaterThanOrEqual(1);
    expect(results.items.some((item: any) => item.recipient === 'unique.target@customer.com')).toBe(true);

    // Also test search via HTTP endpoint
    const httpRes = await axios.get(`${baseUrl}/api/emails/search?q=antelope`, {
      headers: { Cookie: `token=${testUserToken}` },
    });
    expect(httpRes.status).toBe(200);
    expect(httpRes.data.total).toBeGreaterThanOrEqual(1);
  });

  it('manages Slack integration lifecycle (connect URL, status, disconnect)', async () => {
    // 1. Get connect URL
    const connRes = await axios.get(`${baseUrl}/api/slack/connect`, {
      headers: { Cookie: `token=${testUserToken}` },
    });
    expect(connRes.status).toBe(200);
    expect(connRes.data.url).toContain('https://slack.com/oauth/v2/authorize');

    // 2. Status when disconnected
    const statusRes = await axios.get(`${baseUrl}/api/slack/status`, {
      headers: { Cookie: `token=${testUserToken}` },
    });
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.connected).toBe(false);

    // 3. Connect a mock Slack integration directly in DB for testing
    await prisma.slackIntegration.create({
      data: {
        userId: testUserId,
        teamName: 'Sendora Workspace',
        channelName: '#alerts',
        webhookUrlEnc: encrypt('https://hooks.slack.com/services/mock/mock/mock'),
      },
    });

    // 4. Status when connected
    const statusConnected = await axios.get(`${baseUrl}/api/slack/status`, {
      headers: { Cookie: `token=${testUserToken}` },
    });
    expect(statusConnected.status).toBe(200);
    expect(statusConnected.data.connected).toBe(true);
    expect(statusConnected.data.teamName).toBe('Sendora Workspace');
    expect(statusConnected.data.channelName).toBe('#alerts');

    // 5. Disconnect
    const delRes = await axios.delete(`${baseUrl}/api/slack`, {
      headers: { Cookie: `token=${testUserToken}` },
    });
    expect(delRes.status).toBe(200);

    const statusAfterDel = await axios.get(`${baseUrl}/api/slack/status`, {
      headers: { Cookie: `token=${testUserToken}` },
    });
    expect(statusAfterDel.data.connected).toBe(false);
  });
});
