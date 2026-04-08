import type { Logger } from '../../lib/logger.js';
import { createLogger } from '../../lib/logger.js';
import type { SessionManager } from './session-manager.js';
import type { LongRunningConfig, WaveState, WaveStateArray } from '../config/long-running.js';
import type { ParsedWave, ParsedPlan, ParsedTask } from './plan-parser.js';
import type { CostTrackerV2 } from './cost-tracker-v2.js';

const log = createLogger('wave-executor');

const WAVE_TIMEOUT_MS = 90 * 60 * 1000;

export interface PlanParserInterface {
  parsePlanFile: (filePath: string) => Promise<ParsedPlan>;
  findNextUncheckedTasks: (wave: ParsedWave) => ParsedTask[];
}

export interface WaveExecutorOptions {
  sessionManager: SessionManager;
  config: LongRunningConfig;
  planParser: PlanParserInterface;
  costTracker: CostTrackerV2;
  logger: Logger;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heartbeat: any;
  planFilePath?: string;
  onWaveStart?: (waveNumber: number) => void;
  onWaveComplete?: (waveState: WaveState) => void;
}

export class WaveExecutor {
  private readonly sessionManager: SessionManager;
  private readonly config: LongRunningConfig;
  private readonly planParser: PlanParserInterface;
  private readonly costTracker: CostTrackerV2;
  private readonly log: Logger;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly heartbeat: any;
  private readonly planFilePath: string;
  private readonly onWaveStart?: (waveNumber: number) => void;
  private readonly onWaveComplete?: (waveState: WaveState) => void;

  constructor(opts: WaveExecutorOptions) {
    this.sessionManager = opts.sessionManager;
    this.config = opts.config;
    this.planParser = opts.planParser;
    this.costTracker = opts.costTracker;
    this.log = opts.logger;
    this.heartbeat = opts.heartbeat;
    this.planFilePath = opts.planFilePath ?? '/workspace/PLAN.md';
    this.onWaveStart = opts.onWaveStart;
    this.onWaveComplete = opts.onWaveComplete;
  }

  async executeWave(wave: ParsedWave, _previousState: WaveStateArray): Promise<WaveState> {
    const startedAt = new Date().toISOString();

    this.log.info({ waveNumber: wave.number }, `🌊 Starting wave ${wave.number}`);
    this.onWaveStart?.(wave.number);

    const sessionId = await this.sessionManager.createSession(`Wave ${wave.number}`);

    if (!sessionId) {
      const waveState: WaveState = {
        number: wave.number,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'failed',
        error: `Failed to create OpenCode session for wave ${wave.number}`,
      };
      this.log.error({ waveNumber: wave.number }, waveState.error!);
      this.onWaveComplete?.(waveState);
      return waveState;
    }

    this.log.info(
      { waveNumber: wave.number, sessionId },
      `Session created for wave ${wave.number}`,
    );

    const taskList = wave.tasks.map((t) => `- ${t.number}. ${t.title}`).join('\n');
    const prompt = [
      `You are working on Wave ${wave.number}.`,
      `Tasks in this wave:`,
      taskList,
      ``,
      `Work through each task. Mark each with [x] in the plan file when complete.`,
      `When all tasks in this wave are checked, stop.`,
    ].join('\n');

    const injected = await this.sessionManager.injectTaskPrompt(sessionId, prompt);
    if (!injected) {
      this.log.warn(
        { waveNumber: wave.number, sessionId },
        `Failed to inject prompt into session — continuing to monitor anyway`,
      );
    }

    const monitorResult = await this.sessionManager.monitorSession(sessionId, {
      timeoutMs: WAVE_TIMEOUT_MS,
    });

    if (!monitorResult.completed) {
      const waveState: WaveState = {
        number: wave.number,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'failed',
        error: 'wave timeout after 90 minutes',
      };
      this.log.error(
        { waveNumber: wave.number, sessionId, reason: monitorResult.reason },
        `Wave ${wave.number} timed out`,
      );
      this.onWaveComplete?.(waveState);
      return waveState;
    }

    let allTasksCompleted = false;
    try {
      const freshPlan = await this.planParser.parsePlanFile(this.planFilePath);
      const freshWave = freshPlan.waves.find((w) => w.number === wave.number);
      if (freshWave) {
        allTasksCompleted = freshWave.tasks.every((t) => t.completed);
      } else {
        this.log.warn(
          { waveNumber: wave.number },
          `Wave ${wave.number} not found in re-read plan file`,
        );
      }
    } catch (err) {
      this.log.warn(
        {
          waveNumber: wave.number,
          error: err instanceof Error ? err.message : String(err),
        },
        `Failed to re-read plan file after wave ${wave.number} — marking wave as failed`,
      );
    }

    const status: WaveState['status'] = allTasksCompleted ? 'completed' : 'failed';
    const error = allTasksCompleted
      ? null
      : `Not all tasks in wave ${wave.number} were marked complete`;

    const waveState: WaveState = {
      number: wave.number,
      startedAt,
      completedAt: new Date().toISOString(),
      status,
      error,
    };

    if (status === 'completed') {
      this.log.info({ waveNumber: wave.number }, `✅ Wave ${wave.number} completed`);
    } else {
      this.log.error({ waveNumber: wave.number, error }, `❌ Wave ${wave.number} failed`);
    }

    this.onWaveComplete?.(waveState);
    return waveState;
  }
}

export interface RunAllWavesOptions {
  plan: ParsedPlan;
  executor: WaveExecutor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  installRunner: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  costBreaker: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  betweenWavePush: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  planSync: any;
  logger: Logger;
}

export async function runAllWaves(opts: RunAllWavesOptions): Promise<WaveStateArray> {
  const { plan, executor, installRunner, costBreaker, betweenWavePush, planSync, logger } = opts;

  const waveStates: WaveState[] = [];

  for (const wave of plan.waves) {
    if (wave.number > 1) {
      const breakResult = costBreaker.shouldStop(wave.number) as { stop: boolean };
      if (breakResult.stop) {
        logger.warn(
          { waveNumber: wave.number },
          `💰 Cost breaker triggered before wave ${wave.number} — halting`,
        );
        break;
      }
    }

    const currentState: WaveStateArray = { waves: waveStates };
    const waveResult = await executor.executeWave(wave, currentState);
    waveStates.push(waveResult);

    if (waveResult.status === 'failed') {
      logger.error(
        { waveNumber: wave.number, error: waveResult.error },
        `Wave ${wave.number} failed — stopping all waves`,
      );
      break;
    }

    await installRunner.checkAndRunIfChanged();
    await betweenWavePush();
    await planSync.updateWaveState({ waves: waveStates });
  }

  return { waves: waveStates };
}

export { log as waveExecutorLogger };
