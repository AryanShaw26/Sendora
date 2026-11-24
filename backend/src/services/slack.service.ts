import { logger } from '../config/logger';

export interface RateLimitNotificationParams {
  userId: string;
  senderEmail: string;
  senderId: string;
  window: string;
  limit: number;
  nextWindow: Date;
}

// Full Slack OAuth & webhook implementation is wired in Phase 7
export async function notifyRateLimitHit(
  params: RateLimitNotificationParams
): Promise<void> {
  logger.info(
    { sender: params.senderEmail, window: params.window, limit: params.limit },
    'Rate limit alert triggered (full Slack webhook dispatch configured in Phase 7)'
  );
}
