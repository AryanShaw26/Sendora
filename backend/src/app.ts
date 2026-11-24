import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './db/prisma';
import { defaultRedis } from './redis/connection';
import { pingElasticsearch } from './services/search.service';

export function createApp(): express.Application {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows bull board assets
    })
  );

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    })
  );

  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  // Health check endpoint
  app.get('/health', async (_req: Request, res: Response) => {
    let dbOk = false;
    let redisOk = false;
    let esOk = false;

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      logger.warn({ err }, 'Health check: DB failed');
    }

    try {
      const pong = await defaultRedis.ping();
      redisOk = pong === 'PONG';
    } catch (err) {
      logger.warn({ err }, 'Health check: Redis failed');
    }

    try {
      esOk = await pingElasticsearch();
    } catch (err) {
      logger.warn({ err }, 'Health check: ES failed');
    }

    const allOk = dbOk && redisOk && esOk;
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      db: dbOk ? 'up' : 'down',
      redis: redisOk ? 'up' : 'down',
      elasticsearch: esOk ? 'up' : 'down',
    });
  });

  // Central error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        },
      });
      return;
    }

    if (err && typeof err === 'object' && 'status' in err && typeof (err as { status: number }).status === 'number') {
      const status = (err as { status: number }).status;
      const message = (err as { message?: string }).message || 'Error';
      const code = (err as { code?: string }).code || 'ERROR';
      res.status(status).json({ error: { code, message } });
      return;
    }

    const message = err instanceof Error ? err.message : 'Internal Server Error';
    logger.error({ err }, 'Unhandled application error');
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: env.NODE_ENV === 'production' ? 'Internal server error' : message,
      },
    });
  });

  return app;
}
