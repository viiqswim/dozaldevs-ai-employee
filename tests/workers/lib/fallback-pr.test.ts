import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

const { createFallbackPr } = await import('../../../src/workers/lib/fallback-pr.js');
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

const makeLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
  fatal: vi.fn(),
  trace: vi.fn(),
  silent: vi.fn(),
  level: 'info',
});

const makePrClient = (prUrl = 'https://github.com/owner/repo/pull/42') => ({
  createPullRequest: vi.fn().mockResolvedValue({
    number: 42,
    html_url: prUrl,
    title: '[DRAFT] TEST-1: Test ticket',
    state: 'open',
    head: { ref: 'ai/TEST-1-test-ticket' },
    base: { ref: 'main' },
  }),
});

const TICKET = {
  key: 'TEST-1',
  summary: 'Test ticket',
  description: 'A test ticket description',
};

const BRANCH = 'ai/TEST-1-test-ticket';

function buildOpts(overrides: Partial<Parameters<typeof createFallbackPr>[0]> = {}) {
  return {
    githubClient: makePrClient(),
    repoOwner: 'owner',
    repoName: 'repo',
    branchName: BRANCH,
    ticket: TICKET,
    completedWaves: [1, 2],
    failedWave: 3,
    error: new Error('Wave 3 timed out'),
    logger: makeLogger() as never,
    repoRoot: '/workspace',
    ...overrides,
  };
}

