import { Job, DelayedError } from 'bullmq';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { startOfNextUtcHour } from '../utils/time';
import { tryConsumeSlot, releaseSlot } from './rateLimiter';
import { acquireSendStartSlot } from './sendLock';
import { sendEmail } from '../services/mailer.service';
import { updateEmailInIndex } from '../services/search.service';
import { notifyRateLimitHit } from '../services/slack.service';

async function defer(job: Job, token: string | undefined, runAt: number): Promise<never> {
  await job.moveToDelayed(runAt, token);
  throw new DelayedError();
}

export async function processEmail(
  job: Job<{ emailId: string }>,
  token?: string
): Promise<void> {
  const emailId = job.data.emailId;

  // Load email with associated sender and campaign
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true, campaign: true },
  });

  if (!email) {
    logger.warn({ emailId }, 'Job discarded: Email record not found in DB');
    return;
  }

  // Idempotent skip if terminal state
  if (email.status === 'sent' || email.status === 'failed') {
    logger.debug({ emailId, status: email.status }, 'Job skipped: Email already processed');
    return;
  }

  // 1. ATOMIC CLAIM (Idempotency and concurrency safety)
  const staleThreshold = new Date(Date.now() - env.STALE_PROCESSING_MS);
  const claimResult = await prisma.email.updateMany({
    where: {
      id: emailId,
      OR: [
        { status: 'scheduled' },
        { status: 'processing', processingStartedAt: { lt: staleThreshold } },
      ],
    },
    data: {
      status: 'processing',
      processingStartedAt: new Date(),
    },
  });

  if (claimResult.count === 0) {
    logger.debug({ emailId }, 'Job skipped: Email already claimed by another worker');
    return;
  }

  // 2. HOURLY RATE LIMIT (per sender, atomic Lua)
  const limit = Math.min(email.campaign.hourlyLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER);
  const { allowed, count, window } = await tryConsumeSlot(email.senderId, limit);

  if (!allowed) {
    const nextWindowStart = startOfNextUtcHour(new Date());
    logger.info(
      { emailId, sender: email.sender.email, limit, count, nextWindowStart: nextWindowStart.toISOString() },
      'Hourly rate limit reached for sender; rescheduling email to next UTC hour'
    );

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'scheduled',
        scheduledAt: nextWindowStart,
        deferredCount: { increment: 1 },
      },
    });

    // Notify Slack once per window (non-blocking)
    void notifyRateLimitHit({
      userId: email.userId,
      senderEmail: email.sender.email,
      senderId: email.senderId,
      window,
      limit,
      nextWindow: nextWindowStart,
    }).catch((err) => {
      logger.warn({ err }, 'Error triggering Slack rate limit notification');
    });

    await defer(job, token, nextWindowStart.getTime());
  }

  // 3. MINIMUM SPACING BETWEEN SEND STARTS (per sender)
  // Acquire immediately before invoking SMTP, not before rate checks
  const sendSlot = await acquireSendStartSlot(email.senderId);

  if (!sendSlot.acquired) {
    // Release the reserved hourly slot since no SMTP attempt has started
    await releaseSlot(email.senderId, window);

    const jitter = Math.floor(Math.random() * 50) + 20; // 20-70ms jitter
    const runAt = Date.now() + sendSlot.waitMs + jitter;

    logger.debug(
      { emailId, sender: email.sender.email, waitMs: sendSlot.waitMs + jitter },
      'Sender send-start spacing lock active; deferring job'
    );

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'scheduled',
        scheduledAt: new Date(runAt),
        deferredCount: { increment: 1 },
      },
    });

    await defer(job, token, runAt);
  }

  // 4. INVOKE SMTP SEND
  const sendStartedAt = new Date();
  logger.info(
    { emailId, to: email.recipient, sender: email.sender.email, sendStartedAt: sendStartedAt.toISOString() },
    'Starting SMTP send attempt'
  );

  try {
    const info = await sendEmail(
      email.sender,
      email.recipient,
      email.subject,
      email.campaign.body,
      email.id
    );

    const sentAt = new Date();
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'sent',
        sentAt,
        attempts: { increment: 1 },
        messageId: info.messageId,
        previewUrl: info.previewUrl,
        errorMessage: null,
      },
    });

    // Update Elasticsearch (non-blocking)
    void updateEmailInIndex(emailId, {
      status: 'sent',
      sentAt,
      errorMessage: null,
    }).catch((err) => {
      logger.warn({ err, emailId }, 'Failed to update sent email status in Elasticsearch');
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, emailId, to: email.recipient }, 'SMTP send failed');

    // Decrement rate counter since the slot was not successfully used
    await releaseSlot(email.senderId, window);

    const nextAttempt = email.attempts + 1;
    if (nextAttempt < env.EMAIL_MAX_ATTEMPTS) {
      const backoffMs = Math.pow(2, nextAttempt) * 5000;
      const runAt = Date.now() + backoffMs;

      logger.info(
        { emailId, attempt: nextAttempt, maxAttempts: env.EMAIL_MAX_ATTEMPTS, backoffMs },
        'Scheduling retry with exponential backoff'
      );

      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'scheduled',
          scheduledAt: new Date(runAt),
          attempts: nextAttempt,
          errorMessage: errorMsg,
        },
      });

      await defer(job, token, runAt);
    } else {
      logger.error(
        { emailId, attempts: nextAttempt },
        'Email permanently failed after reaching maximum attempts'
      );

      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'failed',
          attempts: nextAttempt,
          errorMessage: errorMsg,
        },
      });

      void updateEmailInIndex(emailId, {
        status: 'failed',
        errorMessage: errorMsg,
      }).catch((esErr) => {
        logger.warn({ esErr, emailId }, 'Failed to update failed email status in Elasticsearch');
      });
    }
  }
}
