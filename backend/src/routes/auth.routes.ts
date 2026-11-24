import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  getGoogleAuthUrl,
  handleGoogleCallback,
  getOrCreateDevUser,
} from '../services/auth.service';

export const authRouter = Router();

authRouter.get('/google', (_req: Request, res: Response) => {
  // If Google client credentials are blank or mock, provide fallback for dev demo
  if (
    !env.GOOGLE_CLIENT_ID ||
    env.GOOGLE_CLIENT_ID === 'mock-google-client-id' ||
    env.GOOGLE_CLIENT_ID === ''
  ) {
    logger.info('GOOGLE_CLIENT_ID is unset or mock; redirecting to dev auto-login for testing');
    res.redirect('/auth/dev-login');
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  const url = getGoogleAuthUrl(state);
  res.redirect(url);
});

authRouter.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error } = req.query;
  const cookieState = req.cookies?.oauth_state;

  if (error || !code || !state || state !== cookieState) {
    logger.warn({ error, stateMismatch: state !== cookieState }, 'Google OAuth callback failure');
    res.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
    return;
  }

  try {
    res.clearCookie('oauth_state');
    const { token } = await handleGoogleCallback(code as string);

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.COOKIE_SECURE,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    logger.error({ err }, 'Exception in Google OAuth token exchange');
    res.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
  }
});

// Dev login route when running without live Google client credentials
authRouter.get('/dev-login', async (_req: Request, res: Response) => {
  try {
    const { token } = await getOrCreateDevUser();
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.COOKIE_SECURE,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    logger.error({ err }, 'Dev login failure');
    res.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
  }
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
  });
  res.json({ success: true, message: 'Logged out successfully' });
});
