import { defaultRedis } from '../redis/connection';
import { env } from '../config/env';

export async function acquireSendStartSlot(
  senderId: string
): Promise<{ acquired: true } | { acquired: false; waitMs: number }> {
  const key = `sendlock:${senderId}`;
  const ok = await defaultRedis.set(
    key,
    '1',
    'PX',
    env.MIN_DELAY_BETWEEN_EMAILS_MS,
    'NX'
  );

  if (ok === 'OK') {
    return { acquired: true };
  }

  const ttl = await defaultRedis.pttl(key);
  return { acquired: false, waitMs: Math.max(ttl, 50) };
}
