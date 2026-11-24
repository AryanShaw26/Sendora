import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

prisma.$on('warn' as never, (e: { message: string }) => {
  logger.warn(e.message);
});

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error(e.message);
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
