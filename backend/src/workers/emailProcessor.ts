import { Job, DelayedError } from "bullmq";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { startOfNextUtcHour } from "../utils/time";
import { tryConsumeSlot, releaseSlot } from "./rateLimiter";
import { acquireSendStartSlot } from "./sendLock";
import { sendEmail } from "../services/mailer.service";
import { updateEmailInIndex } from "../services/search.service";
import { notifyRateLimitHit } from "../services/slack.service";

export const SMTP_OUTCOME_UNKNOWN_PREFIX = "SMTP_OUTCOME_UNKNOWN:";

function isUncertainSmtpFailure(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("responseCode" in error)) {
    return true;
  }
  const responseCode = (error as { responseCode?: unknown }).responseCode;
  return (
    typeof responseCode !== "number" ||
    responseCode < 400 ||
    responseCode >= 600
  );
}

async function defer(
  job: Job,
  token: string | undefined,
  runAt: number,
): Promise<never> {
  await job.moveToDelayed(runAt, token);
  throw new DelayedError();
}

export async function processEmail(
  job: Job<{ emailId: string }>,
  token?: string,
): Promise<void> {
  const emailId = job.data.emailId;

  // Load email with associated sender and campaign
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true, campaign: true },
  });

  if (!email) {
    logger.warn({ emailId }, "Job discarded: Email record not found in DB");
    return;
  }

  if (email.errorMessage?.startsWith(SMTP_OUTCOME_UNKNOWN_PREFIX)) {
    logger.error(
      { emailId },
      "Email has an ambiguous SMTP outcome; skipping automatic resend to prevent duplicates",
    );
    return;
  }

  // Idempotent skip if terminal state
  if (email.status === "sent" || email.status === "failed") {
    logger.debug(
      { emailId, status: email.status },
      "Job skipped: Email already processed",
    );
    return;
  }

  // 1. ATOMIC CLAIM (Idempotency and concurrency safety)
  const staleThreshold = new Date(Date.now() - env.STALE_PROCESSING_MS);
  const processingClaimCondition = {
    status: "processing" as const,
    AND: [
      job.attemptsMade > 0
        ? {}
        : { processingStartedAt: { lt: staleThreshold } },
      {
        OR: [
          { errorMessage: null },
          {
            errorMessage: { not: { startsWith: SMTP_OUTCOME_UNKNOWN_PREFIX } },
          },
        ],
      },
    ],
  };
  const claimResult = await prisma.email.updateMany({
    where: {
      id: emailId,
      OR: [{ status: "scheduled" }, processingClaimCondition],
    },
    data: {
      status: "processing",
      processingStartedAt: new Date(),
    },
  });

  if (claimResult.count === 0) {
    logger.debug(
      { emailId },
      "Job skipped: Email already claimed by another worker",
    );
    return;
  }

  // 2. HOURLY RATE LIMIT (per sender, atomic Lua)
  const limit = Math.min(
    email.campaign.hourlyLimit,
    env.MAX_EMAILS_PER_HOUR_PER_SENDER,
  );
  const { allowed, count, window } = await tryConsumeSlot(
    email.senderId,
    limit,
  );

  if (!allowed) {
    const nextWindowStart = startOfNextUtcHour(new Date());
    logger.info(
      {
        emailId,
        sender: email.sender.email,
        limit,
        count,
        nextWindowStart: nextWindowStart.toISOString(),
      },
      "Hourly rate limit reached for sender; rescheduling email to next UTC hour",
    );

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: "scheduled",
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
      logger.warn({ err }, "Error triggering Slack rate limit notification");
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
      "Sender send-start spacing lock active; deferring job",
    );

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: "scheduled",
        scheduledAt: new Date(runAt),
        deferredCount: { increment: 1 },
      },
    });

    await defer(job, token, runAt);
  }

  // 4. INVOKE SMTP SEND
  const sendStartedAt = new Date();
  logger.info(
    {
      emailId,
      to: email.recipient,
      sender: email.sender.email,
      sendStartedAt: sendStartedAt.toISOString(),
    },
    "Starting SMTP send attempt",
  );

  const smtpAttempt = await prisma.email.updateMany({
    where: { id: emailId, status: "processing" },
    data: {
      errorMessage: `${SMTP_OUTCOME_UNKNOWN_PREFIX} SMTP was invoked; verify delivery before retrying.`,
      attempts: { increment: 1 },
    },
  });

  if (smtpAttempt.count !== 1) {
    logger.warn(
      { emailId },
      "Email claim changed before SMTP invocation; send skipped",
    );
    return;
  }

  let info: Awaited<ReturnType<typeof sendEmail>>;
  try {
    info = await sendEmail(
      email.sender,
      email.recipient,
      email.subject,
      email.campaign.body,
      email.id,
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (isUncertainSmtpFailure(err)) {
      logger.error(
        { err, emailId, to: email.recipient },
        "SMTP outcome is ambiguous; automatic retry disabled to prevent duplicate delivery",
      );
      return;
    }

    logger.error(
      { err, emailId, to: email.recipient },
      "SMTP rejected the message",
    );

    await releaseSlot(email.senderId, window);

    const nextAttempt = email.attempts + 1;
    if (nextAttempt < env.EMAIL_MAX_ATTEMPTS) {
      const backoffMs = Math.pow(2, nextAttempt) * 5000;
      const runAt = Date.now() + backoffMs;

      logger.info(
        {
          emailId,
          attempt: nextAttempt,
          maxAttempts: env.EMAIL_MAX_ATTEMPTS,
          backoffMs,
        },
        "Scheduling retry with exponential backoff",
      );

      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: "scheduled",
          scheduledAt: new Date(runAt),
          attempts: nextAttempt,
          errorMessage: errorMsg,
        },
      });

      await defer(job, token, runAt);
    } else {
      logger.error(
        { emailId, attempts: nextAttempt },
        "Email permanently failed after reaching maximum attempts",
      );

      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: "failed",
          attempts: nextAttempt,
          errorMessage: errorMsg,
        },
      });

      void updateEmailInIndex(emailId, {
        status: "failed",
        errorMessage: errorMsg,
      }).catch((esErr) => {
        logger.warn(
          { esErr, emailId },
          "Failed to update failed email status in Elasticsearch",
        );
      });
    }
    return;
  }

  const sentAt = new Date();
  try {
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: "sent",
        sentAt,
        messageId: info.messageId,
        previewUrl: info.previewUrl,
        errorMessage: null,
      },
    });
  } catch (err) {
    logger.error(
      { err, emailId, messageId: info.messageId },
      "SMTP accepted the message but PostgreSQL did not confirm the sent status; reconciliation will not resend automatically",
    );
    return;
  }

  void updateEmailInIndex(emailId, {
    status: "sent",
    sentAt,
    errorMessage: null,
  }).catch((err) => {
    logger.warn(
      { err, emailId },
      "Failed to update sent email status in Elasticsearch",
    );
  });
}
