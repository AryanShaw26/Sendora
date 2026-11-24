import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../db/prisma';

export const campaignRouter = Router();

campaignRouter.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;

    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        emails: {
          select: { status: true },
        },
      },
    });

    const items = campaigns.map((c) => {
      const counts = {
        scheduled: 0,
        processing: 0,
        sent: 0,
        failed: 0,
      };

      for (const e of c.emails) {
        if (e.status in counts) {
          counts[e.status as keyof typeof counts]++;
        }
      }

      return {
        id: c.id,
        subject: c.subject,
        body: c.body,
        startTime: c.startTime.toISOString(),
        delaySeconds: c.delaySeconds,
        hourlyLimit: c.hourlyLimit,
        totalEmails: c.totalEmails,
        createdAt: c.createdAt.toISOString(),
        counts,
      };
    });

    res.json({ items });
  } catch (err) {
    next(err);
  }
});
