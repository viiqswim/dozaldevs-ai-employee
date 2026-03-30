import type { PostgRESTClient } from './postgrest-client.js';
import type { HeartbeatHandle } from './heartbeat.js';
import type { SessionManager } from './session-manager.js';
import type { ToolingConfig } from './task-context.js';
import type { ValidationStage } from './validation-pipeline.js';
import { runValidationPipeline } from './validation-pipeline.js';
import { escalate } from './heartbeat.js';

const PER_STAGE_LIMIT = 3;
const GLOBAL_LIMIT = 10;

export interface FixLoopOptions {
  sessionId: string;
  sessionManager: SessionManager;
  executionId: string | null;
  toolingConfig: ToolingConfig;
  postgrestClient: PostgRESTClient;
  heartbeat: HeartbeatHandle;
  taskId: string;
}

export interface FixLoopResult {
  success: boolean;
  reason?: string;
  failedStage?: ValidationStage;
  totalIterations: number;
}

export async function runWithFixLoop(options: FixLoopOptions): Promise<FixLoopResult> {
  const {
    sessionId,
    sessionManager,
    executionId,
    toolingConfig,
    postgrestClient,
    heartbeat,
    taskId,
  } = options;

  let totalFixIterations = 0;
  const perStageCount = new Map<ValidationStage, number>();

  async function incrementAndPersistIterations(): Promise<void> {
    totalFixIterations++;
    if (executionId) {
      await postgrestClient.patch('executions', `id=eq.${executionId}`, {
        fix_iterations: totalFixIterations,
        updated_at: new Date().toISOString(),
      });
    }
  }

  let startStage: ValidationStage | undefined = undefined;

  while (true) {
    const pipelineResult = await runValidationPipeline({
      executionId,
      toolingConfig,
      postgrestClient,
      fromStage: startStage,
      iteration: totalFixIterations + 1,
    });

    if (pipelineResult.passed) {
      return { success: true, totalIterations: totalFixIterations };
    }

    const failedStage = pipelineResult.failedStage!;
    const errorOutput = pipelineResult.errorOutput ?? '';

    await incrementAndPersistIterations();

    const stageCount = (perStageCount.get(failedStage) ?? 0) + 1;
    perStageCount.set(failedStage, stageCount);
    if (stageCount > PER_STAGE_LIMIT) {
      await escalate({
        executionId,
        taskId,
        reason: `Stage '${failedStage}' failed ${stageCount} times (limit: ${PER_STAGE_LIMIT})`,
        failedStage,
        errorOutput,
        postgrestClient,
      });
      return {
        success: false,
        reason: 'per_stage_limit',
        failedStage,
        totalIterations: totalFixIterations,
      };
    }

    if (totalFixIterations >= GLOBAL_LIMIT) {
      await escalate({
        executionId,
        taskId,
        reason: `Reached global fix iteration limit (${GLOBAL_LIMIT})`,
        failedStage,
        errorOutput,
        postgrestClient,
      });
      return {
        success: false,
        reason: 'global_limit',
        failedStage,
        totalIterations: totalFixIterations,
      };
    }

    heartbeat.updateStage('fixing');

    await sessionManager.sendFixPrompt(sessionId, failedStage, errorOutput);

    const monitorResult = await sessionManager.monitorSession(sessionId, {
      timeoutMs: 30 * 60 * 1000,
    });
    if (!monitorResult.completed) {
      await escalate({
        executionId,
        taskId,
        reason: 'session_timeout_during_fix',
        failedStage,
        errorOutput,
        postgrestClient,
      });
      return {
        success: false,
        reason: 'timeout',
        failedStage,
        totalIterations: totalFixIterations,
      };
    }

    startStage = failedStage;
  }
}
