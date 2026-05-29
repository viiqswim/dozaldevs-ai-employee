import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..', '..', '..', '..');
const tsx = join(projectRoot, 'node_modules', '.bin', 'tsx');
const script = join(__dirname, '..', 'validate-env.ts');

function run(args: string[], envOverrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env['NOTION_ACCESS_TOKEN'];
  delete env['NOTION_API_KEY'];
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) {
      delete env[k];
    } else {
      env[k] = v;
    }
  }
  return spawnSync(tsx, [script, ...args], { env, encoding: 'utf8', timeout: 10000 });
}

describe('validate-env.ts', () => {
  it('--help exits 0 with usage text', () => {
    const result = run(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('NOTION_ACCESS_TOKEN');
    expect(result.stdout).toContain('NOTION_API_KEY');
  });

  it('OAuth mode: NOTION_ACCESS_TOKEN set → { ok: true, mode: "oauth" }', () => {
    const result = run([], { NOTION_ACCESS_TOKEN: 'secret-token' });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as {
      ok: boolean;
      mode: string;
      vars: Record<string, boolean>;
    };
    expect(output.ok).toBe(true);
    expect(output.mode).toBe('oauth');
    expect(output.vars['NOTION_ACCESS_TOKEN']).toBe(true);
    expect(output.vars['NOTION_API_KEY']).toBe(false);
  });

  it('API key mode: NOTION_API_KEY set → { ok: true, mode: "api_key" }', () => {
    const result = run([], { NOTION_API_KEY: 'ntn_test_key' });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as {
      ok: boolean;
      mode: string;
      vars: Record<string, boolean>;
    };
    expect(output.ok).toBe(true);
    expect(output.mode).toBe('api_key');
    expect(output.vars['NOTION_ACCESS_TOKEN']).toBe(false);
    expect(output.vars['NOTION_API_KEY']).toBe(true);
  });

  it('no credentials → { ok: false, mode: "none" }', () => {
    const result = run([]);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as {
      ok: boolean;
      mode: string;
      vars: Record<string, boolean>;
    };
    expect(output.ok).toBe(false);
    expect(output.mode).toBe('none');
    expect(output.vars['NOTION_ACCESS_TOKEN']).toBe(false);
    expect(output.vars['NOTION_API_KEY']).toBe(false);
  });

  it('always exits 0 regardless of credential state', () => {
    const noCredsResult = run([]);
    const oauthResult = run([], { NOTION_ACCESS_TOKEN: 'tok' });
    const apiKeyResult = run([], { NOTION_API_KEY: 'key' });
    expect(noCredsResult.status).toBe(0);
    expect(oauthResult.status).toBe(0);
    expect(apiKeyResult.status).toBe(0);
  });
});
