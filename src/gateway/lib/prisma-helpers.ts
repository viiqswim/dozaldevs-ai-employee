/**
 * Shared Prisma error helpers and standard error-code constants for gateway routes.
 */

/**
 * Type guard that checks whether an unknown thrown value is a Prisma error
 * (i.e. has a `code` property, as Prisma's `PrismaClientKnownRequestError` does).
 */
export function isPrismaError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

/**
 * Standard error-code constants used across gateway route handlers.
 * Pass these as the `code` argument to `sendError`.
 */
export const ERROR_CODES = {
  INVALID_ID: 'INVALID_ID',
  INVALID_REQUEST: 'INVALID_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  MISSING_DELIVERY_CONFIG: 'MISSING_DELIVERY_CONFIG',
} as const;
