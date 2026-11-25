import { prisma } from '../src/db/prisma';
import { env } from '../src/config/env';
import { logger } from '../src/config/logger';

type StoredSender = {
  id: string;
  email: string;
  displayName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  isActive: boolean;
};

type EtherealAccount = {
  user: string;
  pass: string;
  smtp: { host: string; port: number };
};

type SenderStore = {
  findMany(args: { orderBy: { createdAt: 'asc' } }): Promise<StoredSender[]>;
  create(args: { data: Omit<StoredSender, 'id'> }): Promise<StoredSender>;
  update(args: { where: { id: string }; data: { isActive: true } }): Promise<StoredSender>;
};

type SeedOptions = {
  senderStore: SenderStore;
  createTestAccount: () => Promise<EtherealAccount>;
  targetCount: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  wait?: (ms: number) => Promise<void>;
};

const DEFAULT_MAX_ATTEMPTS = 15;

/** Loads Nodemailer only after disabling its process-local Ethereal account cache. */
export async function loadNodemailer<T>(load: () => Promise<T>): Promise<T> {
  process.env.ETHEREAL_CACHE = 'no';
  return load();
}

function isValidSender(sender: StoredSender): boolean {
  return Boolean(
    sender.email && sender.smtpUser && sender.smtpPass && sender.smtpHost &&
    Number.isInteger(sender.smtpPort) && sender.smtpPort > 0,
  );
}

function isValidAccount(account: EtherealAccount): boolean {
  return Boolean(
    account.user && account.pass && account.smtp?.host &&
    Number.isInteger(account.smtp?.port) && account.smtp.port > 0,
  );
}

/** Fills the active sender pool without changing existing active rows. */
export async function seedSenders({
  senderStore,
  createTestAccount,
  targetCount,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = 1_000,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: SeedOptions): Promise<StoredSender[]> {
  if (!Number.isInteger(targetCount) || targetCount < 1) {
    throw new Error(`ETHEREAL_SENDER_COUNT must be a positive integer; received ${targetCount}`);
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(`maxAttempts must be a positive integer; received ${maxAttempts}`);
  }

  const allSenders = await senderStore.findMany({ orderBy: { createdAt: 'asc' } });
  const sendersByEmail = new Map(allSenders.map((sender) => [sender.email.toLowerCase(), sender]));
  const active = new Map<string, StoredSender>();

  // Existing active senders are never modified or removed.
  for (const sender of allSenders) {
    if (sender.isActive) active.set(sender.email.toLowerCase(), sender);
  }

  // Reactivate complete prior accounts before asking Ethereal for new ones.
  for (const sender of allSenders) {
    if (active.size >= targetCount) break;
    if (sender.isActive || !isValidSender(sender)) continue;
    const reactivated = await senderStore.update({
      where: { id: sender.id },
      data: { isActive: true },
    });
    active.set(reactivated.email.toLowerCase(), reactivated);
  }

  let attempts = 0;
  let lastError: unknown;
  while (active.size < targetCount && attempts < maxAttempts) {
    attempts += 1;
    try {
      const account = await createTestAccount();
      if (!isValidAccount(account)) {
        throw new Error('Ethereal returned an incomplete SMTP account');
      }

      const key = account.user.toLowerCase();
      const existing = sendersByEmail.get(key);
      if (existing) {
        if (isValidSender(existing)) {
          if (!existing.isActive) {
            const reactivated = await senderStore.update({
              where: { id: existing.id },
              data: { isActive: true },
            });
            sendersByEmail.set(key, reactivated);
            active.set(key, reactivated);
          } else {
            active.set(key, existing);
          }
        }
        lastError = new Error(`Ethereal returned existing email ${account.user}`);
      } else {
        const sender = await senderStore.create({
          data: {
            email: account.user,
            displayName: `Sender ${active.size + 1}`,
            smtpHost: account.smtp.host,
            smtpPort: account.smtp.port,
            smtpUser: account.user,
            smtpPass: account.pass,
            isActive: true,
          },
        });
        sendersByEmail.set(key, sender);
        active.set(key, sender);
        logger.info({ email: sender.email }, 'Created active Ethereal sender');
      }
    } catch (error) {
      lastError = error;
      logger.warn({ attempt: attempts, maxAttempts, err: error }, 'Could not add a distinct Ethereal sender');
    }

    if (active.size < targetCount && attempts < maxAttempts && retryDelayMs > 0) {
      await wait(retryDelayMs);
    }
  }

  if (active.size < targetCount) {
    const reason = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
    throw new Error(
      `Unable to reach ${targetCount} active senders: found ${active.size} after ${attempts} attempts.${reason}`,
    );
  }

  const result = [...active.values()];
  logger.info({ activeCount: result.length, targetCount }, 'Active sender pool ready');
  return result;
}

async function main(): Promise<void> {
  const nodemailer = await loadNodemailer(() => import('nodemailer'));
  const senders = await seedSenders({
    senderStore: prisma.sender as unknown as SenderStore,
    createTestAccount: () => nodemailer.default.createTestAccount(),
    targetCount: env.ETHEREAL_SENDER_COUNT,
  });
  console.log('\n--- Active Senders ---');
  for (const sender of senders) console.log(`- ${sender.displayName}: ${sender.email}`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      logger.error({ err: error }, 'Error running seed-senders script');
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
