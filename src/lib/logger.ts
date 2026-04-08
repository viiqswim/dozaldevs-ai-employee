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
