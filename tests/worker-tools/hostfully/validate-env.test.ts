import { execFile } from 'child_process';
import { describe, it, expect } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../dist/worker-tools/hostfully/validate-env.js');

function runScript(
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile('node', [SCRIPT_PATH], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolve({
        stdout,
        stderr,
        code: err ? ((err.code as number) ?? 1) : 0,
      });
    });
  });
}

describe('validate-env shell tool', () => {
  it('exits 0 and outputs ok:true when both vars are set', async () => {
    const { stdout, code } = await runScript({
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_AGENCY_UID: 'testuid',
    });
    expect(code).toBe(0);
    expect(stdout).toContain('"ok":true');
  });

  it('exits 1 with HOSTFULLY_API_KEY error when API key is missing', async () => {
    const { stderr, code } = await runScript({
      HOSTFULLY_AGENCY_UID: 'testuid',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_API_KEY');
  });

  it('exits 1 with HOSTFULLY_AGENCY_UID error when agency UID is missing', async () => {
    const { stderr, code } = await runScript({
      HOSTFULLY_API_KEY: 'testkey',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_AGENCY_UID');
  });

  it('exits 1 mentioning HOSTFULLY_API_KEY first when both vars are missing', async () => {
    const { stderr, code } = await runScript({});
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_API_KEY');
  });

  it('exits 1 when HOSTFULLY_API_KEY is an empty string', async () => {
    const { stderr, code } = await runScript({
      HOSTFULLY_API_KEY: '',
      HOSTFULLY_AGENCY_UID: 'testuid',
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_API_KEY');
  });
});
