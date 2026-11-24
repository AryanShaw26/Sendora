import { prisma } from '../src/db/prisma';
import { ensureIndex, indexEmails } from '../src/services/search.service';
import { logger } from '../src/config/logger';

async function reindex() {
  logger.info('Starting full Elasticsearch reindex from PostgreSQL...');
  await ensureIndex();

  const batchSize = 500;
  let cursor: string | undefined = undefined;
  let totalIndexed = 0;

  while (true) {
    const emails: Array<{
      id: string;
      userId: string;
      campaignId: string;
      recipient: string;
      subject: string;
      status: string;
      scheduledAt: Date;
      sentAt: Date | null;
      errorMessage: string | null;
      sender: { email: string };
      campaign: { body: string };
    }> = await prisma.email.findMany({
      take: batchSize,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        userId: true,
        campaignId: true,
        recipient: true,
        subject: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        errorMessage: true,
        sender: { select: { email: true } },
        campaign: { select: { body: true } },
      },
    });

    if (emails.length === 0) {
      break;
    }

    cursor = emails[emails.length - 1].id;

    await indexEmails(
      emails.map((e) => ({
        id: e.id,
        userId: e.userId,
        campaignId: e.campaignId,
        recipient: e.recipient,
        subject: e.subject,
        body: e.campaign.body,
        status: e.status,
        senderEmail: e.sender.email,
        scheduledAt: e.scheduledAt,
        sentAt: e.sentAt,
        errorMessage: e.errorMessage,
      }))
    );

    totalIndexed += emails.length;
    logger.info({ totalIndexed }, 'Reindexed batch of emails into Elasticsearch');
  }

  logger.info({ totalIndexed }, 'Full reindex completed successfully!');
}

reindex()
  .catch((err) => {
    logger.error({ err }, 'Reindex script encountered an error');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
