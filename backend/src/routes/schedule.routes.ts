import { Router, Request, Response, NextFunction } from 'express';
import { scheduleRequestSchema, scheduleCampaign } from '../services/schedule.service';
import { authMiddleware } from '../middleware/auth';

export const scheduleRouter = Router();

scheduleRouter.post(
  '/',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = scheduleRequestSchema.parse(req.body);
      const user = req.user!;
      const result = await scheduleCampaign(user.id, validated);
      res.status(result.status).json(result.data);
    } catch (err) {
      next(err);
    }
  }
);
