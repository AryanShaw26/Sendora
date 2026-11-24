import nodemailer from 'nodemailer';
import { prisma } from '../src/db/prisma';
import { env } from '../src/config/env';
import { logger } from '../src/config/logger';

async function seedSenders() {
  logger.info('Checking existing senders in database...');
  let currentCount = await prisma.sender.count({
    where: { isActive: true },
  });

  const targetCount = env.ETHEREAL_SENDER_COUNT;
  logger.info({ currentCount, targetCount }, 'Current sender count vs target count');

  if (currentCount >= targetCount) {
    logger.info(`Already have ${currentCount} active senders (target is ${targetCount}). No new senders needed.`);
    const senders = await prisma.sender.findMany({ where: { isActive: true } });
    for (const s of senders) {
      console.log(`- Sender: ${s.displayName} (${s.email})`);
    }
    return;
  }

  let attempts = 0;
  while (currentCount < targetCount && attempts < 10) {
    attempts++;
    const nextIndex = currentCount + 1;
    try {
      logger.info(`Requesting Ethereal account #${nextIndex} (attempt ${attempts})...`);
      const acct = await nodemailer.createTestAccount();
      
      const existing = await prisma.sender.findUnique({
        where: { email: acct.user },
      });

      if (existing) {
        logger.info(`Ethereal returned duplicate account ${acct.user}; waiting before retry...`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }

      const sender = await prisma.sender.create({
        data: {
          email: acct.user,
          displayName: `Sender ${nextIndex}`,
          smtpHost: acct.smtp.host,
          smtpPort: acct.smtp.port,
          smtpUser: acct.user,
          smtpPass: acct.pass,
          isActive: true,
        },
      });

      console.log(`✅ Created Sender ${nextIndex}: ${sender.email}`);
      currentCount = await prisma.sender.count({ where: { isActive: true } });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (err) {
      logger.warn({ err }, 'Error creating Ethereal account, retrying...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  const finalSenders = await prisma.sender.findMany({ where: { isActive: true } });
  console.log('\n--- Active Senders ---');
  for (const s of finalSenders) {
    console.log(`- ${s.displayName}: ${s.email} (SMTP User: ${s.smtpUser})`);
  }
  console.log('\nHint: Log in at https://ethereal.email/login or inspect previewUrl stored per email in the dashboard.');
}

seedSenders()
  .catch((err) => {
    logger.error({ err }, 'Error running seed-senders script');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
