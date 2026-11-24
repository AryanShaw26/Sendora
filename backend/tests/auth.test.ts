import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { signUserToken } from '../src/services/auth.service';
import { emailQueue } from '../src/queue/queue';
import { defaultRedis } from '../src/redis/connection';
import http from 'http';

describe('Auth & Bull Board Integration Tests', () => {
  let server: http.Server;
  let testUserToken: string;
  let testUser: { id: string; email: string; name: string };
  const PORT = 4099;
  const baseUrl = `http://localhost:${PORT}`;

  beforeAll(async () => {
    const app = createApp();
    server = app.listen(PORT);

    testUser = await prisma.user.upsert({
      where: { email: 'auth-test@sendora.local' },
      update: {},
      create: {
        googleId: 'auth-test-google-id',
        email: 'auth-test@sendora.local',
        name: 'Auth Test User',
      },
      select: { id: true, email: true, name: true },
    });

    testUserToken = signUserToken(testUser.id);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await emailQueue.close();
    await defaultRedis.quit();
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests to /api/me with 401', async () => {
    try {
      await axios.get(`${baseUrl}/api/me`);
      expect.fail('Should have thrown 401');
    } catch (err: any) {
      expect(err.response?.status).toBe(401);
      expect(err.response?.data?.error?.code).toBe('UNAUTHORIZED');
    }
  });

  it('returns user profile on /api/me with valid auth token', async () => {
    const res = await axios.get(`${baseUrl}/api/me`, {
      headers: {
        Cookie: `token=${testUserToken}`,
      },
    });

    expect(res.status).toBe(200);
    expect(res.data.id).toBe(testUser.id);
    expect(res.data.email).toBe(testUser.email);
    expect(res.data.name).toBe(testUser.name);
  });

  it('protects /admin/queues (Bull Board) with authMiddleware', async () => {
    // 1. Without auth -> 401
    try {
      await axios.get(`${baseUrl}/admin/queues`);
      expect.fail('Should have thrown 401');
    } catch (err: any) {
      expect(err.response?.status).toBe(401);
    }

    // 2. With auth -> 200 (HTML dashboard returned or 302 redirect to trailing slash)
    const res = await axios.get(`${baseUrl}/admin/queues`, {
      headers: {
        Cookie: `token=${testUserToken}`,
      },
      maxRedirects: 5,
    });
    expect(res.status).toBe(200);
  });

  it('clears session cookie on /auth/logout', async () => {
    const res = await axios.post(`${baseUrl}/auth/logout`);
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies?.some((c) => c.includes('token=;'))).toBe(true);
  });
});
