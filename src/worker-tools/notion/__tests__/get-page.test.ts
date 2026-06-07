import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..', '..', '..', '..');
const tsx = join(projectRoot, 'node_modules', '.bin', 'tsx');
const script = join(__dirname, '..', 'get-page.ts');

function run(args: string[], envOverrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env['NOTION_MOCK'];
  delete env['NOTION_ACCESS_TOKEN'];
  delete env['NOTION_API_KEY'];
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) {
      delete env[k];
    } else {
      env[k] = v;
    }
  }
  return spawnSync(tsx, [script, ...args], { env, encoding: 'utf8', timeout: 15000 });
}

describe('get-page.ts', () => {
  it('--help exits 0 with usage text', () => {
    const result = run(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--page-id');
  });

  it('missing --page-id exits 1 with error message', () => {
    const result = run([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--page-id is required');
  });

  it('missing credentials exits 1 with helpful error', () => {
    const result = run(['--page-id', 'test-page']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('credentials');
  });
});
