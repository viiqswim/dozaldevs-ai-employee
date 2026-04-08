import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostgRESTClient } from '../../../src/workers/lib/postgrest-client.js';
import { PlanSync } from '../../../src/workers/lib/plan-sync.js';

vi.mock('node:fs/promises');
vi.mock('../../../src/lib/logger.js', () => ({
  createLogger: () => mockLogger,
  taskLogger: () => mockLogger,
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

const { readFile, writeFile } = await import('node:fs/promises');

function createMockClient(): PostgRESTClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  };
}

const DISK_PATH = '/tmp/plan-sync-test.md';

describe('PlanSync', () => {
  let client: PostgRESTClient;
  let planSync: PlanSync;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    planSync = new PlanSync({ postgrestClient: client, logger: mockLogger as any, diskPath: DISK_PATH });
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  describe('savePlanAfterPhase1', () => {
    it('writes to disk AND patches Supabase (both stores updated)', async () => {
      client.patch = vi.fn().mockResolvedValue({ id: 'task-1' });

      await planSync.savePlanAfterPhase1({ taskId: 'task-1', planContent: 'wave plan content' });

      expect(writeFile).toHaveBeenCalledWith(DISK_PATH, 'wave plan content', 'utf8');
      expect(client.patch).toHaveBeenCalledWith(
        'tasks',
        'id=eq.task-1',
        expect.objectContaining({ plan_content: 'wave plan content' }),
      );
    });

    it('throws when Supabase PATCH returns null (Supabase down)', async () => {
      client.patch = vi.fn().mockResolvedValue(null);

      await expect(
        planSync.savePlanAfterPhase1({ taskId: 'task-abc', planContent: 'my plan' }),
      ).rejects.toThrow('Failed to persist plan to Supabase for task task-abc');
    });

    it('includes plan_generated_at ISO timestamp in PATCH body', async () => {
      client.patch = vi.fn().mockResolvedValue({});

      await planSync.savePlanAfterPhase1({ taskId: 'task-1', planContent: 'plan' });

      expect(client.patch).toHaveBeenCalledWith(
        'tasks',
        'id=eq.task-1',
        expect.objectContaining({ plan_generated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }),
      );
    });
  });

  describe('loadPlanOnRestart', () => {
    it('returns source: disk when disk file exists, without calling Supabase', async () => {
      vi.mocked(readFile).mockResolvedValue('plan from disk' as any);

      const result = await planSync.loadPlanOnRestart('task-1');

      expect(result).toEqual({ planContent: 'plan from disk', source: 'disk' });
      expect(client.get).not.toHaveBeenCalled();
    });

    it('falls back to Supabase when disk read fails, returns source: supabase', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
      client.get = vi.fn().mockResolvedValue([{ plan_content: 'plan from supabase' }]);

      const result = await planSync.loadPlanOnRestart('task-2');

      expect(client.get).toHaveBeenCalledWith('tasks', 'id=eq.task-2&select=plan_content');
      expect(result).toEqual({ planContent: 'plan from supabase', source: 'supabase' });
    });

    it('writes back to disk after loading from Supabase', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
      client.get = vi.fn().mockResolvedValue([{ plan_content: 'plan from supabase' }]);

      await planSync.loadPlanOnRestart('task-2');

      expect(writeFile).toHaveBeenCalledWith(DISK_PATH, 'plan from supabase', 'utf8');
    });

    it('returns null when both disk and Supabase are empty', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
      client.get = vi.fn().mockResolvedValue([]);

      const result = await planSync.loadPlanOnRestart('task-3');

      expect(result).toBeNull();
    });

    it('returns null when Supabase returns row with null plan_content', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
      client.get = vi.fn().mockResolvedValue([{ plan_content: null }]);

      const result = await planSync.loadPlanOnRestart('task-4');

      expect(result).toBeNull();
    });
  });

  describe('updateWaveState', () => {
    it('PATCHes executions table with correct query and wave body', async () => {
      const waveState = {
        waves: [{ number: 2, startedAt: '2026-04-08T00:00:00Z', completedAt: null, status: 'running' as const, error: null }],
      };

      await planSync.updateWaveState({ executionId: 'exec-123', waveNumber: 2, waveState });

      expect(client.patch).toHaveBeenCalledWith(
        'executions',
        'id=eq.exec-123',
        { wave_number: 2, wave_state: waveState },
      );
    });
  });
});
