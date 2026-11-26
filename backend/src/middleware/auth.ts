import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.token || req.headers.authorization?.replace(/^Bearer\s+/, '');

  if (!token) {
    logger.warn({ reason: 'missing_token' }, 'Authentication rejected');
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    logger.debug({ reason: 'jwt_verified' }, 'Authentication token verified');
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    if (!user) {
      logger.warn({ reason: 'user_not_found' }, 'Authentication rejected');
      res.status(401).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    const safeError = err as { name?: unknown; code?: unknown };
    logger.warn(
      {
        reason: 'token_or_user_lookup_error',
        errorName: typeof safeError?.name === 'string' ? safeError.name : 'UnknownError',
        errorCode: typeof safeError?.code === 'string' ? safeError.code : undefined,
      },
      'Authentication rejected',
    );
    res.status(401).json({
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired session token' },
    });
  }
}
