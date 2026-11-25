import express from 'express';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    campaigns: new Map<string, { archivedAt: Date | null }>(),
    emails: [] as Array<Record<string, any>>,
  };

  const matchesWhere = (email: Record<string, any>, where: Record<string, any>) => {
    if (where.userId && email.userId !== where.userId) return false;
    if (where.campaignId && email.campaignId !== where.campaignId) return false;
    if (where.status?.in && !where.status.in.includes(email.status)) return false;
    if (where.campaign?.is?.archivedAt === null) {
      if (state.campaigns.get(email.campaignId)?.archivedAt !== null) return false;
    }
    return true;
  };

  const emailCount = vi.fn(async ({ where }: { where: Record<string, any> }) =>
    state.emails.filter((email) => matchesWhere(email, where)).length,
  );
  const emailFindMany = vi.fn(async (args: {
    where: Record<string, any>;
    skip: number;
    take: number;
    orderBy: Record<string, any> | Array<Record<string, any>>;
  }) => {
    const rows = state.emails.filter((email) => matchesWhere(email, args.where));
    const order = Array.isArray(args.orderBy) ? args.orderBy[0] : args.orderBy;
    const [key, direction] = Object.entries(order)[0] || ['createdAt', 'desc'];
    rows.sort((a, b) => {
      const av = a[key]?.getTime?.() ?? 0;
      const bv = b[key]?.getTime?.() ?? 0;
      return direction === 'asc' ? av - bv : bv - av;
    });
    return rows.slice(args.skip, args.skip + args.take).map((email) => ({
      ...email,
      sender: { email: 'sender@ethereal.email' },
    }));
  });

  const campaignFindMany = vi.fn(async () => [] as Array<{ id: string }>);
  const esSearch = vi.fn(async () => ({
    hits: {
      total: { value: 1 },
      hits: [{ _source: { id: 'active-search-result', campaignId: 'active-campaign' } }],
    },
  }));

  return {
    state,
    emailCount,
    emailFindMany,
    campaignFindMany,
    esSearch,
    prisma: {
      email: { count: emailCount, findMany: emailFindMany },
      campaign: { findMany: campaignFindMany },
    },
  };
});

vi.mock('../src/db/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../src/middleware/auth', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'test-user', email: 'test@example.com', name: 'Test User' };
    next();
  },
}));
vi.mock('@elastic/elasticsearch', () => ({
  Client: class {
    search = mocks.esSearch;
    ping = vi.fn();
    bulk = vi.fn();
    update = vi.fn();
    indices = { exists: vi.fn(), create: vi.fn() };
  },
}));

import { emailRouter } from '../src/routes/email.routes';
import { searchEmails } from '../src/services/search.service';
import { env } from '../src/config/env';

function makeEmail(
  id: string,
  campaignId: string,
  status: string,
  options: Record<string, unknown> = {},
) {
  const now = new Date('2026-11-25T00:00:00.000Z');
  return {
    id,
    campaignId,
    userId: 'test-user',
    recipient: `${id}@example.test`,
    subject: id,
    status,
    scheduledAt: now,
    originalScheduledAt: now,
    sentAt: status === 'sent' ? now : null,
    createdAt: now,
    updatedAt: now,
    processingStartedAt: status === 'processing' ? now : null,
    attempts: status === 'processing' ? 1 : 0,
    deferredCount: 0,
    messageId: null,
    previewUrl: null,
    errorMessage: status === 'processing' ? 'SMTP_OUTCOME_UNKNOWN: preserve' : null,
    ...options,
  };
}

describe('archived campaign email visibility', () => {
  const originalElasticsearchEnabled = env.ELASTICSEARCH_ENABLED;
  const app = express();
  app.use('/api/emails', emailRouter);
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    (env as { ELASTICSEARCH_ENABLED: boolean }).ELASTICSEARCH_ENABLED = true;
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    mocks.state.campaigns = new Map([
      ['active-campaign', { archivedAt: null }],
      ['archived-campaign', { archivedAt: new Date('2026-11-25T00:00:00.000Z') }],
    ]);
    mocks.state.emails = [
      makeEmail('active-scheduled', 'active-campaign', 'scheduled'),
      makeEmail('active-processing', 'active-campaign', 'processing'),
      makeEmail('active-sent', 'active-campaign', 'sent'),
      makeEmail('active-failed', 'active-campaign', 'failed'),
      makeEmail('archived-scheduled', 'archived-campaign', 'scheduled'),
      makeEmail('archived-processing', 'archived-campaign', 'processing'),
      makeEmail('archived-sent', 'archived-campaign', 'sent'),
    ];
    mocks.campaignFindMany.mockResolvedValue([{ id: 'active-campaign' }]);
    mocks.esSearch.mockResolvedValue({
      hits: {
        total: { value: 1 },
        hits: [{ _source: { id: 'active-search-result', campaignId: 'active-campaign' } }],
      },
    });
    vi.clearAllMocks();
  });

  afterAll(async () => {
    (env as { ELASTICSEARCH_ENABLED: boolean }).ELASTICSEARCH_ENABLED = originalElasticsearchEnabled;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('keeps active campaign scheduled and sent emails visible, with archived rows excluded from page totals', async () => {
    const scheduledPage = await fetch(`${baseUrl}/api/emails?status=scheduled&page=2&limit=1`).then((r) => r.json());
    expect(scheduledPage.total).toBe(2);
    expect(scheduledPage.items.map((item: { id: string }) => item.id)).toEqual(['active-processing']);

    const sentPage = await fetch(`${baseUrl}/api/emails?status=sent&limit=10`).then((r) => r.json());
    expect(sentPage.total).toBe(2);
    expect(sentPage.items.map((item: { id: string }) => item.id).sort()).toEqual([
      'active-failed',
      'active-sent',
    ]);

    const listWhere = mocks.emailFindMany.mock.calls[0][0].where;
    const countWhere = mocks.emailCount.mock.calls[0][0].where;
    expect(listWhere.campaign).toEqual({ is: { archivedAt: null } });
    expect(countWhere).toEqual(listWhere);
  });

  it('does not change sent or SMTP-uncertain email records in archived campaigns', async () => {
    const archivedRowsBefore = structuredClone(
      mocks.state.emails.filter((email) => email.campaignId === 'archived-campaign'),
    );

    await fetch(`${baseUrl}/api/emails?status=scheduled`);
    await fetch(`${baseUrl}/api/emails?status=sent`);

    const archivedRowsAfter = mocks.state.emails.filter((email) => email.campaignId === 'archived-campaign');
    expect(archivedRowsAfter).toEqual(archivedRowsBefore);
    expect(archivedRowsAfter.map((email) => email.status).sort()).toEqual([
      'processing',
      'scheduled',
      'sent',
    ]);
    expect(archivedRowsAfter.find((email) => email.status === 'processing')?.errorMessage)
      .toBe('SMTP_OUTCOME_UNKNOWN: preserve');
  });

  it('searches only active campaign emails so archived matches do not affect results or totals', async () => {
    const result = await searchEmails({ userId: 'test-user', q: 'needle', page: 1, limit: 10 });

    expect(result.total).toBe(1);
    expect(result.items).toEqual([
      { id: 'active-search-result', campaignId: 'active-campaign' },
    ]);
    expect(mocks.campaignFindMany).toHaveBeenCalledWith({
      where: { userId: 'test-user', archivedAt: null },
      select: { id: true },
    });
    const query = mocks.esSearch.mock.calls[0][0];
    expect(query.query.bool.filter).toContainEqual({ terms: { campaignId: ['active-campaign'] } });
  });
});
