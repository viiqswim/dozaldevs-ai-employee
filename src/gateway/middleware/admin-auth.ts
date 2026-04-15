import crypto from 'node:crypto';
import pino from 'pino';
import type { RequestHandler } from 'express';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export const requireAdminKey: RequestHandler = (req, res, next) => {
  const provided = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_API_KEY ?? '';

  // Reject if header is missing, not a string, or empty
  if (typeof provided !== 'string' || provided.length === 0) {
    logger.warn({ url: req.url }, 'Admin auth failed');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expectedKey, 'utf8');

  // Length check FIRST — timingSafeEqual throws on unequal buffer lengths
  if (providedBuf.length !== expectedBuf.length) {
    logger.warn({ url: req.url }, 'Admin auth failed');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Timing-safe comparison
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    logger.warn({ url: req.url }, 'Admin auth failed');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};
