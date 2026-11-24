import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../db/prisma';

export const senderRouter = Router();

senderRouter.get('/', authMiddleware, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const senders = await prisma.sender.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
        smtpHost: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items: senders });
  } catch (err) {
    next(err);
  }
});
