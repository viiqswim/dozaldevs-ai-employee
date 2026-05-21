import { execFile } from 'child_process';
import { describe, it, expect } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../src/worker-tools/jira/search-issues.ts');

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

describe('search-issues shell tool', () => {
  it('mock mode: exits 0 and outputs valid JSON with correct shape', async () => {
    const { stdout, code } = await runScript(['--project', 'PROJ'], { JIRA_MOCK: 'true' });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(Array.isArray(data['issues'])).toBe(true);
    expect(typeof data['total']).toBe('number');
    expect(typeof data['maxResults']).toBe('number');
  });

  it('mock mode: fixture values match expected data', async () => {
    const { stdout, code } = await runScript(['--project', 'PROJ'], { JIRA_MOCK: 'true' });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as {
      issues: Array<{
        key: string;
        summary: string;
        status: string;
        priority: string;
        assignee: string | null;
      }>;
      total: number;
      maxResults: number;
    };
    expect(data.issues).toHaveLength(3);
    expect(data.total).toBe(3);
    expect(data.issues[0]?.key).toBe('PROJ-1');
    expect(data.issues[0]?.status).toBe('In Progress');
    expect(data.issues[2]?.assignee).toBeNull();
  });

  it('exits 1 with --project in stderr when both --project and --jql are missing', async () => {
    const { stderr, code } = await runScript([], {
      JIRA_API_TOKEN: 'tok',
      JIRA_USER_EMAIL: 'user@example.com',
      JIRA_BASE_URL: 'https://example.atlassian.net',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('--project');
  });

  it('exits 1 with JIRA_API_TOKEN in stderr when env var is missing', async () => {
    const { stderr, code } = await runScript(['--project', 'PROJ'], {
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
    expect(stdout).toContain('--project');
    expect(stdout).toContain('--jql');
    expect(stdout).toContain('--status');
    expect(stdout).toContain('--assignee');
    expect(stdout).toContain('JIRA_API_TOKEN');
    expect(stdout).toContain('JIRA_USER_EMAIL');
    expect(stdout).toContain('JIRA_BASE_URL');
  });
});
