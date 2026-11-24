import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getSlackAuthorizeUrl,
  handleSlackOAuthCallback,
  getSlackStatus,
  disconnectSlack,
  sendTestSlackMessage,
} from '../services/slack.service';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const slackRouter = Router();

// Connect: returns authorize URL
slackRouter.get('/connect', authMiddleware, (req: Request, res: Response) => {
  const url = getSlackAuthorizeUrl(req.user!.id);
  res.json({ url });
});

// Callback: unauthenticated, identity verified from state JWT
slackRouter.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error } = req.query;

  if (error || !code || !state) {
    logger.warn({ error }, 'Slack OAuth callback reported error or missing parameters');
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=error`);
    return;
  }

  try {
    await handleSlackOAuthCallback(code as string, state as string);
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (err) {
    logger.error({ err }, 'Failed to exchange Slack OAuth code');
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=error`);
  }
});

// Status
slackRouter.get('/status', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await getSlackStatus(req.user!.id);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// Disconnect
slackRouter.delete('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await disconnectSlack(req.user!.id);
    res.json({ success: true, message: 'Slack integration disconnected' });
  } catch (err) {
    next(err);
  }
});

// Send test message
slackRouter.post('/test', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sendTestSlackMessage(req.user!.id);
    res.json({ success: true, message: 'Test Slack alert sent successfully' });
  } catch (err) {
    next(err);
  }
});
