import { execFile } from 'child_process';
import { describe, it, expect } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../src/worker-tools/jira/add-comment.ts');

function runScript(
  args: string[],
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'npx',
      ['tsx', SCRIPT_PATH, ...args],
      { env: { ...process.env, ...env } },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr, code: err ? ((err.code as number) ?? 1) : 0 });
      },
    );
  });
}

describe('add-comment shell tool', () => {
  it('mock mode: exits 0 and outputs valid JSON with id, body, and created fields', async () => {
    const { stdout, code } = await runScript(['--issue-key', 'PROJ-1', '--body', 'Test comment'], {
      JIRA_MOCK: 'true',
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(typeof data['id']).toBe('string');
    expect(typeof data['body']).toBe('string');
    expect(typeof data['created']).toBe('string');
  });

  it('mock mode: fixture values match expected data', async () => {
    const { stdout, code } = await runScript(['--issue-key', 'PROJ-1', '--body', 'Test comment'], {
      JIRA_MOCK: 'true',
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { id: string; body: string; created: string };
    expect(data.id).toBe('10101');
    expect(typeof data.body).toBe('string');
    expect(data.body.length).toBeGreaterThan(0);
    expect(data.created).toBe('2026-05-21T10:00:00.000+0000');
  });

  it('exits 1 with --issue-key in stderr when flag is missing', async () => {
    const { stderr, code } = await runScript(['--body', 'Some text'], {
      JIRA_API_TOKEN: 'tok',
      JIRA_USER_EMAIL: 'user@example.com',
      JIRA_BASE_URL: 'https://example.atlassian.net',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('--issue-key');
  });

  it('exits 1 with --body in stderr when body flag is missing', async () => {
    const { stderr, code } = await runScript(['--issue-key', 'PROJ-1'], {
      JIRA_API_TOKEN: 'tok',
      JIRA_USER_EMAIL: 'user@example.com',
      JIRA_BASE_URL: 'https://example.atlassian.net',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('--body');
  });

  it('exits 1 with JIRA_API_TOKEN in stderr when env var is missing', async () => {
    const { stderr, code } = await runScript(['--issue-key', 'PROJ-1', '--body', 'comment'], {
      JIRA_API_TOKEN: '',
      JIRA_USER_EMAIL: 'user@example.com',
      JIRA_BASE_URL: 'https://example.atlassian.net',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('JIRA_API_TOKEN');
  });

  it('--help: exits 0 and stdout contains flag and env var names', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('--issue-key');
    expect(stdout).toContain('--body');
    expect(stdout).toContain('JIRA_API_TOKEN');
    expect(stdout).toContain('JIRA_USER_EMAIL');
    expect(stdout).toContain('JIRA_BASE_URL');
  });
});
