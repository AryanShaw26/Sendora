import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { enqueueEmails } from '../queue/enqueue';
import { targetedReconcileEmails } from '../queue/reconcile';
import { indexEmails } from './search.service';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const scheduleRequestSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject must be <= 200 chars'),
  body: z.string().min(1, 'Body is required').max(50000, 'Body must be <= 50,000 chars'),
  emails: z
    .array(z.string())
    .min(1, 'At least 1 recipient is required')
    .max(10000, 'Maximum 10,000 recipients per schedule'),
  startTime: z.string().or(z.date()),
  delaySeconds: z.coerce.number().min(0).max(3600),
  hourlyLimit: z.coerce
    .number()
    .min(1, 'Hourly limit must be at least 1')
    .max(
      env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      `Hourly limit cannot exceed server cap of ${env.MAX_EMAILS_PER_HOUR_PER_SENDER}`
    ),
});

export type ScheduleRequestInput = z.infer<typeof scheduleRequestSchema>;

export interface ScheduleResult {
  campaignId: string;
  total: number;
  firstScheduledAt: string;
  lastScheduledAt: string;
  queueStatus: 'queued' | 'pending_reconciliation';
  persisted: boolean;
}

export function normalizeRecipients(emails: string[]): {
  valid: string[];
  invalidCount: number;
  duplicateCount: number;
} {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const raw of emails) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || !emailRegex.test(trimmed)) {
      invalidCount++;
      continue;
    }
    if (seen.has(trimmed)) {
      duplicateCount++;
      continue;
    }
    seen.add(trimmed);
    valid.push(trimmed);
  }

  return { valid, invalidCount, duplicateCount };
}

export async function scheduleCampaign(
  userId: string,
  input: ScheduleRequestInput
): Promise<{ status: 201 | 202; data: ScheduleResult }> {
  // 1. Validate & normalize recipients
  const { valid } = normalizeRecipients(input.emails);
  if (valid.length === 0) {
    const err = new Error('No valid recipient email addresses found');
    (err as unknown as { status: number; code: string }).status = 400;
    (err as unknown as { status: number; code: string }).code = 'INVALID_RECIPIENTS';
    throw err;
  }

  // 2. Load active senders
  const activeSenders = await prisma.sender.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (activeSenders.length === 0) {
    const err = new Error('No active email senders found. Run npm run seed:senders');
    (err as unknown as { status: number; code: string }).status = 500;
    (err as unknown as { status: number; code: string }).code = 'NO_ACTIVE_SENDERS';
    throw err;
  }

  // 3. Compute scheduling times
  const requestedStart =
    typeof input.startTime === 'string' ? new Date(input.startTime) : input.startTime;
  const baseTime = Math.max(requestedStart.getTime(), Date.now());

  const campaignId = crypto.randomUUID();
  const emailRows: Array<{
    id: string;
    campaignId: string;
    userId: string;
    senderId: string;
    senderEmail: string;
    recipient: string;
    subject: string;
    seq: number;
    status: 'scheduled';
    scheduledAt: Date;
    originalScheduledAt: Date;
    body: string;
  }> = [];

  for (let i = 0; i < valid.length; i++) {
    const scheduledTime = new Date(baseTime + i * input.delaySeconds * 1000);
    const assignedSender = activeSenders[i % activeSenders.length];
    const emailId = crypto.randomUUID();

    emailRows.push({
      id: emailId,
      campaignId,
      userId,
      senderId: assignedSender.id,
      senderEmail: assignedSender.email,
      recipient: valid[i],
      subject: input.subject,
      seq: i,
      status: 'scheduled',
      scheduledAt: scheduledTime,
      originalScheduledAt: scheduledTime,
      body: input.body,
    });
  }

  // 4. Prisma transaction (Campaign + chunked Emails)
  await prisma.$transaction(async (tx) => {
    await tx.campaign.create({
      data: {
        id: campaignId,
        userId,
        subject: input.subject,
        body: input.body,
        startTime: new Date(baseTime),
        delaySeconds: input.delaySeconds,
        hourlyLimit: input.hourlyLimit,
        totalEmails: valid.length,
      },
    });

    const chunkSize = 1000;
    for (let i = 0; i < emailRows.length; i += chunkSize) {
      const chunk = emailRows.slice(i, i + chunkSize);
      await tx.email.createMany({
        data: chunk.map((e) => ({
          id: e.id,
          campaignId: e.campaignId,
          userId: e.userId,
          senderId: e.senderId,
          recipient: e.recipient,
          subject: e.subject,
          seq: e.seq,
          status: e.status,
          scheduledAt: e.scheduledAt,
          originalScheduledAt: e.originalScheduledAt,
        })),
      });
    }
  });

  logger.info({ campaignId, total: valid.length }, 'Persisted campaign and email rows in DB');

  // 5. Enqueue delayed jobs into BullMQ
  const enqueueItems = emailRows.map((e) => ({
    id: e.id,
    scheduledAt: e.scheduledAt,
  }));

  const { failedIds } = await enqueueEmails(enqueueItems, 500);

  let queueStatus: 'queued' | 'pending_reconciliation' = 'queued';
  let httpStatus: 201 | 202 = 201;

  if (failedIds.length > 0) {
    logger.warn(
      { failedCount: failedIds.length, campaignId },
      'Some jobs failed bulk enqueue; attempting immediate targeted reconciliation'
    );
    try {
      const { missing } = await targetedReconcileEmails(emailRows.map((e) => e.id));
      if (missing.length > 0) {
        logger.error(
          { missingCount: missing.length, campaignId },
          'Campaign persisted in DB but has jobs pending queue reconciliation'
        );
        queueStatus = 'pending_reconciliation';
        httpStatus = 202;
      }
    } catch (recoveryErr) {
      logger.error(
        { err: recoveryErr, campaignId },
        'Immediate queue recovery failed; campaign remains persisted for boot reconciliation'
      );
      queueStatus = 'pending_reconciliation';
      httpStatus = 202;
    }
  }

  // 6. Index into Elasticsearch (non-blocking)
  void indexEmails(
    emailRows.map((e) => ({
      id: e.id,
      userId: e.userId,
      campaignId: e.campaignId,
      recipient: e.recipient,
      subject: e.subject,
      body: e.body,
      status: e.status,
      senderEmail: e.senderEmail,
      scheduledAt: e.scheduledAt,
    }))
  ).catch((err) => {
    logger.warn({ err, campaignId }, 'Background ES indexing failed for campaign');
  });

  const firstScheduledAt = emailRows[0].scheduledAt.toISOString();
  const lastScheduledAt = emailRows[emailRows.length - 1].scheduledAt.toISOString();

  return {
    status: httpStatus,
    data: {
      campaignId,
      total: valid.length,
      firstScheduledAt,
      lastScheduledAt,
      queueStatus,
      persisted: true,
    },
  };
}
