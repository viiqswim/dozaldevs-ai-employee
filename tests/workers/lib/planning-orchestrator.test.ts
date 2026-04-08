import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { SessionManager } from '../../../src/workers/lib/session-manager.js';
import type { LongRunningConfig } from '../../../src/workers/config/long-running.js';
import type { ParsedPlan } from '../../../src/workers/lib/plan-parser.js';
import {
  runPlanningPhase,
  PlanValidationError,
} from '../../../src/workers/lib/planning-orchestrator.js';

const TICKET = { key: 'TEST-42', summary: 'Add auth flow', description: 'Implement JWT auth.' };
const PROJECT_META = { repoUrl: 'https://github.com/example/repo', name: 'My Repo' };

const MOCK_CONFIG: LongRunningConfig = {
  orchestrateTimeoutMs: 14400000,
  completionTimeoutMs: 21600000,
  totalTimeoutMs: 28800000,
  planningTimeoutMs: 1800000,
  maxContinuationsPerWave: 5,
  maxWavesPerTask: 20,
  minDiskSpaceBytes: 2147483648,
  agentsMdMaxChars: 8000,
  heartbeatIntervalMs: 60000,
  watchdogStaleThresholdMs: 1200000,
  fallbackPrEnabled: true,
  costBreakerTokenCap: 4000000,
};

const MOCK_PARSED_PLAN: ParsedPlan = {
  waves: [{ number: 1, tasks: [{ number: 1, title: 'Do something', completed: false }] }],
  totalWaves: 1,
  totalTasks: 1,
  completedTasks: 0,
};

function createMockSessionManager(overrides: Partial<SessionManager> = {}): SessionManager {
  return {
    createSession: vi.fn().mockResolvedValue('sess-plan-1'),
    injectTaskPrompt: vi.fn().mockResolvedValue(true),
    monitorSession: vi.fn().mockResolvedValue({ completed: true, reason: 'idle' }),
    abortSession: vi.fn().mockResolvedValue(undefined),
    sendFixPrompt: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createMockPromptBuilder() {
  return { buildPlanningPrompt: vi.fn().mockReturnValue('mock planning prompt') };
}

function createMockPlanParser(overrides: { validateOk?: boolean; validateErrors?: string[] } = {}) {
  return {
    parsePlanFile: vi.fn().mockReturnValue(MOCK_PARSED_PLAN),
    validatePlan: vi.fn().mockReturnValue({
      ok: overrides.validateOk !== undefined ? overrides.validateOk : true,
      errors: overrides.validateErrors ?? [],
    }),
  };
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as import('../../../src/lib/logger.js').Logger;
}

async function writePlanFile(
  repoRoot: string,
  ticketKey: string,
  content: string,
): Promise<string> {
  const planDir = path.join(repoRoot, '.sisyphus', 'plans');
  await fs.promises.mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, `${ticketKey}.md`);
  await fs.promises.writeFile(planPath, content, 'utf8');
  return planPath;
}

describe('runPlanningPhase', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'planning-test-'));
  });

  afterEach(async () => {
    await fs.promises
      .chmod(path.join(tempDir, '.sisyphus', 'plans', `${TICKET.key}.md`), 0o644)
      .catch(() => {});
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('valid plan happy path returns planContent and planPath', async () => {
    const planContent = 'plan content for TEST-42';
    await writePlanFile(tempDir, TICKET.key, planContent);

    const result = await runPlanningPhase({
      ticket: TICKET,
      repoRoot: tempDir,
      projectMeta: PROJECT_META,
      sessionManager: createMockSessionManager(),
      promptBuilder: createMockPromptBuilder(),
      planParser: createMockPlanParser(),
      config: MOCK_CONFIG,
      logger: createMockLogger(),
    });

    expect(result.planContent).toBe(planContent);
    expect(result.planPath).toBe(path.join(tempDir, '.sisyphus', 'plans', 'TEST-42.md'));
  });

  it('missing plan file throws Error with planPath in message', async () => {
    await expect(
      runPlanningPhase({
        ticket: TICKET,
        repoRoot: tempDir,
        projectMeta: PROJECT_META,
        sessionManager: createMockSessionManager(),
        promptBuilder: createMockPromptBuilder(),
        planParser: createMockPlanParser(),
        config: MOCK_CONFIG,
        logger: createMockLogger(),
      }),
    ).rejects.toThrow('Plan file not found at');
  });

  it('invalid plan throws PlanValidationError with errors array', async () => {
    await writePlanFile(tempDir, TICKET.key, 'plan content');
    const validationErrors = ['Plan has no waves', 'Plan too short'];

    let caught: unknown;
    try {
      await runPlanningPhase({
        ticket: TICKET,
        repoRoot: tempDir,
        projectMeta: PROJECT_META,
        sessionManager: createMockSessionManager(),
        promptBuilder: createMockPromptBuilder(),
        planParser: createMockPlanParser({ validateOk: false, validateErrors: validationErrors }),
        config: MOCK_CONFIG,
        logger: createMockLogger(),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PlanValidationError);
    expect((caught as PlanValidationError).errors).toEqual(validationErrors);
    expect((caught as PlanValidationError).message).toContain('Plan validation failed');
  });

  it('planning timeout throws Error with timeout duration in message', async () => {
    const timedOutSession = createMockSessionManager({
      monitorSession: vi.fn().mockResolvedValue({ completed: false, reason: 'timeout' }),
    });

    await expect(
      runPlanningPhase({
        ticket: TICKET,
        repoRoot: tempDir,
        projectMeta: PROJECT_META,
        sessionManager: timedOutSession,
        promptBuilder: createMockPromptBuilder(),
        planParser: createMockPlanParser(),
        config: MOCK_CONFIG,
        logger: createMockLogger(),
      }),
    ).rejects.toThrow(`Planning phase timed out after ${MOCK_CONFIG.planningTimeoutMs}ms`);
  });

  it('chmod 444 applied — file mode is 0o444 after successful run', async () => {
    await writePlanFile(tempDir, TICKET.key, 'plan content');

    await runPlanningPhase({
      ticket: TICKET,
      repoRoot: tempDir,
      projectMeta: PROJECT_META,
      sessionManager: createMockSessionManager(),
      promptBuilder: createMockPromptBuilder(),
      planParser: createMockPlanParser(),
      config: MOCK_CONFIG,
      logger: createMockLogger(),
    });

    const planPath = path.join(tempDir, '.sisyphus', 'plans', `${TICKET.key}.md`);
    const stat = await fs.promises.stat(planPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o444);
  });

  it('uses createSession with Planning: prefixed title', async () => {
    const sessionManager = createMockSessionManager();
    await writePlanFile(tempDir, TICKET.key, 'plan content');

    await runPlanningPhase({
      ticket: TICKET,
      repoRoot: tempDir,
      projectMeta: PROJECT_META,
      sessionManager,
      promptBuilder: createMockPromptBuilder(),
      planParser: createMockPlanParser(),
      config: MOCK_CONFIG,
      logger: createMockLogger(),
    });

    expect(sessionManager.createSession).toHaveBeenCalledWith(`Planning: ${TICKET.key}`);
  });
});

describe('PlanValidationError', () => {
  it('has correct name and errors array', () => {
    const errors = ['missing waves', 'too short'];
    const err = new PlanValidationError('Plan validation failed: missing waves, too short', errors);
    expect(err.name).toBe('PlanValidationError');
    expect(err.errors).toEqual(errors);
    expect(err.message).toContain('Plan validation failed');
    expect(err).toBeInstanceOf(Error);
  });
});
