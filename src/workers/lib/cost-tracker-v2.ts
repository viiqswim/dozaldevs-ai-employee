import { createLogger } from '../../lib/logger.js';

const log = createLogger('cost-tracker-v2');

interface StepRecord {
  toolName: string | null;
  tokensIn: number;
  tokensOut: number;
}

interface WaveAccumulation {
  tokensIn: number;
  tokensOut: number;
  steps: StepRecord[];
}

/**
 * Per-wave and per-task token usage tracker.
 *
 * Tracks token counts only — NO dollar amounts. NO pricing conversions.
 * Wave numbers are 1-indexed (wave 1, 2, 3...).
 */
export class CostTrackerV2 {
  private waveMap = new Map<number, WaveAccumulation>();

  /**
   * Record token usage for a single tool call/step within a wave.
   */
  recordStep(
    waveNumber: number,
    tokensIn: number,
    tokensOut: number,
    toolName: string | null = null,
  ): void {
    if (!this.waveMap.has(waveNumber)) {
      this.waveMap.set(waveNumber, { tokensIn: 0, tokensOut: 0, steps: [] });
    }
    const wave = this.waveMap.get(waveNumber)!;
    wave.tokensIn += tokensIn;
    wave.tokensOut += tokensOut;
    wave.steps.push({ toolName, tokensIn, tokensOut });

    log.info(
      {
        waveNumber,
        tokensIn,
        tokensOut,
        toolName,
        waveTotalIn: wave.tokensIn,
        waveTotalOut: wave.tokensOut,
      },
      `💰 ${tokensIn}in/${tokensOut}out tokens (wave ${waveNumber})`,
    );
  }

  /**
   * Get accumulated token counts for a specific wave.
   * Returns { tokensIn: 0, tokensOut: 0 } if wave not found.
   */
  getWaveTotals(waveNumber: number): { tokensIn: number; tokensOut: number } {
    const wave = this.waveMap.get(waveNumber);
    if (!wave) return { tokensIn: 0, tokensOut: 0 };
    return { tokensIn: wave.tokensIn, tokensOut: wave.tokensOut };
  }

  /**
   * Get cumulative token counts across ALL waves.
   */
  getTaskTotals(): { tokensIn: number; tokensOut: number } {
    let tokensIn = 0;
    let tokensOut = 0;
    for (const wave of this.waveMap.values()) {
      tokensIn += wave.tokensIn;
      tokensOut += wave.tokensOut;
    }
    return { tokensIn, tokensOut };
  }

  /**
   * Reset all accumulated state.
   */
  reset(): void {
    this.waveMap.clear();
  }
}
