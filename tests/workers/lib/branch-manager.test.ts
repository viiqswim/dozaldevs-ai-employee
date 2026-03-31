import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

const { buildBranchName, ensureBranch, commitAndPush } =
  await import('../../../src/workers/lib/branch-manager.js');
import { execFile } from 'child_process';

const mockExecFile = vi.mocked(execFile);

function mockSuccess(stdout = '') {
  mockExecFile.mockResolvedValueOnce({ stdout, stderr: '' } as never);
}

function mockFailure(message = 'git error') {
  mockExecFile.mockRejectedValueOnce(
    Object.assign(new Error(message), { stdout: '', stderr: message }),
  );
}

describe('branch-manager', () => {
  beforeEach(() => {
    mockExecFile.mockClear();
  });

  afterEach(() => {
    mockExecFile.mockClear();
  });

  describe('buildBranchName()', () => {
    it('builds a branch name from ticket and simple title', () => {
      expect(buildBranchName('PROJ-123', 'Fix login bug')).toBe('ai/PROJ-123-fix-login-bug');
    });

    it('builds a branch name with special characters stripped', () => {
      expect(buildBranchName('ENG-456', 'Add payment retry logic with special chars!')).toBe(
        'ai/ENG-456-add-payment-retry-logic-with-special-chars',
      );
    });

    it('matches the required regex pattern', () => {
      const result = buildBranchName('PROJ-123', 'Fix login bug');
      expect(result).toMatch(/^ai\/[A-Z]+-\d+-[a-z0-9-]+$/);
    });

    it('collapses consecutive hyphens from multiple special chars', () => {
      expect(buildBranchName('JIRA-1', 'Fix   multiple   spaces')).toBe(
        'ai/JIRA-1-fix-multiple-spaces',
      );
    });

    it('trims trailing hyphens from title', () => {
      expect(buildBranchName('T-1', 'title!!!')).toBe('ai/T-1-title');
    });

    it('truncates kebab portion to 60 chars', () => {
      const longTitle = 'a'.repeat(100);
      const result = buildBranchName('PROJ-1', longTitle);
      const kebabPart = result.replace('ai/', '');
      expect(kebabPart.length).toBeLessThanOrEqual(60);
    });

    it('does not end with a hyphen after truncation', () => {
      const result = buildBranchName('PROJ-123', 'a'.repeat(100));
      expect(result).not.toMatch(/-$/);
    });

    it('lowercases title characters', () => {
      expect(buildBranchName('ABC-99', 'ALL CAPS TITLE')).toBe('ai/ABC-99-all-caps-title');
    });

    it('handles numeric-only title segments', () => {
      const result = buildBranchName('T-42', '2024 update');
      expect(result).toBe('ai/T-42-2024-update');
    });
  });

  describe('ensureBranch()', () => {
    it('creates new branch when remote branch does not exist', async () => {
      mockSuccess('');
      mockSuccess('');
      mockSuccess('');
      mockSuccess('');

      const result = await ensureBranch('ai/PROJ-1-test', '/workspace');

      expect(result.success).toBe(true);
      expect(result.existed).toBe(false);

      const checkoutCall = mockExecFile.mock.calls.find(
        (call) => call[0] === 'git' && (call[1] as string[]).includes('checkout'),
      );
      expect(checkoutCall?.[1]).toEqual(['checkout', '-b', 'ai/PROJ-1-test']);
    });

    it('checks out existing remote branch when it exists', async () => {
      mockSuccess('');
      mockSuccess('');
      mockSuccess('abc123\trefs/heads/ai/PROJ-1-test');
      mockSuccess('');

      const result = await ensureBranch('ai/PROJ-1-test', '/workspace');

      expect(result.success).toBe(true);
      expect(result.existed).toBe(true);

      const checkoutCall = mockExecFile.mock.calls.find(
        (call) => call[0] === 'git' && (call[1] as string[]).includes('checkout'),
      );
      expect(checkoutCall?.[1]).toEqual([
        'checkout',
        '-b',
        'ai/PROJ-1-test',
        'origin/ai/PROJ-1-test',
      ]);
    });

    it('sets git user.email identity before operations', async () => {
      mockSuccess('');
      mockSuccess('');
      mockSuccess('');
      mockSuccess('');

      await ensureBranch('ai/PROJ-1-test', '/workspace');

      const emailCall = mockExecFile.mock.calls.find(
        (call) => call[0] === 'git' && (call[1] as string[]).includes('user.email'),
      );
      expect(emailCall?.[1]).toEqual(['config', 'user.email', 'ai-employee@platform.local']);
    });

    it('sets git user.name identity before operations', async () => {
      mockSuccess('');
      mockSuccess('');
      mockSuccess('');
      mockSuccess('');

      await ensureBranch('ai/PROJ-1-test', '/workspace');

      const nameCall = mockExecFile.mock.calls.find(
        (call) => call[0] === 'git' && (call[1] as string[]).includes('user.name'),
      );
      expect(nameCall?.[1]).toEqual(['config', 'user.name', 'AI Employee']);
    });

    it('returns success: false with error message on git failure', async () => {
      mockFailure('permission denied');

      const result = await ensureBranch('ai/PROJ-1-test', '/workspace');

      expect(result.success).toBe(false);
      expect(result.existed).toBe(false);
      expect(result.error).toContain('permission denied');
    });

    it('uses provided cwd for all git commands', async () => {
      mockSuccess('');
      mockSuccess('');
      mockSuccess('');
      mockSuccess('');

      await ensureBranch('ai/PROJ-1-test', '/custom/path');

      for (const call of mockExecFile.mock.calls) {
        expect((call[2] as { cwd: string }).cwd).toBe('/custom/path');
      }
    });
  });

  describe('commitAndPush()', () => {
    it('returns { pushed: false, reason: no_changes } when diff is empty', async () => {
      mockSuccess('');
      mockSuccess('');

      const result = await commitAndPush('ai/PROJ-1-test', 'feat: add feature', '/workspace');

      expect(result.pushed).toBe(false);
      expect(result.reason).toBe('no_changes');
      expect(result.error).toBeUndefined();
    });

    it('commits and pushes when there are staged changes', async () => {
      mockSuccess('');
      mockFailure('diff exit 1');
      mockSuccess('');
      mockSuccess('');

      const result = await commitAndPush('ai/PROJ-1-test', 'feat: add feature', '/workspace');

      expect(result.pushed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('uses --force-with-lease for push (not --force)', async () => {
      mockSuccess('');
      mockFailure('diff exit 1');
      mockSuccess('');
      mockSuccess('');

      await commitAndPush('ai/PROJ-1-test', 'feat: add feature', '/workspace');

      const pushCall = mockExecFile.mock.calls.find(
        (call) => call[0] === 'git' && (call[1] as string[]).includes('push'),
      );
      expect(pushCall?.[1]).toContain('--force-with-lease');
      expect(pushCall?.[1]).not.toContain('--force');
    });

    it('pushes to correct branch name', async () => {
      mockSuccess('');
      mockFailure('diff exit 1');
      mockSuccess('');
      mockSuccess('');

      await commitAndPush('ai/ENG-99-my-branch', 'feat: stuff', '/workspace');

      const pushCall = mockExecFile.mock.calls.find(
        (call) => call[0] === 'git' && (call[1] as string[]).includes('push'),
      );
      expect(pushCall?.[1]).toEqual([
        'push',
        '--force-with-lease',
        'origin',
        'ai/ENG-99-my-branch',
      ]);
    });

    it('uses git add -A to stage all changes', async () => {
      mockSuccess('');
      mockSuccess('');

      await commitAndPush('ai/PROJ-1-test', 'chore: cleanup', '/workspace');

      const addCall = mockExecFile.mock.calls.find(
        (call) => call[0] === 'git' && (call[1] as string[]).includes('add'),
      );
      expect(addCall?.[1]).toEqual(['add', '-A']);
    });

    it('returns { pushed: false, error } when push fails', async () => {
      mockSuccess('');
      mockFailure('diff exit 1');
      mockSuccess('');
      mockFailure('push rejected: non-fast-forward');

      const result = await commitAndPush('ai/PROJ-1-test', 'feat: add', '/workspace');

      expect(result.pushed).toBe(false);
      expect(result.error).toContain('push rejected');
    });

    it('does not call commit when no staged changes', async () => {
      mockSuccess('');
      mockSuccess('');

      await commitAndPush('ai/PROJ-1-test', 'feat: add', '/workspace');

      const commitCall = mockExecFile.mock.calls.find(
        (call) => call[0] === 'git' && (call[1] as string[]).includes('commit'),
      );
      expect(commitCall).toBeUndefined();
    });

    it('uses the provided commit message', async () => {
      mockSuccess('');
      mockFailure('diff exit 1');
      mockSuccess('');
      mockSuccess('');

      await commitAndPush('ai/PROJ-1-test', 'fix: resolve issue #42', '/workspace');

      const commitCall = mockExecFile.mock.calls.find(
        (call) => call[0] === 'git' && (call[1] as string[]).includes('commit'),
      );
      expect(commitCall?.[1]).toEqual(['commit', '-m', 'fix: resolve issue #42']);
    });

    it('uses provided cwd for all git commands', async () => {
      mockSuccess('');
      mockFailure('diff exit 1');
      mockSuccess('');
      mockSuccess('');

      await commitAndPush('ai/PROJ-1-test', 'feat: stuff', '/custom/path');

      for (const call of mockExecFile.mock.calls) {
        expect((call[2] as { cwd: string }).cwd).toBe('/custom/path');
      }
    });
  });
});
