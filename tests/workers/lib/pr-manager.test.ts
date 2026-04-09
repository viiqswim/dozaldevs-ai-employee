import { vi, describe, it, expect, beforeEach, MockInstance } from 'vitest';
import {
  checkExistingPR,
  createOrUpdatePR,
  buildPRBody,
  buildSuccessPrBody,
  CreateOrUpdatePRParams,
} from '../../../src/workers/lib/pr-manager.js';
import {
  GitHubClient,
  GitHubPR,
  ListPRsParams,
  CreatePRParams,
  GetPRParams,
} from '../../../src/lib/github-client.js';
import { TaskRow } from '../../../src/workers/lib/task-context.js';

type MockGitHubClient = {
  listPRs: MockInstance<(params: ListPRsParams) => Promise<GitHubPR[]>>;
  createPR: MockInstance<(params: CreatePRParams) => Promise<GitHubPR>>;
  getPR: MockInstance<(params: GetPRParams) => Promise<GitHubPR>>;
};

const mockPR: GitHubPR = {
  number: 42,
  title: '[AI] PROJ-123: Fix login bug',
  html_url: 'https://github.com/owner/repo/pull/42',
  head: { ref: 'ai/PROJ-123-fix-login-bug' },
  base: { ref: 'main' },
  state: 'open',
  body: 'PR body content',
};

const mockTask: TaskRow = {
  id: 'task-uuid-1',
  external_id: 'PROJ-123',
  status: 'in_progress',
  triage_result: {
    issue: {
      key: 'PROJ-123',
      fields: {
        summary: 'Fix login bug',
        description: 'Users cannot log in when 2FA is enabled.',
        project: { key: 'PROJ' },
      },
    },
  },
  requirements: null,
  project_id: 'proj-1',
};

function makeMockClient(): MockGitHubClient & GitHubClient {
  return {
    listPRs: vi.fn<(params: ListPRsParams) => Promise<GitHubPR[]>>(),
    createPR: vi.fn<(params: CreatePRParams) => Promise<GitHubPR>>(),
    getPR: vi.fn<(params: GetPRParams) => Promise<GitHubPR>>(),
  };
}

