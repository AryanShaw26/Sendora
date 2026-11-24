import { defaultRedis } from '../redis/connection';
import { utcHourKey } from '../utils/time';
import { logger } from '../config/logger';

const RATE_LIMIT_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then
  return {0, current}
end
current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return {1, current}
`;

export async function tryConsumeSlot(
  senderId: string,
  limit: number
): Promise<{ allowed: boolean; count: number; window: string }> {
  const window = utcHourKey();
  const key = `rate:${senderId}:${window}`;

  try {
    const result = (await defaultRedis.eval(
      RATE_LIMIT_LUA,
      1,
      key,
      limit,
      7200 // 2 hours TTL
    )) as [number, number];

    const [allowed, count] = result;
    return {
      allowed: allowed === 1,
      count,
      window,
    };
  } catch (err) {
    logger.error({ err, senderId, key }, 'Error executing rate limiter Lua script');
    // Fail safe: deny slot to avoid accidental spam
    return { allowed: false, count: limit, window };
  }
}

export async function releaseSlot(senderId: string, window: string): Promise<void> {
  const key = `rate:${senderId}:${window}`;
  try {
    const val = await defaultRedis.decr(key);
    if (val < 0) {
      await defaultRedis.set(key, 0);
    }
  } catch (err) {
    logger.warn({ err, key }, 'Failed to release rate limiter slot');
  }
}

export async function getRateCount(senderId: string, window = utcHourKey()): Promise<number> {
  const key = `rate:${senderId}:${window}`;
  const val = await defaultRedis.get(key);
  return val ? parseInt(val, 10) : 0;
}
