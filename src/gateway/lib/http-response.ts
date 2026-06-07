import type { Response } from 'express';

export function sendError(
  res: Response,
  status: number,
  code: string,
  message?: string,
  extra?: Record<string, unknown>,
): void {
  res.status(status).json({ error: code, ...(message ? { message } : {}), ...extra });
}
