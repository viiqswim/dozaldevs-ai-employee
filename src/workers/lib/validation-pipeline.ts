import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../../lib/logger.js';
import type { ToolingConfig } from './task-context.js';
import type { PostgRESTClient } from './postgrest-client.js';

const log = createLogger('validation-pipeline');

const execFileAsync = promisify(execFile);

const STAGE_TIMEOUT_MS = 300_000;

export type ValidationStage = 'typescript' | 'lint' | 'unit' | 'integration' | 'e2e';

export const STAGE_ORDER: ValidationStage[] = ['typescript', 'lint', 'unit', 'integration', 'e2e'];

export interface StageResult {
  stage: ValidationStage;
  passed: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  skipped?: boolean;
}

export interface PipelineResult {
  passed: boolean;
  failedStage?: ValidationStage;
  errorOutput?: string;
  stageResults: StageResult[];
}

export interface RunPipelineOptions {
  executionId: string | null;
  toolingConfig: ToolingConfig;
  postgrestClient: PostgRESTClient;
  fromStage?: ValidationStage;
  iteration?: number;
}

export async function runSingleStage(
  stage: ValidationStage,
  command: string,
  cwd?: string,
): Promise<{ passed: boolean; stdout: string; stderr: string; durationMs: number }> {
  const [executable, ...args] = command.split(' ');
  const start = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: cwd ?? '/workspace',
      timeout: STAGE_TIMEOUT_MS,
    });
    return {
      passed: true,
      stdout: stdout ?? '',
      stderr: stderr ?? '',
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return {
      passed: false,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      durationMs: Date.now() - start,
    };
  }
}

export async function runValidationPipeline(options: RunPipelineOptions): Promise<PipelineResult> {
  const { executionId, toolingConfig, postgrestClient, fromStage, iteration = 1 } = options;

  const startIndex = fromStage ? STAGE_ORDER.indexOf(fromStage) : 0;
  const stagesToRun = startIndex >= 0 ? STAGE_ORDER.slice(startIndex) : STAGE_ORDER;

  const stageResults: StageResult[] = [];

  for (const stage of stagesToRun) {
    const command = toolingConfig[stage];

    if (!command) {
      stageResults.push({
        stage,
        passed: true,
        skipped: true,
        stdout: '',
        stderr: '',
        durationMs: 0,
      });
      continue;
    }

    const result = await runSingleStage(stage, command, '/workspace');

    stageResults.push({ stage, ...result });

    if (executionId) {
      await postgrestClient.post('validation_runs', {
        execution_id: executionId,
        stage,
        status: result.passed ? 'passed' : 'failed',
        iteration,
        error_output: result.passed ? null : (result.stderr || result.stdout).slice(0, 10000),
        duration_ms: result.durationMs,
      });
    } else {
      log.warn(
        `[validation-pipeline] Skipping DB write for stage "${stage}" — executionId is null`,
      );
    }

    if (!result.passed) {
      return {
        passed: false,
        failedStage: stage,
        errorOutput: (result.stderr || result.stdout).slice(0, 4000),
        stageResults,
      };
    }
  }

  return { passed: true, stageResults };
}