describe('pr-manager', () => {
  describe('checkExistingPR()', () => {
    it('returns null when listPRs returns empty array', async () => {
      const client = makeMockClient();
      client.listPRs.mockResolvedValue([]);

      const result = await checkExistingPR('owner', 'repo', 'ai/PROJ-123-fix-login-bug', client);

      expect(result).toBeNull();
    });

    it('returns first PR when listPRs returns a match', async () => {
      const client = makeMockClient();
      client.listPRs.mockResolvedValue([mockPR]);

      const result = await checkExistingPR('owner', 'repo', 'ai/PROJ-123-fix-login-bug', client);

      expect(result).toEqual(mockPR);
    });

    it('returns first PR when multiple PRs exist', async () => {
      const client = makeMockClient();
      const secondPR = { ...mockPR, number: 99 };
      client.listPRs.mockResolvedValue([mockPR, secondPR]);

      const result = await checkExistingPR('owner', 'repo', 'ai/PROJ-123-fix-login-bug', client);

      expect(result).toEqual(mockPR);
    });

    it('calls listPRs with owner:branch format for head filter', async () => {
      const client = makeMockClient();
      client.listPRs.mockResolvedValue([]);

      await checkExistingPR('myowner', 'myrepo', 'ai/PROJ-123-fix-login-bug', client);

      expect(client.listPRs).toHaveBeenCalledWith({
        owner: 'myowner',
        repo: 'myrepo',
        state: 'open',
        head: 'myowner:ai/PROJ-123-fix-login-bug',
      });
    });

    it('propagates network errors from listPRs', async () => {
      const client = makeMockClient();
      client.listPRs.mockRejectedValue(new Error('Network failure'));

      await expect(
        checkExistingPR('owner', 'repo', 'ai/PROJ-123-fix-login-bug', client),
      ).rejects.toThrow('Network failure');
    });
  });

  describe('createOrUpdatePR()', () => {
    let baseParams: CreateOrUpdatePRParams;

    beforeEach(() => {
      baseParams = {
        owner: 'owner',
        repo: 'repo',
        headBranch: 'ai/PROJ-123-fix-login-bug',
        base: 'main',
        ticketId: 'PROJ-123',
        summary: 'Fix login bug',
        task: mockTask,
        executionId: 'exec-abc-123',
      };
    });

    it('does NOT call createPR when existing PR is found', async () => {
      const client = makeMockClient();
      client.listPRs.mockResolvedValue([mockPR]);

      await createOrUpdatePR(baseParams, client);

      expect(client.createPR).not.toHaveBeenCalled();
    });

    it('returns existing PR with wasExisting=true when PR found', async () => {
      const client = makeMockClient();
      client.listPRs.mockResolvedValue([mockPR]);

      const result = await createOrUpdatePR(baseParams, client);

      expect(result.pr).toEqual(mockPR);
      expect(result.wasExisting).toBe(true);
    });

    it('calls createPR when no existing PR found', async () => {
      const client = makeMockClient();
      client.listPRs.mockResolvedValue([]);
      client.createPR.mockResolvedValue(mockPR);

      await createOrUpdatePR(baseParams, client);

      expect(client.createPR).toHaveBeenCalledTimes(1);
    });

    it('uses correct title format [AI] <ticketId>: <summary>', async () => {
      const client = makeMockClient();
      client.listPRs.mockResolvedValue([]);
      client.createPR.mockResolvedValue(mockPR);

      await createOrUpdatePR(baseParams, client);

      expect(client.createPR.mock.calls[0][0].title).toBe('[AI] PROJ-123: Fix login bug');
    });

    it('returns new PR with wasExisting=false when created', async () => {
      const client = makeMockClient();
      client.listPRs.mockResolvedValue([]);
      client.createPR.mockResolvedValue(mockPR);

      const result = await createOrUpdatePR(baseParams, client);

      expect(result.pr).toEqual(mockPR);
      expect(result.wasExisting).toBe(false);
    });

    it('calls createPR with correct owner, repo, head, base', async () => {
      const client = makeMockClient();
      client.listPRs.mockResolvedValue([]);
      client.createPR.mockResolvedValue(mockPR);

      await createOrUpdatePR(baseParams, client);

      const callArgs = client.createPR.mock.calls[0][0];
      expect(callArgs.owner).toBe('owner');
      expect(callArgs.repo).toBe('repo');
      expect(callArgs.head).toBe('ai/PROJ-123-fix-login-bug');
      expect(callArgs.base).toBe('main');
    });

    it('propagates network errors from createPR', async () => {
      const client = makeMockClient();
      client.listPRs.mockResolvedValue([]);
      client.createPR.mockRejectedValue(new Error('GitHub API error'));

      await expect(createOrUpdatePR(baseParams, client)).rejects.toThrow('GitHub API error');
    });
  });

  describe('buildPRBody()', () => {
    it('includes ticket ID in the output', () => {
      const body = buildPRBody(mockTask, null);
      expect(body).toContain('PROJ-123');
    });

    it('includes summary in the output', () => {
      const body = buildPRBody(mockTask, null);
      expect(body).toContain('Fix login bug');
    });

    it('includes description (first 500 chars) when available', () => {
      const body = buildPRBody(mockTask, null);
      expect(body).toContain('Users cannot log in when 2FA is enabled.');
    });

    it('includes execution ID when provided', () => {
      const body = buildPRBody(mockTask, 'exec-xyz-789');
      expect(body).toContain('exec-xyz-789');
    });

    it('omits execution ID section when executionId is null', () => {
      const body = buildPRBody(mockTask, null);
      expect(body).not.toContain('Execution ID');
    });

    it('truncates description to 500 characters', () => {
      const longDescription = 'A'.repeat(1000);
      const taskWithLongDesc: TaskRow = {
        ...mockTask,
        triage_result: {
          issue: {
            fields: {
              summary: 'Long desc task',
              description: longDescription,
            },
          },
        },
      };

      const body = buildPRBody(taskWithLongDesc, null);
      expect(body).toContain('A'.repeat(500));
      expect(body).not.toContain('A'.repeat(501));
    });

    it('handles missing triage_result gracefully', () => {
      const taskNoTriage: TaskRow = {
        ...mockTask,
        triage_result: null,
      };

      expect(() => buildPRBody(taskNoTriage, null)).not.toThrow();
      const body = buildPRBody(taskNoTriage, null);
      expect(body).toContain('PROJ-123');
    });
  });

  describe('buildSuccessPrBody()', () => {
    const baseOpts = {
      ticketKey: 'PROJ-123',
      ticketSummary: 'Fix login bug',
      diffStats: '3 files changed, 42 insertions(+), 7 deletions(-)',
      waveStates: [
        { number: 1, status: 'completed' },
        { number: 2, status: 'completed' },
        { number: 3, status: 'failed' },
      ],
      testCount: 520,
      branchName: 'ai/PROJ-123-fix-login-bug',
      commitLog: 'abc1234 fix: resolve login issue\ndef5678 test: add coverage',
    };

    it('contains ## Summary section header', () => {
      const body = buildSuccessPrBody(baseOpts);
      expect(body).toContain('## Summary');
    });

    it('contains ## Ticket section header', () => {
      const body = buildSuccessPrBody(baseOpts);
      expect(body).toContain('## Ticket');
    });

    it('contains ## Changes section header', () => {
      const body = buildSuccessPrBody(baseOpts);
      expect(body).toContain('## Changes');
    });

    it('contains ## Waves Completed section header', () => {
      const body = buildSuccessPrBody(baseOpts);
      expect(body).toContain('## Waves Completed');
    });

    it('contains ## Testing section header', () => {
      const body = buildSuccessPrBody(baseOpts);
      expect(body).toContain('## Testing');
    });

    it('contains ## How to Verify section header', () => {
      const body = buildSuccessPrBody(baseOpts);
      expect(body).toContain('## How to Verify');
    });

    it('contains ## Commit Log section header', () => {
      const body = buildSuccessPrBody(baseOpts);
      expect(body).toContain('## Commit Log');
    });

    it('marks completed waves with checkmark and failed waves with X', () => {
      const body = buildSuccessPrBody(baseOpts);
      expect(body).toContain('Wave 1: ✅');
      expect(body).toContain('Wave 2: ✅');
      expect(body).toContain('Wave 3: ❌');
    });

    it('includes test count in testing section', () => {
      const body = buildSuccessPrBody(baseOpts);
      expect(body).toContain('520 tests passed');
    });

    it('includes branch name in how to verify section', () => {
      const body = buildSuccessPrBody(baseOpts);
      expect(body).toContain('ai/PROJ-123-fix-login-bug');
    });
  });
});
