import { describe, expect, it, vi } from 'vitest';
import { loadNodemailer, seedSenders } from '../scripts/seed-senders';

type Sender = {
  id: string;
  email: string;
  displayName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  isActive: boolean;
};

function makeSender(id: string, email: string, isActive = true): Sender {
  return {
    id,
    email,
    displayName: id,
    smtpHost: 'smtp.ethereal.email',
    smtpPort: 587,
    smtpUser: email,
    smtpPass: `password-${id}`,
    isActive,
  };
}

function mockStore(initial: Sender[] = []) {
  const rows = [...initial];
  let nextId = rows.length;
  const senderStore = {
    findMany: vi.fn(async () => [...rows]),
    create: vi.fn(async ({ data }: { data: Omit<Sender, 'id'> }) => {
      if (rows.some((row) => row.email.toLowerCase() === data.email.toLowerCase())) {
        throw new Error('Unique constraint failed on email');
      }
      const row = { ...data, id: `sender-${++nextId}` };
      rows.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { isActive: true } }) => {
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error('Sender not found');
      Object.assign(row, data);
      return { ...row };
    }),
  };
  return { senderStore, rows };
}

function account(user: string) {
  return { user, pass: `password-${user}`, smtp: { host: 'smtp.ethereal.email', port: 587 } };
}

describe('seedSenders', () => {
  it('disables Ethereal account caching before loading Nodemailer', async () => {
    const previousCacheSetting = process.env.ETHEREAL_CACHE;
    const load = vi.fn(async () => ({ loaded: true }));

    try {
      const module = await loadNodemailer(load);

      expect(process.env.ETHEREAL_CACHE).toBe('no');
      expect(load).toHaveBeenCalledOnce();
      expect(module).toEqual({ loaded: true });
    } finally {
      if (previousCacheSetting === undefined) {
        delete process.env.ETHEREAL_CACHE;
      } else {
        process.env.ETHEREAL_CACHE = previousCacheSetting;
      }
    }
  });

  it('retries a repeated Ethereal account response and inserts only distinct emails', async () => {
    const { senderStore, rows } = mockStore([makeSender('existing', 'already@ethereal.email')]);
    const responses = [
      account('new-one@ethereal.email'),
      account('new-one@ethereal.email'), // Ethereal can repeat the previous account.
      account('new-two@ethereal.email'),
    ];
    const createTestAccount = vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error('Unexpected account request');
      return next;
    });

    const result = await seedSenders({
      senderStore,
      createTestAccount,
      targetCount: 3,
      maxAttempts: 5,
      retryDelayMs: 0,
    });

    expect(result.map((sender) => sender.email)).toEqual([
      'already@ethereal.email',
      'new-one@ethereal.email',
      'new-two@ethereal.email',
    ]);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((sender) => sender.email.toLowerCase())).size).toBe(3);
    expect(senderStore.create).toHaveBeenCalledTimes(2);
    expect(createTestAccount).toHaveBeenCalledTimes(3);
  });

  it('reuses an existing valid inactive account returned by Ethereal', async () => {
    const inactive = makeSender('inactive', 'reused@ethereal.email', false);
    const { senderStore, rows } = mockStore([makeSender('active', 'active@ethereal.email'), inactive]);

    const result = await seedSenders({
      senderStore,
      createTestAccount: vi.fn(async () => account('reused@ethereal.email')),
      targetCount: 2,
      retryDelayMs: 0,
    });

    expect(result.map((sender) => sender.email)).toEqual([
      'active@ethereal.email',
      'reused@ethereal.email',
    ]);
    expect(rows.find((sender) => sender.id === 'active')?.isActive).toBe(true);
    expect(rows.find((sender) => sender.id === 'inactive')?.isActive).toBe(true);
    expect(senderStore.create).not.toHaveBeenCalled();
  });

  it('stops after the retry limit when Ethereal keeps returning a duplicate', async () => {
    const { senderStore, rows } = mockStore([makeSender('existing', 'existing@ethereal.email')]);
    const createTestAccount = vi.fn(async () => account('existing@ethereal.email'));

    await expect(seedSenders({
      senderStore,
      createTestAccount,
      targetCount: 2,
      maxAttempts: 3,
      retryDelayMs: 0,
    })).rejects.toThrow(/found 1 after 3 attempts/);

    expect(createTestAccount).toHaveBeenCalledTimes(3);
    expect(senderStore.create).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });
});
