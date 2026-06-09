import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { SERVICE_TOKEN } from '../../lib/config.js';
import { verifySupabaseJwt } from '../../lib/auth/verify-jwt.js';
import { ensureUserExists } from '../services/ensure-user-exists.js';
import { sendError } from '../lib/http-response.js';

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    let serviceToken: string;
    try {
      serviceToken = SERVICE_TOKEN();
    } catch {
      serviceToken = '';
    }

    if (serviceToken && timingSafeCompare(token, serviceToken)) {
      req.isServiceToken = true;
      return next();
    }

    try {
      const claims = await verifySupabaseJwt(token);
      const user = await ensureUserExists(claims);

      if (user.status !== 'active') {
        sendError(res, 403, 'ACCOUNT_DISABLED', 'Account is disabled');
        return;
      }

      req.auth = user;
      return next();
    } catch {
      sendError(res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
      return;
    }
  }

  sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
}
