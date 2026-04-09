import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseTaskContext,
  buildPrompt,
  resolveToolingConfig,
  DEFAULT_TOOLING_CONFIG,
  type TaskRow,
  type ProjectRow,
  type ToolingConfig,
} from '../../../src/workers/lib/task-context.js';

const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  createLogger: () => mockLogger,
  taskLogger: () => mockLogger,
}));

vi.mock('../../../src/workers/lib/prompt-builder.js', () => ({
  buildExecutionPrompt: vi.fn().mockResolvedValue('mocked execution prompt'),
}));

let mockReadFileSync: ReturnType<typeof vi.fn>;

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

describe('task-context', () => {
  beforeEach(async () => {
    const fs = await import('fs');
    mockReadFileSync = vi.mocked(fs.readFileSync);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parseTaskContext', () => {
    it('returns first element when JSON array is non-empty', () => {
      const mockTask: TaskRow = {
        id: 'task-1',
        external_id: 'TEST-1',
        status: 'Executing',
        triage_result: null,
        requirements: null,
        project_id: 'proj-1',
      };

      mockReadFileSync.mockReturnValue(JSON.stringify([mockTask]));

      const result = parseTaskContext('/workspace/.task-context.json');

      expect(result).toEqual(mockTask);
      expect(mockReadFileSync).toHaveBeenCalledWith('/workspace/.task-context.json', 'utf8');
    });

    it('returns null when JSON array is empty', () => {
      mockReadFileSync.mockReturnValue(JSON.stringify([]));

      const result = parseTaskContext('/workspace/.task-context.json');

      expect(result).toBeNull();
    });

    it('returns null and warns when JSON is malformed', () => {
      mockReadFileSync.mockReturnValue('{ invalid json }');

      const result = parseTaskContext('/workspace/.task-context.json');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '[task-context] Failed to parse task context from /workspace/.task-context.json',
        ),
      );
    });

    it('returns null and warns when file does not exist (ENOENT)', () => {
      mockReadFileSync.mockImplementation(() => {
        const error = new Error('ENOENT: no such file or directory');
        throw error;
      });

      const result = parseTaskContext('/workspace/.task-context.json');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '[task-context] Failed to parse task context from /workspace/.task-context.json',
        ),
      );
    });

    it('extracts first element from multi-element array', () => {
      const task1: TaskRow = {
        id: 'task-1',
        external_id: 'TEST-1',
        status: 'Executing',
        triage_result: null,
        requirements: null,
        project_id: 'proj-1',
      };
      const task2: TaskRow = {
        id: 'task-2',
        external_id: 'TEST-2',
        status: 'Pending',
        triage_result: null,
        requirements: null,
        project_id: 'proj-2',
      };

      mockReadFileSync.mockReturnValue(JSON.stringify([task1, task2]));

      const result = parseTaskContext('/workspace/.task-context.json');

      expect(result).toEqual(task1);
      expect(result?.id).toBe('task-1');
    });
  });

  describe('buildPrompt', () => {
    it('returns fallback prompt when triage_result is null (no prompt-builder call)', async () => {
      const task: TaskRow = {
        id: 'task-1',
        external_id: 'PROJ-123',
        status: 'Executing',
        triage_result: null,
        requirements: null,
        project_id: 'proj-1',
      };

      const prompt = await buildPrompt(task);

      expect(prompt).toBe(
        'Implement task PROJ-123: Please examine the codebase and implement the required changes.',
      );
    });

    it('returns fallback prompt when triage_result has no issue field', async () => {
      const jiraPayload = {
        webhookEvent: 'jira:issue_created',
      };

      const task: TaskRow = {
        id: 'task-1',
        external_id: 'PROJ-456',
        status: 'Executing',
        triage_result: jiraPayload,
        requirements: null,
        project_id: 'proj-1',
      };

      const prompt = await buildPrompt(task);

      expect(prompt).toBe(
        'Implement task PROJ-456: Please examine the codebase and implement the required changes.',
      );
    });

    it('calls buildExecutionPrompt with ticket info from valid Jira triage_result', async () => {
      const { buildExecutionPrompt } = await import('../../../src/workers/lib/prompt-builder.js');

      const jiraPayload = {
        webhookEvent: 'jira:issue_created',
        issue: {
          id: '10001',
          key: 'TEST-001',
          fields: {
            summary: 'Add date formatting utility',
            description: 'Create a utility function that formats dates as ISO strings.',
            project: {
              key: 'TEST',
            },
          },
        },
      };

      const task: TaskRow = {
        id: 'task-1',
        external_id: 'TEST-001',
        status: 'Executing',
        triage_result: jiraPayload,
        requirements: null,
        project_id: 'proj-1',
      };

      const prompt = await buildPrompt(task);

      expect(buildExecutionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          ticket: expect.objectContaining({
            key: 'TEST-001',
            summary: 'Add date formatting utility',
          }),
          repoRoot: '/workspace',
          wave: expect.objectContaining({ number: 1 }),
        }),
      );
      expect(prompt).toBe('mocked execution prompt');
    });

    it('passes requirements in description to buildExecutionPrompt', async () => {
      const { buildExecutionPrompt } = await import('../../../src/workers/lib/prompt-builder.js');

      const jiraPayload = {
        webhookEvent: 'jira:issue_created',
        issue: {
          id: '10001',
          key: 'TEST-001',
          fields: {
            summary: 'Test task',
            description: 'Test description',
            project: { key: 'TEST' },
          },
        },
      };

      const requirements = {
        acceptance_criteria: ['Criterion 1', 'Criterion 2'],
      };

      const task: TaskRow = {
        id: 'task-1',
        external_id: 'TEST-001',
        status: 'Executing',
        triage_result: jiraPayload,
        requirements,
        project_id: 'proj-1',
      };

      await buildPrompt(task);

      const call = vi.mocked(buildExecutionPrompt).mock.calls[0]?.[0];
      expect(call?.ticket.description).toContain('Criterion 1');
      expect(call?.ticket.description).toContain('Requirements');
    });

    it('uses UNKNOWN for missing issue key', async () => {
      const { buildExecutionPrompt } = await import('../../../src/workers/lib/prompt-builder.js');

      const jiraPayload = {
        webhookEvent: 'jira:issue_created',
        issue: {
          id: '10001',
          fields: {
            summary: 'Test task',
            description: 'Test description',
          },
        },
      };

      const task: TaskRow = {
        id: 'task-1',
        external_id: 'TEST-001',
        status: 'Executing',
        triage_result: jiraPayload,
        requirements: null,
        project_id: 'proj-1',
      };

      await buildPrompt(task);

      const call = vi.mocked(buildExecutionPrompt).mock.calls[0]?.[0];
      expect(call?.ticket.key).toBe('UNKNOWN');
    });

    it('synthetic wave number is always 1', async () => {
      const { buildExecutionPrompt } = await import('../../../src/workers/lib/prompt-builder.js');

      const jiraPayload = {
        issue: {
          key: 'TEST-001',
          fields: { summary: 'Task', description: 'desc' },
        },
      };

      const task: TaskRow = {
        id: 'task-1',
        external_id: 'TEST-001',
        status: 'Executing',
        triage_result: jiraPayload,
        requirements: null,
        project_id: 'proj-1',
      };

      await buildPrompt(task);

      const call = vi.mocked(buildExecutionPrompt).mock.calls[0]?.[0];
      expect(call?.wave.number).toBe(1);
    });

    it('passes agentsMdContent as null', async () => {
      const { buildExecutionPrompt } = await import('../../../src/workers/lib/prompt-builder.js');

      const jiraPayload = {
        issue: {
          key: 'TEST-001',
          fields: { summary: 'Task', description: 'desc' },
        },
      };

      const task: TaskRow = {
        id: 'task-1',
        external_id: 'TEST-001',
        status: 'Executing',
        triage_result: jiraPayload,
        requirements: null,
        project_id: 'proj-1',
      };

      await buildPrompt(task);

      const call = vi.mocked(buildExecutionPrompt).mock.calls[0]?.[0];
      expect(call?.agentsMdContent).toBeNull();
      expect(call?.boulderContext).toBeNull();
    });
  });

  describe('resolveToolingConfig', () => {
    it('returns DEFAULT_TOOLING_CONFIG when projectRow is null', () => {
      const result = resolveToolingConfig(null);

      expect(result).toEqual(DEFAULT_TOOLING_CONFIG);
      expect(result.typescript).toBe('pnpm tsc --noEmit');
      expect(result.lint).toBe('pnpm lint');
      expect(result.unit).toBe('pnpm test -- --run');
    });

    it('returns DEFAULT_TOOLING_CONFIG when projectRow.tooling_config is null', () => {
      const projectRow: ProjectRow = {
        id: 'proj-1',
        tooling_config: null,
        name: 'Test Project',
      };

      const result = resolveToolingConfig(projectRow);

      expect(result).toEqual(DEFAULT_TOOLING_CONFIG);
    });

    it('merges project config with defaults (project config takes precedence)', () => {
      const projectRow: ProjectRow = {
        id: 'proj-1',
        tooling_config: {
          typescript: 'custom tsc command',
          e2e: 'pnpm e2e',
        },
        name: 'Test Project',
      };

      const result = resolveToolingConfig(projectRow);

      expect(result.typescript).toBe('custom tsc command');
      expect(result.lint).toBe('pnpm lint');
      expect(result.unit).toBe('pnpm test -- --run');
      expect(result.e2e).toBe('pnpm e2e');
      expect(result.integration).toBeUndefined();
    });

    it('allows project to override all defaults', () => {
      const projectRow: ProjectRow = {
        id: 'proj-1',
        tooling_config: {
          typescript: 'custom tsc',
          lint: 'custom lint',
          unit: 'custom test',
          integration: 'custom integration',
          e2e: 'custom e2e',
        },
        name: 'Test Project',
      };

      const result = resolveToolingConfig(projectRow);

      expect(result.typescript).toBe('custom tsc');
      expect(result.lint).toBe('custom lint');
      expect(result.unit).toBe('custom test');
      expect(result.integration).toBe('custom integration');
      expect(result.e2e).toBe('custom e2e');
    });

    it('allows project to add integration and e2e when not in defaults', () => {
      const projectRow: ProjectRow = {
        id: 'proj-1',
        tooling_config: {
          integration: 'pnpm test:integration',
          e2e: 'pnpm test:e2e',
        },
        name: 'Test Project',
      };

      const result = resolveToolingConfig(projectRow);

      expect(result.typescript).toBe('pnpm tsc --noEmit');
      expect(result.lint).toBe('pnpm lint');
      expect(result.unit).toBe('pnpm test -- --run');
      expect(result.integration).toBe('pnpm test:integration');
      expect(result.e2e).toBe('pnpm test:e2e');
    });
  });

  describe('DEFAULT_TOOLING_CONFIG', () => {
    it('has typescript, lint, and unit commands', () => {
      expect(DEFAULT_TOOLING_CONFIG.typescript).toBe('pnpm tsc --noEmit');
      expect(DEFAULT_TOOLING_CONFIG.lint).toBe('pnpm lint');
      expect(DEFAULT_TOOLING_CONFIG.unit).toBe('pnpm test -- --run');
    });

    it('does not have integration or e2e commands', () => {
      expect(DEFAULT_TOOLING_CONFIG.integration).toBeUndefined();
      expect(DEFAULT_TOOLING_CONFIG.e2e).toBeUndefined();
    });

    it('is a valid ToolingConfig object', () => {
      const config: ToolingConfig = DEFAULT_TOOLING_CONFIG;
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });
  });
});
