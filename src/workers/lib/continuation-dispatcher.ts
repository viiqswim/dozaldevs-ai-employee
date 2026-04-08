import type { LongRunningConfig } from '../config/long-running.js';
import type { SessionManager } from './session-manager.js';
import type { ParsedPlan, ParsedTask } from './plan-parser.js';
import type { Logger } from '../../lib/logger.js';

export interface PlanParserDeps {
  parsePlanFile(content: string): ParsedPlan;
  findNextUncheckedTasks(parsed: ParsedPlan, limit: number): ParsedTask[];
}

export interface ContinuationDispatcherOpts {
  config: LongRunningConfig;
  planParser: PlanParserDeps;
  sessionManager: SessionManager;
  logger: Logger;
}

export interface DispatchContinuationOpts {
  waveNumber: number;
  sessionId: string;
  planContent: string;
  continuationCount: number;
}

export interface DispatchContinuationResult {
  dispatched: boolean;
  reason: string;
}

export class ContinuationDispatcher {
  private readonly config: LongRunningConfig;
  private readonly planParser: PlanParserDeps;
  private readonly sessionManager: SessionManager;
  private readonly logger: Logger;

  constructor(opts: ContinuationDispatcherOpts) {
    this.config = opts.config;
    this.planParser = opts.planParser;
    this.sessionManager = opts.sessionManager;
    this.logger = opts.logger;
  }

  async dispatchContinuation(opts: DispatchContinuationOpts): Promise<DispatchContinuationResult> {
    const { waveNumber, sessionId, planContent, continuationCount } = opts;

    const parsed = this.planParser.parsePlanFile(planContent);

    const wave = parsed.waves.find((w) => w.number === waveNumber);
    if (!wave) {
      this.logger.warn({ waveNumber, sessionId }, 'Wave not found in plan');
      return { dispatched: false, reason: `wave ${waveNumber} not found` };
    }

    const wavePlan: ParsedPlan = {
      waves: [wave],
      totalWaves: 1,
      totalTasks: wave.tasks.length,
      completedTasks: wave.tasks.filter((t) => t.completed).length,
    };

    const nextTasks = this.planParser.findNextUncheckedTasks(wavePlan, 3);

    if (nextTasks.length === 0) {
      this.logger.info({ waveNumber, sessionId }, 'All tasks checked in wave');
      return { dispatched: false, reason: 'all tasks checked' };
    }

    if (continuationCount >= this.config.maxContinuationsPerWave) {
      this.logger.warn(
        { waveNumber, sessionId, continuationCount, max: this.config.maxContinuationsPerWave },
        'Max continuations per wave reached',
      );
      return { dispatched: false, reason: 'max continuations reached' };
    }

    const taskList = nextTasks.map((t) => `- [ ] ${t.number}. ${t.title}`).join('\n');

    const message =
      `The plan file shows these tasks are still unchecked in Wave ${waveNumber}:\n` +
      `${taskList}\n\n` +
      `Please continue working through them. Mark each with [x] when complete. ` +
      `When all tasks in this wave are checked, stop.`;

    const sent = await this.sessionManager.injectTaskPrompt(sessionId, message);

    if (!sent) {
      this.logger.error({ waveNumber, sessionId }, 'Failed to inject continuation prompt');
      return { dispatched: false, reason: 'failed to inject prompt' };
    }

    this.logger.info(
      { waveNumber, sessionId, continuationCount, taskCount: nextTasks.length },
      'Continuation dispatched',
    );

    return { dispatched: true, reason: `sent ${nextTasks.length} tasks` };
  }
}
