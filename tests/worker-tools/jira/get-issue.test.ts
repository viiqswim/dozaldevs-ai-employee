import { execFile } from 'child_process';
import { describe, it, expect } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../src/worker-tools/jira/get-issue.ts');

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

describe('get-issue shell tool', () => {
  it('mock mode: exits 0 and outputs valid JSON with correct shape', async () => {
    const { stdout, code } = await runScript(['--issue-key', 'PROJ-1'], { JIRA_MOCK: 'true' });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(typeof data['id']).toBe('string');
    expect(typeof data['key']).toBe('string');
    expect(typeof data['summary']).toBe('string');
    expect(typeof data['description']).toBe('string');
    expect(typeof data['status']).toBe('string');
    expect(typeof data['priority']).toBe('string');
    expect(Array.isArray(data['labels'])).toBe(true);
    expect(typeof data['created']).toBe('string');
    expect(typeof data['updated']).toBe('string');
    expect(data['project']).toBeDefined();
  });

  it('mock mode: fixture values match expected data', async () => {
    const { stdout, code } = await runScript(['--issue-key', 'PROJ-1'], { JIRA_MOCK: 'true' });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(data['key']).toBe('PROJ-1');
    expect(data['id']).toBe('10042');
    expect(data['status']).toBe('In Progress');
    expect(data['assignee']).toBe('Alice Johnson');
    const project = data['project'] as Record<string, string>;
    expect(project['key']).toBe('PROJ');
  });

  it('exits 1 with --issue-key in stderr when flag is missing', async () => {
    const { stderr, code } = await runScript([], {
      JIRA_API_TOKEN: 'tok',
      JIRA_USER_EMAIL: 'user@example.com',
      JIRA_BASE_URL: 'https://example.atlassian.net',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('--issue-key');
  });

  it('exits 1 with JIRA_API_TOKEN in stderr when env var is missing', async () => {
    const { stderr, code } = await runScript(['--issue-key', 'PROJ-1'], {
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
    expect(stdout).toContain('JIRA_API_TOKEN');
    expect(stdout).toContain('JIRA_USER_EMAIL');
    expect(stdout).toContain('JIRA_BASE_URL');
  });
});
