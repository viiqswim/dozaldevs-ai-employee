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

  it('mock mode (default fixture) returns success with non-empty content', () => {
    const result = run(['--page-id', 'test-page'], { NOTION_MOCK: 'true' });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as {
      success: boolean;
      pageId: string;
      content: string;
      blockCount: number;
    };
    expect(output.success).toBe(true);
    expect(output.pageId).toBe('test-page');
    expect(output.content.length).toBeGreaterThan(0);
    expect(typeof output.blockCount).toBe('number');
    expect(output.blockCount).toBeGreaterThan(0);
  });

  it('--fixture trash-schedule loads trash fixture with LUNES', () => {
    const result = run(['--page-id', 'test-page', '--fixture', 'trash-schedule'], {
      NOTION_MOCK: 'true',
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as { success: boolean; content: string };
    expect(output.success).toBe(true);
    expect(output.content).toContain('LUNES');
  });

  it('--fixture cleaning-zones loads zones fixture with ZONA 1', () => {
    const result = run(['--page-id', 'test-page', '--fixture', 'cleaning-zones'], {
      NOTION_MOCK: 'true',
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as { success: boolean; content: string };
    expect(output.success).toBe(true);
    expect(output.content).toContain('ZONA 1');
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
