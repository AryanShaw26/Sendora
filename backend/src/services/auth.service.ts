import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';

export const googleOAuthClient = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
);

export function signUserToken(userId: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
}

export function getGoogleAuthUrl(state: string): string {
  return googleOAuthClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
}

export async function handleGoogleCallback(
  code: string
): Promise<{ token: string; user: { id: string; email: string; name: string; avatarUrl: string | null } }> {
  const { tokens } = await googleOAuthClient.getToken(code);
  if (!tokens.id_token) {
    throw new Error('Google did not return an ID token');
  }

  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.sub) {
    throw new Error('Google ID token missing essential claims (email or sub)');
  }

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();
  const name = payload.name || payload.email.split('@')[0];
  const avatarUrl = payload.picture || null;

  const user = await prisma.user.upsert({
    where: { googleId },
    update: { email, name, avatarUrl },
    create: {
      googleId,
      email,
      name,
      avatarUrl,
    },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });

  const token = signUserToken(user.id);
  logger.info({ userId: user.id, email: user.email }, 'User authenticated via Google OAuth');
  return { token, user };
}

// Development helper to create/login a local test user when Google credentials are not set
export async function getOrCreateDevUser(): Promise<{ token: string; user: { id: string; email: string; name: string; avatarUrl: string | null } }> {
  const devEmail = 'demo.user@sendora.local';
  const user = await prisma.user.upsert({
    where: { email: devEmail },
    update: {},
    create: {
      googleId: 'dev-google-id',
      email: devEmail,
      name: 'Sendora Demo User',
      avatarUrl: 'https://lh3.googleusercontent.com/a/default-user',
    },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });

  const token = signUserToken(user.id);
  return { token, user };
}
