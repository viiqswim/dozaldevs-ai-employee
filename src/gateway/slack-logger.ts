import { LogLevel } from '@slack/bolt';
import type { Logger } from '@slack/bolt';
import type { Logger as PinoLogger } from 'pino';

/**
 * Heartbeat warning prefixes emitted by Slack's SocketModeClient.
 * These are harmless reconnect triggers — demote to debug to reduce log noise.
 */
const HEARTBEAT_WARN_PREFIXES = [
  "A pong wasn't received from the server",
  "A ping wasn't received from the server",
] as const;

function isHeartbeatWarn(msg: unknown): boolean {
  if (typeof msg !== 'string') return false;
  return HEARTBEAT_WARN_PREFIXES.some((prefix) => msg.startsWith(prefix));
}

/**
 * Creates a Bolt-compatible Logger that wraps a pino logger.
 * Demotes Slack Socket Mode heartbeat WARN messages to debug level.
 * All other log levels (including error) are forwarded unmodified.
 */
export function createFilteredBoltLogger(pinoLogger: PinoLogger): Logger {
  return {
    debug(...msgs: unknown[]): void {
      pinoLogger.debug(msgs);
    },
    info(...msgs: unknown[]): void {
      pinoLogger.info(msgs);
    },
    warn(...msgs: unknown[]): void {
      if (isHeartbeatWarn(msgs[0])) {
        pinoLogger.debug(msgs);
      } else {
        pinoLogger.warn(msgs);
      }
    },
    error(...msgs: unknown[]): void {
      pinoLogger.error(msgs);
    },
    setLevel(_level: LogLevel): void {
      // no-op: log level is controlled by pino via LOG_LEVEL env var
    },
    getLevel(): LogLevel {
      return LogLevel.INFO;
    },
    setName(_name: string): void {
      // no-op: pino logger is shared and named at creation time
    },
  };
}
