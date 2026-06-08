import type { Response } from 'express';

/**
 * Sends a standard JSON error response.
 *
 * Response body shape: `{ error: string, message?: string, issues?: ZodIssue[], ...extra }`
 *
 * @param res    - Express response object
 * @param status - HTTP status code (e.g. 400, 404, 500)
 * @param code   - Machine-readable error code string (use `ERROR_CODES` from `prisma-helpers`)
 * @param message - Optional human-readable description
 * @param extra  - Optional additional fields merged into the response body (e.g. `{ issues }`)
 */
export function sendError(
  res: Response,
  status: number,
  code: string,
  message?: string,
  extra?: Record<string, unknown>,
): void {
  res.status(status).json({ error: code, ...(message ? { message } : {}), ...extra });
}
