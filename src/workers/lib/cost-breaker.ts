import { LongRunningConfig } from '../config/long-running.js';
import { CostTrackerV2 } from './cost-tracker-v2.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('cost-breaker');

export interface CostBreakerResult {
  stop: boolean;
  reason: string;
  totals: {
    tokensIn: number;
    tokensOut: number;
  };
}

/**
 * Per-task cost circuit breaker — stops waves when token usage exceeds cap.
 *
 * Wave 1 is always allowed (baseline). Subsequent waves check cumulative token totals.
 */
export class CostBreaker {
  private config: LongRunningConfig;
  private costTracker: CostTrackerV2;

  constructor(opts: {
    config: LongRunningConfig;
    costTracker: CostTrackerV2;
    logger?: ReturnType<typeof createLogger>;
  }) {
    this.config = opts.config;
    this.costTracker = opts.costTracker;
  }

  /**
   * Check if a wave should be stopped due to cost limits.
   *
   * @param waveNumber - Wave number (1-indexed)
   * @returns CostBreakerResult with stop decision, reason, and token totals
   */
  shouldStop(waveNumber: number): CostBreakerResult {
    // Wave 1 is always allowed (baseline, no prior cost)
    if (waveNumber === 1) {
      return {
        stop: false,
        reason: 'wave 1 baseline',
        totals: { tokensIn: 0, tokensOut: 0 },
      };
    }

    // Get cumulative token totals across all waves
    const totals = this.costTracker.getTaskTotals();
    const totalTokens = totals.tokensIn + totals.tokensOut;

    // Check if total exceeds cap
    if (totalTokens > this.config.costBreakerTokenCap) {
      const reason = `token cap exceeded: ${totalTokens} > ${this.config.costBreakerTokenCap}`;
      log.warn({ waveNumber, totalTokens, cap: this.config.costBreakerTokenCap }, reason);
      return {
        stop: true,
        reason,
        totals,
      };
    }

    // Within cap, continue
    return {
      stop: false,
      reason: 'within token cap',
      totals,
    };
  }
}
