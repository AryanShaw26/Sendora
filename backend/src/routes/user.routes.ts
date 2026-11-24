import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

export const userRouter = Router();

userRouter.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json(req.user);
});