describe('createFallbackPr()', () => {
  beforeEach(() => {
    mockExecFile.mockClear();
  });

  it('returns { created: false } when git diff shows no changes', async () => {
    mockSuccess('');

    const result = await createFallbackPr(buildOpts());

    expect(result.created).toBe(false);
    expect(result.prUrl).toBeNull();
    expect(result.reason).toBe('no changes to preserve');
  });

  it('does not call createPullRequest when there are no changes', async () => {
    mockSuccess('');
    const githubClient = makePrClient();

    await createFallbackPr(buildOpts({ githubClient }));

    expect(githubClient.createPullRequest).not.toHaveBeenCalled();
  });

  it('creates a draft PR and returns { created: true, prUrl } on happy path', async () => {
    mockSuccess('src/foo.ts\nsrc/bar.ts');
    mockSuccess('abc123\trefs/heads/ai/TEST-1-test-ticket');
    mockSuccess('src/foo.ts | 10 ++++\n1 file changed');
    mockSuccess('abc123 feat: add foo');

    const result = await createFallbackPr(buildOpts());

    expect(result.created).toBe(true);
    expect(result.prUrl).toBe('https://github.com/owner/repo/pull/42');
    expect(result.reason).toBe('draft PR created');
  });

  it('pushes branch with --force-with-lease when branch is not on remote', async () => {
    mockSuccess('src/foo.ts');
    mockSuccess('');
    mockSuccess('');
    mockSuccess('src/foo.ts | 5 +++++');
    mockSuccess('abc123 feat: add foo');

    await createFallbackPr(buildOpts());

    const pushCall = mockExecFile.mock.calls.find(
      (call) => call[0] === 'git' && (call[1] as string[]).includes('push'),
    );
    expect(pushCall?.[1]).toContain('--force-with-lease');
    expect(pushCall?.[1]).not.toContain('--force');
    expect(pushCall?.[1]).toContain(BRANCH);
  });

  it('does not push when branch already exists on remote', async () => {
    mockSuccess('src/foo.ts');
    mockSuccess('abc123\trefs/heads/ai/TEST-1-test-ticket');
    mockSuccess('src/foo.ts | 10 +');
    mockSuccess('abc123 feat: foo');

    await createFallbackPr(buildOpts());

    const pushCall = mockExecFile.mock.calls.find(
      (call) => call[0] === 'git' && (call[1] as string[]).includes('push'),
    );
    expect(pushCall).toBeUndefined();
  });

  it('calls createPullRequest with labels: ["agent-failure"]', async () => {
    mockSuccess('src/foo.ts');
    mockSuccess('abc123\trefs/heads/ai/TEST-1-test-ticket');
    mockSuccess('src/foo.ts | 10 +');
    mockSuccess('abc123 feat: foo');

    const githubClient = makePrClient();
    await createFallbackPr(buildOpts({ githubClient }));

    expect(githubClient.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['agent-failure'] }),
    );
  });

  it('calls createPullRequest with draft: true', async () => {
    mockSuccess('src/foo.ts');
    mockSuccess('abc123\trefs/heads/ai/TEST-1-test-ticket');
    mockSuccess('src/foo.ts | 10 +');
    mockSuccess('abc123 feat: foo');

    const githubClient = makePrClient();
    await createFallbackPr(buildOpts({ githubClient }));

    expect(githubClient.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true }),
    );
  });

  it('PR body includes all required sections', async () => {
    mockSuccess('src/foo.ts');
    mockSuccess('abc123\trefs/heads/ai/TEST-1-test-ticket');
    mockSuccess('src/foo.ts | 10 +');
    mockSuccess('abc123 feat: foo');

    const githubClient = makePrClient();
    await createFallbackPr(buildOpts({ githubClient }));

    const body = (githubClient.createPullRequest.mock.calls[0][0] as { body: string }).body;
    expect(body).toContain('Agent Failure');
    expect(body).toContain('Waves Completed');
    expect(body).toContain('Wave That Failed');
    expect(body).toContain('Error Details');
    expect(body).toContain('Diff Stats');
    expect(body).toContain('Commit Log');
    expect(body).toContain('Next Steps');
  });

  it('includes completed waves as checkmarks in PR body', async () => {
    mockSuccess('src/foo.ts');
    mockSuccess('abc123\trefs/heads/ai/TEST-1-test-ticket');
    mockSuccess('');
    mockSuccess('');

    const githubClient = makePrClient();
    await createFallbackPr(buildOpts({ githubClient, completedWaves: [1, 2, 3] }));

    const body = (githubClient.createPullRequest.mock.calls[0][0] as { body: string }).body;
    expect(body).toContain('- [x] Wave 1');
    expect(body).toContain('- [x] Wave 2');
    expect(body).toContain('- [x] Wave 3');
  });

  it('shows "None" in Waves Completed when completedWaves is empty', async () => {
    mockSuccess('src/foo.ts');
    mockSuccess('abc123\trefs/heads/ai/TEST-1-test-ticket');
    mockSuccess('');
    mockSuccess('');

    const githubClient = makePrClient();
    await createFallbackPr(buildOpts({ githubClient, completedWaves: [] }));

    const body = (githubClient.createPullRequest.mock.calls[0][0] as { body: string }).body;
    expect(body).toContain('None');
  });

  it('shows "N/A" in Wave That Failed when failedWave is null', async () => {
    mockSuccess('src/foo.ts');
    mockSuccess('abc123\trefs/heads/ai/TEST-1-test-ticket');
    mockSuccess('');
    mockSuccess('');

    const githubClient = makePrClient();
    await createFallbackPr(buildOpts({ githubClient, failedWave: null, error: null }));

    const body = (githubClient.createPullRequest.mock.calls[0][0] as { body: string }).body;
    expect(body).toContain('N/A');
  });

  it('truncates error details to 2000 chars', async () => {
    mockSuccess('src/foo.ts');
    mockSuccess('abc123\trefs/heads/ai/TEST-1-test-ticket');
    mockSuccess('');
    mockSuccess('');

    const longMessage = 'x'.repeat(5000);
    const longError = new Error(longMessage);
    longError.stack = longMessage;
    const githubClient = makePrClient();
    await createFallbackPr(buildOpts({ githubClient, error: longError }));

    const body = (githubClient.createPullRequest.mock.calls[0][0] as { body: string }).body;
    const errorSection = body.split('### Error Details')[1].split('### Diff Stats')[0];
    const truncatedContent = errorSection.replace(/```/g, '').trim();
    expect(truncatedContent.length).toBeLessThanOrEqual(2000);
  });

  it('falls back to origin/HEAD when origin/main is unavailable', async () => {
    mockFailure('unknown revision origin/main');
    mockSuccess('src/changed.ts');
    mockSuccess('abc123\trefs/heads/ai/TEST-1-test-ticket');
    mockSuccess('');
    mockSuccess('');

    const githubClient = makePrClient();
    const result = await createFallbackPr(buildOpts({ githubClient }));

    expect(result.created).toBe(true);
  });
});
