import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './db/prisma';
import { defaultRedis } from './redis/connection';
import { ensureIndex } from './services/search.service';

async function start() {
  const app = createApp();

  // Ensure Elasticsearch index exists on boot
  await ensureIndex();

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 API server running on ${env.BACKEND_URL} (Port ${env.PORT})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await prisma.$disconnect();
        logger.info('Prisma disconnected');
        await defaultRedis.quit();
        logger.info('Redis connection closed');
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
      }
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forcefully exiting after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start API server');
  process.exit(1);
});
