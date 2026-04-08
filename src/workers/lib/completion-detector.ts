import type { SessionManager } from './session-manager.js';
import type { LongRunningConfig } from '../config/long-running.js';

export interface Logger {
  step(emoji: string, message: string, extras?: Record<string, unknown>): void;
  info(obj: Record<string, unknown>, message: string): void;
  warn(obj: Record<string, unknown>, message: string): void;
  error(obj: Record<string, unknown>, message: string): void;
}

export interface CompletionResult {
  outcome: 'completed' | 'idle' | 'timeout' | 'error';
  reason: string;
  idleCount: number;
}

export interface WaitForCompletionOpts {
  sessionId: string;
  waveNumber: number;
  timeoutMs: number;
}

const SSE_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_TIMEOUT_MS = 30_000;
const CONSECUTIVE_IDLE_POLLS_THRESHOLD = 3;

export class CompletionDetector {
  private readonly sessionManager: SessionManager;
  private readonly logger: Logger;
  private readonly _config: LongRunningConfig;

  constructor(opts: { sessionManager: SessionManager; logger: Logger; config: LongRunningConfig }) {
    this.sessionManager = opts.sessionManager;
    this.logger = opts.logger;
    this._config = opts.config;
  }

  async waitForCompletion(opts: WaitForCompletionOpts): Promise<CompletionResult> {
    const { sessionId, waveNumber, timeoutMs } = opts;
    const startTime = Date.now();

    this.logger.step('📡', 'SSE monitoring started', { sessionId, waveNumber });

    let sseResult: Awaited<ReturnType<SessionManager['monitorSession']>>;
    try {
      sseResult = await this.sessionManager.monitorSession(sessionId, {
        timeoutMs: SSE_TIMEOUT_MS,
        minElapsedMs: 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({ sessionId, waveNumber, error: msg }, '❌ SSE monitoring error');
      return { outcome: 'error', reason: `SSE error: ${msg}`, idleCount: 0 };
    }

    if (sseResult.completed) {
      this.logger.step('✅', 'completed', {
        sessionId,
        waveNumber,
        reason: 'SSE completion signal',
      });
      return { outcome: 'completed', reason: 'SSE completion signal', idleCount: 0 };
    }

    this.logger.step('🔄', 'polling fallback activated', {
      sessionId,
      waveNumber,
      sseReason: sseResult.reason,
    });

    let idleCount = 0;

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        this.logger.step('⏱️', 'timeout', { sessionId, waveNumber, elapsedMs: elapsed, timeoutMs });
        return {
          outcome: 'timeout',
          reason: `Total timeout exceeded (${elapsed}ms > ${timeoutMs}ms)`,
          idleCount,
        };
      }

      let pollResult: Awaited<ReturnType<SessionManager['monitorSession']>>;
      try {
        pollResult = await this.sessionManager.monitorSession(sessionId, {
          timeoutMs: POLL_TIMEOUT_MS,
          minElapsedMs: 0,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error({ sessionId, waveNumber, error: msg }, '❌ polling error');
        return { outcome: 'error', reason: `Poll error: ${msg}`, idleCount };
      }

      if (pollResult.completed) {
        this.logger.step('✅', 'completed', {
          sessionId,
          waveNumber,
          reason: 'poll completion signal',
        });
        return { outcome: 'completed', reason: 'Poll completion signal', idleCount: 0 };
      }

      if (pollResult.reason === 'error') {
        this.logger.error(
          { sessionId, waveNumber, pollReason: pollResult.reason },
          '❌ poll returned error reason',
        );
        return { outcome: 'error', reason: 'Poll returned error reason', idleCount };
      }

      idleCount++;

      if (idleCount >= CONSECUTIVE_IDLE_POLLS_THRESHOLD) {
        this.logger.step('💤', 'idle detected', { sessionId, waveNumber, idleCount });
        return {
          outcome: 'idle',
          reason: '3 consecutive idle polls',
          idleCount: CONSECUTIVE_IDLE_POLLS_THRESHOLD,
        };
      }

      const elapsedAfterPoll = Date.now() - startTime;
      if (elapsedAfterPoll >= timeoutMs) {
        this.logger.step('⏱️', 'timeout', {
          sessionId,
          waveNumber,
          elapsedMs: elapsedAfterPoll,
          timeoutMs,
        });
        return {
          outcome: 'timeout',
          reason: `Total timeout exceeded (${elapsedAfterPoll}ms > ${timeoutMs}ms)`,
          idleCount,
        };
      }
    }
  }
}
