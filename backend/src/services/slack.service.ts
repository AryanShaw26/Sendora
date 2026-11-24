import axios from 'axios';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { defaultRedis } from '../redis/connection';
import { logger } from '../config/logger';
import { encrypt, decrypt } from './crypto.service';

export interface RateLimitNotificationParams {
  userId: string;
  senderEmail: string;
  senderId: string;
  window: string;
  limit: number;
  nextWindow: Date;
}

export function getSlackAuthorizeUrl(userId: string): string {
  const state = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'incoming-webhook',
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function handleSlackOAuthCallback(code: string, state: string): Promise<string> {
  let userId: string;
  try {
    const decoded = jwt.verify(state, env.JWT_SECRET) as { userId: string };
    userId = decoded.userId;
  } catch (err) {
    throw new Error('Invalid or expired state in Slack OAuth callback');
  }

  const response = await axios.post(
    'https://slack.com/api/oauth.v2.access',
    new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  );

  const data = response.data;
  if (!data.ok || !data.incoming_webhook?.url) {
    throw new Error(data.error || 'Slack OAuth access token request failed');
  }

  const webhookUrlEnc = encrypt(data.incoming_webhook.url);

  await prisma.slackIntegration.upsert({
    where: { userId },
    update: {
      teamId: data.team?.id || null,
      teamName: data.team?.name || null,
      channelName: data.incoming_webhook?.channel || null,
      webhookUrlEnc,
    },
    create: {
      userId,
      teamId: data.team?.id || null,
      teamName: data.team?.name || null,
      channelName: data.incoming_webhook?.channel || null,
      webhookUrlEnc,
    },
  });

  logger.info({ userId, team: data.team?.name }, 'Slack integration successfully connected');
  return userId;
}

export async function getSlackStatus(
  userId: string
): Promise<{ connected: boolean; teamName?: string | null; channelName?: string | null }> {
  const integration = await prisma.slackIntegration.findUnique({
    where: { userId },
  });

  if (!integration) {
    return { connected: false };
  }

  return {
    connected: true,
    teamName: integration.teamName,
    channelName: integration.channelName,
  };
}

export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackIntegration.deleteMany({
    where: { userId },
  });
  logger.info({ userId }, 'Slack integration disconnected');
}

export async function sendTestSlackMessage(userId: string): Promise<void> {
  const integration = await prisma.slackIntegration.findUnique({
    where: { userId },
  });

  if (!integration) {
    const err = new Error('No Slack integration found for user');
    (err as any).status = 404;
    throw err;
  }

  const webhookUrl = decrypt(integration.webhookUrlEnc);
  await axios.post(
    webhookUrl,
    {
      text: '🚀 *Sendora Test Alert:* Your Slack integration is successfully connected and receiving rate limit alerts!',
    },
    { timeout: 5000 }
  );
}

export async function notifyRateLimitHit(
  params: RateLimitNotificationParams
): Promise<void> {
  // 1. Look up active Slack integration for the email's owner
  const integration = await prisma.slackIntegration.findUnique({
    where: { userId: params.userId },
  });

  if (!integration) {
    // User does not have Slack connected; skip silently without setting dedupe keys
    return;
  }

  const dedupeKey = `slack:notified:${params.senderId}:${params.window}`;
  const lockKey = `slack:notify-lock:${params.senderId}:${params.window}`;

  // 2. Check if already successfully notified in this window
  const alreadyNotified = await defaultRedis.get(dedupeKey);
  if (alreadyNotified) {
    return;
  }

  // 3. Acquire short-lived in-flight lock (30s)
  const acquiredLock = await defaultRedis.set(lockKey, '1', 'PX', 30000, 'NX');
  if (acquiredLock !== 'OK') {
    return;
  }

  let success = false;
  try {
    const webhookUrl = decrypt(integration.webhookUrlEnc);
    const windowHour = `${params.window.slice(8, 10)}:00 UTC`;
    const nextWindowStr = `${params.nextWindow.toISOString().slice(11, 16)} UTC`;

    const messageText =
      `⚠️ *Hourly email limit reached*\n` +
      `Sender \`${params.senderEmail}\` hit \`${params.limit}/hour\` at \`${windowHour}\`.\n` +
      `Remaining emails are rescheduled to the next window (\`${nextWindowStr}\`).`;

    await axios.post(
      webhookUrl,
      { text: messageText },
      { timeout: 5000 }
    );

    // 4. Mark successfully notified with 2-hour TTL only after Slack confirms success
    await defaultRedis.set(dedupeKey, '1', 'EX', 7200);
    success = true;
    logger.info(
      { sender: params.senderEmail, window: params.window },
      'Slack rate limit notification successfully dispatched'
    );
  } catch (err) {
    logger.error({ err, sender: params.senderEmail }, 'Failed to dispatch Slack alert webhook');
  } finally {
    if (!success) {
      // Clear in-flight lock so a subsequent rate-limit event can retry
      await defaultRedis.del(lockKey);
    }
  }
}
