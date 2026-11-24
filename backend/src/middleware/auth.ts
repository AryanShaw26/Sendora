import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';

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
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    if (!user) {
      res.status(401).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired session token' },
    });
  }
}
