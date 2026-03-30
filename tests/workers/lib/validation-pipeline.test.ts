import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { PostgRESTClient } from '../../../src/workers/lib/postgrest-client.js';
import type { ToolingConfig } from '../../../src/workers/lib/task-context.js';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

const { runValidationPipeline, runSingleStage, STAGE_ORDER } =
  await import('../../../src/workers/lib/validation-pipeline.js');
import { execFile } from 'child_process';

const mockExecFile = vi.mocked(execFile);

function createMockPostgRESTClient(): PostgRESTClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  };
}

function mockStageSuccess() {
  mockExecFile.mockResolvedValueOnce({ stdout: 'ok', stderr: '' } as never);
}

function mockStageFailure(stderr = 'Error: compilation failed') {
  mockExecFile.mockRejectedValueOnce(Object.assign(new Error(stderr), { stdout: '', stderr }));
}

describe('validation-pipeline', () => {
  beforeEach(() => {
    mockExecFile.mockClear();
  });

  afterEach(() => {
    mockExecFile.mockClear();
  });

  describe('STAGE_ORDER', () => {
    it('should have exactly 5 stages in correct order', () => {
      expect(STAGE_ORDER).toEqual(['typescript', 'lint', 'unit', 'integration', 'e2e']);
      expect(STAGE_ORDER).toHaveLength(5);
    });
  });

  describe('runSingleStage()', () => {
    it('should return passed: true when command succeeds', async () => {
      mockStageSuccess();

      const result = await runSingleStage('typescript', 'pnpm tsc --noEmit');

      expect(result.passed).toBe(true);
      expect(result.stdout).toBe('ok');
      expect(result.stderr).toBe('');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return passed: false when command fails', async () => {
      mockStageFailure('Error: compilation failed');

      const result = await runSingleStage('typescript', 'pnpm tsc --noEmit');

      expect(result.passed).toBe(false);
      expect(result.stderr).toBe('Error: compilation failed');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should use cwd: /workspace when cwd not specified', async () => {
      mockStageSuccess();

      await runSingleStage('typescript', 'pnpm tsc --noEmit');

      expect(mockExecFile).toHaveBeenCalledWith(
        'pnpm',
        ['tsc', '--noEmit'],
        expect.objectContaining({
          cwd: '/workspace',
          timeout: 300_000,
        }),
      );
    });

    it('should use provided cwd when specified', async () => {
      mockStageSuccess();

      await runSingleStage('typescript', 'pnpm tsc --noEmit', '/custom/path');

      expect(mockExecFile).toHaveBeenCalledWith(
        'pnpm',
        ['tsc', '--noEmit'],
        expect.objectContaining({
          cwd: '/custom/path',
          timeout: 300_000,
        }),
      );
    });

    it('should split command correctly: executable and args', async () => {
      mockStageSuccess();

      await runSingleStage('lint', 'pnpm lint');

      expect(mockExecFile).toHaveBeenCalledWith('pnpm', ['lint'], expect.any(Object));
    });

    it('should split multi-arg command correctly', async () => {
      mockStageSuccess();

      await runSingleStage('unit', 'pnpm test -- --run');

      expect(mockExecFile).toHaveBeenCalledWith(
        'pnpm',
        ['test', '--', '--run'],
        expect.any(Object),
      );
    });

    it('should measure duration in milliseconds', async () => {
      mockStageSuccess();

      const result = await runSingleStage('typescript', 'pnpm tsc --noEmit');

      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('runValidationPipeline()', () => {
    it('should return passed: true when all stages pass', async () => {
      mockStageSuccess();
      mockStageSuccess();
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
        lint: 'pnpm lint',
        unit: 'pnpm test -- --run',
      };

      const result = await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      expect(result.passed).toBe(true);
      expect(result.failedStage).toBeUndefined();
      expect(result.stageResults).toHaveLength(5);
      const configuredStages = result.stageResults.filter((r) => !r.skipped);
      expect(configuredStages).toHaveLength(3);
    });

    it('should call PostgREST post for each configured stage', async () => {
      mockStageSuccess();
      mockStageSuccess();
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
        lint: 'pnpm lint',
        unit: 'pnpm test -- --run',
      };

      await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      expect(postgrestClient.post).toHaveBeenCalledTimes(3);
      expect(postgrestClient.post).toHaveBeenCalledWith(
        'validation_runs',
        expect.objectContaining({
          execution_id: 'exec-123',
          stage: 'typescript',
          status: 'passed',
        }),
      );
    });

    it('should stop pipeline when first stage (typescript) fails', async () => {
      mockStageFailure('Error: compilation failed');

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
        lint: 'pnpm lint',
        unit: 'pnpm test -- --run',
      };

      const result = await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      expect(result.passed).toBe(false);
      expect(result.failedStage).toBe('typescript');
      expect(result.stageResults).toHaveLength(1);
      expect(postgrestClient.post).toHaveBeenCalledTimes(1);
    });

    it('should stop pipeline when middle stage (lint) fails', async () => {
      mockStageSuccess();
      mockStageFailure('Error: linting failed');

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
        lint: 'pnpm lint',
        unit: 'pnpm test -- --run',
      };

      const result = await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      expect(result.passed).toBe(false);
      expect(result.failedStage).toBe('lint');
      expect(result.stageResults).toHaveLength(2);
      expect(postgrestClient.post).toHaveBeenCalledTimes(2);
    });

    it('should skip unconfigured stages (integration, e2e)', async () => {
      mockStageSuccess();
      mockStageSuccess();
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
        lint: 'pnpm lint',
        unit: 'pnpm test -- --run',
      };

      const result = await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      expect(result.passed).toBe(true);
      expect(result.stageResults).toHaveLength(5);
      const skippedStages = result.stageResults.filter((r) => r.skipped);
      expect(skippedStages).toHaveLength(2);
      expect(skippedStages.map((r) => r.stage)).toEqual(['integration', 'e2e']);
      expect(postgrestClient.post).toHaveBeenCalledTimes(3);
    });

    it('should start from specified stage with fromStage: lint', async () => {
      mockStageSuccess();
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
        lint: 'pnpm lint',
        unit: 'pnpm test -- --run',
      };

      const result = await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
        fromStage: 'lint',
      });

      expect(result.passed).toBe(true);
      expect(result.stageResults).toHaveLength(4);
      expect(result.stageResults[0].stage).toBe('lint');
      expect(result.stageResults[1].stage).toBe('unit');
      expect(result.stageResults.map((r) => r.stage)).not.toContain('typescript');
    });

    it('should start from specified stage with fromStage: unit', async () => {
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
        lint: 'pnpm lint',
        unit: 'pnpm test -- --run',
      };

      const result = await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
        fromStage: 'unit',
      });

      expect(result.passed).toBe(true);
      expect(result.stageResults).toHaveLength(3);
      expect(result.stageResults[0].stage).toBe('unit');
      expect(result.stageResults.map((r) => r.stage)).not.toContain('typescript');
      expect(result.stageResults.map((r) => r.stage)).not.toContain('lint');
    });

    it('should skip DB write when executionId is null', async () => {
      mockStageSuccess();
      mockStageSuccess();
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
        lint: 'pnpm lint',
        unit: 'pnpm test -- --run',
      };

      const result = await runValidationPipeline({
        executionId: null,
        toolingConfig,
        postgrestClient,
      });

      expect(result.passed).toBe(true);
      expect(postgrestClient.post).not.toHaveBeenCalled();
    });

    it('should truncate errorOutput to 4000 chars', async () => {
      const longError = 'x'.repeat(5000);
      mockStageFailure(longError);

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
      };

      const result = await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      expect(result.passed).toBe(false);
      expect(result.errorOutput).toHaveLength(4000);
      expect(result.errorOutput).toBe('x'.repeat(4000));
    });

    it('should propagate iteration parameter to PostgREST post', async () => {
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
      };

      await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
        iteration: 5,
      });

      expect(postgrestClient.post).toHaveBeenCalledWith(
        'validation_runs',
        expect.objectContaining({
          iteration: 5,
        }),
      );
    });

    it('should default iteration to 1 if not provided', async () => {
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
      };

      await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      expect(postgrestClient.post).toHaveBeenCalledWith(
        'validation_runs',
        expect.objectContaining({
          iteration: 1,
        }),
      );
    });

    it('should include stageResults in PipelineResult', async () => {
      mockStageSuccess();
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
        lint: 'pnpm lint',
      };

      const result = await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      expect(result.stageResults).toBeDefined();
      expect(result.stageResults).toHaveLength(5);
      expect(result.stageResults[0]).toMatchObject({
        stage: 'typescript',
        passed: true,
        stdout: 'ok',
        stderr: '',
        durationMs: expect.any(Number),
      });
    });

    it('should mark skipped stages with skipped: true', async () => {
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
      };

      const result = await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      const lintResult = result.stageResults.find((r) => r.stage === 'lint');
      expect(lintResult).toMatchObject({
        stage: 'lint',
        passed: true,
        skipped: true,
        stdout: '',
        stderr: '',
        durationMs: 0,
      });
    });

    it('should post error_output with failed stage result', async () => {
      const errorMsg = 'Error: test failed';
      mockStageFailure(errorMsg);

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
      };

      await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      expect(postgrestClient.post).toHaveBeenCalledWith(
        'validation_runs',
        expect.objectContaining({
          status: 'failed',
          error_output: errorMsg,
        }),
      );
    });

    it('should post null error_output when stage passes', async () => {
      mockStageSuccess();

      const postgrestClient = createMockPostgRESTClient();
      const toolingConfig: ToolingConfig = {
        typescript: 'pnpm tsc --noEmit',
      };

      await runValidationPipeline({
        executionId: 'exec-123',
        toolingConfig,
        postgrestClient,
      });

      expect(postgrestClient.post).toHaveBeenCalledWith(
        'validation_runs',
        expect.objectContaining({
          status: 'passed',
          error_output: null,
        }),
      );
    });
  });
});
