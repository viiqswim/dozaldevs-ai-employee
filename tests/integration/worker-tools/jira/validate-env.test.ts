import { execFile } from 'child_process';
import { describe, it, expect } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../../src/worker-tools/jira/validate-env.ts');

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

describe('validate-env (Jira) shell tool', () => {
  it('exits 0 with ok:true when all three required vars are set', async () => {
    const { stdout, code } = await runScript([], {
      JIRA_API_TOKEN: 'test-token',
      JIRA_USER_EMAIL: 'user@example.com',
      JIRA_BASE_URL: 'https://example.atlassian.net',
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('exits 0 with ok:false and full missing array when no vars are set', async () => {
    const { stdout, code } = await runScript([], {
      JIRA_API_TOKEN: '',
      JIRA_USER_EMAIL: '',
      JIRA_BASE_URL: '',
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { ok: boolean; missing: string[] };
    expect(data.ok).toBe(false);
    expect(Array.isArray(data.missing)).toBe(true);
    expect(data.missing).toContain('JIRA_API_TOKEN');
    expect(data.missing).toContain('JIRA_USER_EMAIL');
    expect(data.missing).toContain('JIRA_BASE_URL');
  });

  it('exits 0 with ok:false and only JIRA_USER_EMAIL in missing when that var alone is absent', async () => {
    const { stdout, code } = await runScript([], {
      JIRA_API_TOKEN: 'test-token',
      JIRA_USER_EMAIL: '',
      JIRA_BASE_URL: 'https://example.atlassian.net',
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { ok: boolean; missing: string[] };
    expect(data.ok).toBe(false);
    expect(data.missing).toContain('JIRA_USER_EMAIL');
    expect(data.missing).not.toContain('JIRA_API_TOKEN');
    expect(data.missing).not.toContain('JIRA_BASE_URL');
  });

  it('--help: exits 0 and stdout contains all three env var names', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('JIRA_API_TOKEN');
    expect(stdout).toContain('JIRA_USER_EMAIL');
    expect(stdout).toContain('JIRA_BASE_URL');
  });

  it('exits 0 with ok:true and mode:"oauth" when OAuth vars are set', async () => {
    const { stdout, code } = await runScript([], {
      JIRA_ACCESS_TOKEN: 'eyJhbGciOiJSUzI1NiJ9.test',
      JIRA_CLOUD_ID: 'abc12345-0000-0000-0000-000000000000',
      JIRA_API_TOKEN: '',
      JIRA_USER_EMAIL: '',
      JIRA_BASE_URL: '',
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { ok: boolean; mode: string };
    expect(data.ok).toBe(true);
    expect(data.mode).toBe('oauth');
  });

  it('exits 0 with ok:true and mode:"basic" (not "oauth") when only Basic vars are set', async () => {
    const { stdout, code } = await runScript([], {
      JIRA_ACCESS_TOKEN: '',
      JIRA_CLOUD_ID: '',
      JIRA_API_TOKEN: 'test-token',
      JIRA_USER_EMAIL: 'user@example.com',
      JIRA_BASE_URL: 'https://example.atlassian.net',
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { ok: boolean; mode: string };
    expect(data.ok).toBe(true);
    expect(data.mode).toBe('basic');
  });

  it('exits 0 with ok:true and mode:"oauth" when both OAuth and Basic vars are set (OAuth wins)', async () => {
    const { stdout, code } = await runScript([], {
      JIRA_ACCESS_TOKEN: 'eyJhbGciOiJSUzI1NiJ9.test',
      JIRA_CLOUD_ID: 'abc12345-0000-0000-0000-000000000000',
      JIRA_API_TOKEN: 'test-token',
      JIRA_USER_EMAIL: 'user@example.com',
      JIRA_BASE_URL: 'https://example.atlassian.net',
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as { ok: boolean; mode: string };
    expect(data.ok).toBe(true);
    expect(data.mode).toBe('oauth');
  });
});
