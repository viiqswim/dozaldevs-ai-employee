import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

const { pushBetweenWaves } = await import('../../../src/workers/lib/between-wave-push.js');
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

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
};

describe('between-wave-push', () => {
  beforeEach(() => {
    mockExecFile.mockClear();
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    mockExecFile.mockClear();
  });

  it('commits and pushes when changes exist', async () => {
    // status --porcelain returns changes
    mockSuccess('M src/file.ts\n');
    // add -A succeeds
    mockSuccess();
    // commit succeeds
    mockSuccess();
    // rev-parse HEAD returns SHA
    mockSuccess('abc123def456\n');
    // push succeeds
    mockSuccess();

    const result = await pushBetweenWaves({
      repoRoot: '/workspace',
      branchName: 'ai/TEST-1-feature',
      waveNumber: 1,
      waveDescription: 'initial implementation',
      logger: mockLogger as any,
    });

    expect(result.pushed).toBe(true);
    expect(result.commitSha).toBe('abc123def456');
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ wave: 1, commitSha: 'abc123def456' }),
      expect.any(String),
    );
  });

  it('skips commit when no changes exist', async () => {
    // status --porcelain returns empty
    mockSuccess('');

    const result = await pushBetweenWaves({
      repoRoot: '/workspace',
      branchName: 'ai/TEST-1-feature',
      waveNumber: 2,
      waveDescription: 'no changes',
      logger: mockLogger as any,
    });

    expect(result.pushed).toBe(false);
    expect(result.commitSha).toBeNull();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ wave: 2 }),
      expect.stringContaining('no changes'),
    );
    // Only status call should have been made
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('uses correct commit message format with wave number', async () => {
    mockSuccess('M src/file.ts\n');
    mockSuccess();
    mockSuccess();
    mockSuccess('sha789\n');
    mockSuccess();

    await pushBetweenWaves({
      repoRoot: '/workspace',
      branchName: 'ai/TEST-1-feature',
      waveNumber: 3,
      waveDescription: 'add validation logic',
      logger: mockLogger as any,
    });

    // Find the commit call
    const commitCall = mockExecFile.mock.calls.find((call) => call[1]?.includes('commit'));
    expect(commitCall).toBeDefined();
    expect(commitCall![1]).toContain('-m');
    const messageIndex = commitCall![1]!.indexOf('-m') + 1;
    const message = commitCall![1]![messageIndex];
    expect(message).toMatch(/^feat\(wave-3\):/);
    expect(message).toContain('add validation logic');
  });

  it('uses --force-with-lease flag (not --force)', async () => {
    mockSuccess('M src/file.ts\n');
    mockSuccess();
    mockSuccess();
    mockSuccess('sha789\n');
    mockSuccess();

    await pushBetweenWaves({
      repoRoot: '/workspace',
      branchName: 'ai/TEST-1-feature',
      waveNumber: 1,
      waveDescription: 'test',
      logger: mockLogger as any,
    });

    // Find the push call
    const pushCall = mockExecFile.mock.calls.find((call) => call[1]?.includes('push'));
    expect(pushCall).toBeDefined();
    expect(pushCall![1]).toContain('--force-with-lease');
    expect(pushCall![1]).not.toContain('--force');
  });

  it('does not use --no-verify flag in commit', async () => {
    mockSuccess('M src/file.ts\n');
    mockSuccess();
    mockSuccess();
    mockSuccess('sha789\n');
    mockSuccess();

    await pushBetweenWaves({
      repoRoot: '/workspace',
      branchName: 'ai/TEST-1-feature',
      waveNumber: 1,
      waveDescription: 'test',
      logger: mockLogger as any,
    });

    // Find the commit call
    const commitCall = mockExecFile.mock.calls.find((call) => call[1]?.includes('commit'));
    expect(commitCall).toBeDefined();
    expect(commitCall![1]).not.toContain('--no-verify');
  });

  it('throws on git error and logs error', async () => {
    mockSuccess('M src/file.ts\n');
    mockFailure('permission denied');

    await expect(
      pushBetweenWaves({
        repoRoot: '/workspace',
        branchName: 'ai/TEST-1-feature',
        waveNumber: 1,
        waveDescription: 'test',
        logger: mockLogger as any,
      }),
    ).rejects.toThrow('permission denied');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ wave: 1 }),
      expect.any(String),
    );
  });
});
