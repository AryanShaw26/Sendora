import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { searchEmails } from '../services/search.service';
import { logger } from '../config/logger';
import { Prisma } from '@prisma/client';

export const emailRouter = Router();

emailRouter.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const statusParam = req.query.status as string;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
    const campaignId = req.query.campaignId as string | undefined;

    if (!statusParam || (statusParam !== 'scheduled' && statusParam !== 'sent')) {
      res.status(400).json({
        error: { code: 'INVALID_STATUS', message: "Query parameter 'status' must be 'scheduled' or 'sent'" },
      });
      return;
    }

    const userId = req.user!.id;
    const whereCondition: Prisma.EmailWhereInput = { userId };
    if (campaignId) {
      whereCondition.campaignId = campaignId;
    }

    let orderBy: Prisma.EmailOrderByWithRelationInput | Prisma.EmailOrderByWithRelationInput[] =
      { createdAt: 'desc' };
    if (statusParam === 'scheduled') {
      whereCondition.status = { in: ['scheduled', 'processing'] };
      orderBy = { scheduledAt: 'asc' };
    } else {
      whereCondition.status = { in: ['sent', 'failed'] };
      orderBy = [{ sentAt: 'desc' }, { updatedAt: 'desc' }];
    }

    const [total, rows] = await Promise.all([
      prisma.email.count({ where: whereCondition }),
      prisma.email.findMany({
        where: whereCondition,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sender: { select: { email: true } },
        },
      }),
    ]);

    const items = rows.map((e) => ({
      id: e.id,
      campaignId: e.campaignId,
      recipient: e.recipient,
      subject: e.subject,
      status: e.status,
      scheduledAt: e.scheduledAt.toISOString(),
      sentAt: e.sentAt ? e.sentAt.toISOString() : null,
      senderEmail: e.sender.email,
      previewUrl: e.previewUrl,
      errorMessage: e.errorMessage,
      deferredCount: e.deferredCount,
    }));

    res.json({
      items,
      page,
      limit,
      total,
    });
  } catch (err) {
    next(err);
  }
});

emailRouter.get('/search', authMiddleware, async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const q = (req.query.q as string) || '';
  if (!q.trim()) {
    res.status(400).json({
      error: { code: 'MISSING_QUERY', message: "Search parameter 'q' is required" },
    });
    return;
  }

  const status = req.query.status as string | undefined;
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));

  try {
    const results = await searchEmails({
      userId: req.user!.id,
      q,
      status,
      page,
      limit,
    });
    res.json(results);
  } catch (err) {
    logger.error({ err, q }, 'Elasticsearch search error');
    res.status(503).json({
      error: {
        code: 'SEARCH_UNAVAILABLE',
        message: 'Search is temporarily unavailable.',
      },
    });
  }
});
