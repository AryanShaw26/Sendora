import crypto from 'crypto';
import { prisma } from '../src/db/prisma';
import { scheduleCampaign } from '../src/services/schedule.service';

async function main(): Promise<void> {
  const count = Math.max(1, Number(process.argv[2]) || 1200);
  const hourlyLimit = Math.max(1, Number(process.argv[3]) || 50);
  const userId =
    process.env.LOAD_TEST_USER_ID ||
    (
      await prisma.user.upsert({
        where: { email: 'load-test@sendora.local' },
        update: {},
        create: {
          googleId: `load-test-${crypto.randomUUID()}`,
          email: 'load-test@sendora.local',
          name: 'Sendora Load Test',
        },
      })
    ).id;

  const result = await scheduleCampaign(userId, {
    subject: `Sendora load test (${count} recipients)`,
    body: '<p>Load test message</p>',
    emails: Array.from({ length: count }, (_, index) => `load-test-${index + 1}@sendora.test`),
    startTime: new Date(),
    delaySeconds: 0,
    hourlyLimit,
  });

  console.log(JSON.stringify({
    campaignId: result.data.campaignId,
    persisted: result.data.persisted,
    queueStatus: result.data.queueStatus,
    scheduled: result.data.total,
  }, null, 2));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const counts = await prisma.email.groupBy({
      by: ['status'],
      where: { campaignId: result.data.campaignId },
      _count: { _all: true },
    });
    const deferred = await prisma.email.aggregate({
      where: { campaignId: result.data.campaignId },
      _sum: { deferredCount: true },
    });
    const output: Record<string, number> = {};
    for (const countRow of counts) {
      output[countRow.status] = countRow._count._all;
    }
    output.deferredCount = deferred._sum.deferredCount || 0;
    console.log(JSON.stringify(output));
    if ((output.sent || 0) + (output.failed || 0) >= count) break;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
