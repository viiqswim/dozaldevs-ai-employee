import pino from 'pino';

// Re-export pino Logger type for consumers
export type Logger = pino.Logger;

/**
 * Creates a pino logger bound to a component.
 * Every log line includes: timestamp (ISO), level, component.
 */
export function createLogger(component: string): pino.Logger {
  return pino({
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        '*.GITHUB_TOKEN',
        '*.JIRA_TOKEN',
        '*.ADMIN_API_KEY',
        '*.*_TOKEN',
        '*.*_SECRET',
        '*.*_KEY',
        '*.*_PASSWORD',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      error: pino.stdSerializers.err,
    },
  }).child({ component });
}

/**
 * Creates a child logger with taskId bound.
 * Every log line includes: timestamp, level, component, taskId.
 */
export function taskLogger(component: string, taskId: string): pino.Logger {
  return createLogger(component).child({ taskId });
}

/**
 * Log a progress step with an emoji prefix.
 * Format: {emoji} {message}
 * Does NOT log dollar amounts — tokens only.
 */
export function logStep(
  logger: pino.Logger,
  emoji: string,
  message: string,
  extras?: Record<string, unknown>,
): void {
  logger.info({ ...extras, emoji }, `${emoji} ${message}`);
}

/**
 * Log a tool invocation with duration and status.
 * Format: 🔧 {name} ({durationMs}ms) or ❌ {name} ({durationMs}ms)
 */
export function logTool(
  logger: pino.Logger,
  name: string,
  durationMs: number,
  status: 'ok' | 'error',
  extras?: Record<string, unknown>,
): void {
  const icon = status === 'ok' ? '🔧' : '❌';
  logger.info({ ...extras, tool: name, durationMs, status }, `${icon} ${name} (${durationMs}ms)`);
}

/**
 * Log token usage — tokens only, NEVER dollar amounts.
 * Format: 💰 {tokensIn}in/{tokensOut}out tokens
 */
export function logCost(
  logger: pino.Logger,
  tokensIn: number,
  tokensOut: number,
  extras?: Record<string, unknown>,
): void {
  logger.info({ ...extras, tokensIn, tokensOut }, `💰 ${tokensIn}in/${tokensOut}out tokens`);
}

/**
 * Log step timing completion.
 * Format: TIMING: {label} completed in {elapsedMs}ms (total: {totalMs}ms)
 */
export function logTiming(
  logger: pino.Logger,
  label: string,
  elapsedMs: number,
  totalMs: number,
): void {
  logger.info(
    { label, elapsedMs, totalMs },
    `TIMING: ${label} completed in ${elapsedMs}ms (total: ${totalMs}ms)`,
  );
}
