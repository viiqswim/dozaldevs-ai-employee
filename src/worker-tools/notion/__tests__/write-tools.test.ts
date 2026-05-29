import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..', '..', '..', '..');
const tsx = join(projectRoot, 'node_modules', '.bin', 'tsx');
const appendScript = join(__dirname, '..', 'append-blocks.ts');
const updateScript = join(__dirname, '..', 'update-block.ts');

function run(
  script: string,
  args: string[],
  envOverrides: Record<string, string | undefined> = {},
) {
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

describe('append-blocks.ts', () => {
  it('--help exits 0 with usage text', () => {
    const result = run(appendScript, ['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--page-id');
    expect(result.stdout).toContain('--content');
  });

  it('mock mode returns { success: true, blocksAdded: 1 }', () => {
    const result = run(appendScript, [], { NOTION_MOCK: 'true' });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as { success: boolean; blocksAdded: number };
    expect(output.success).toBe(true);
    expect(output.blocksAdded).toBe(1);
  });

  it('missing --page-id exits 1 with error message', () => {
    const result = run(appendScript, []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--page-id is required');
  });

  it('missing --content exits 1 when --page-id is provided', () => {
    const result = run(appendScript, ['--page-id', 'test-page']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--content is required');
  });
});

describe('update-block.ts', () => {
  it('--help exits 0 with usage text', () => {
    const result = run(updateScript, ['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--block-id');
    expect(result.stdout).toContain('--content');
  });

  it('mock mode without --block-id returns blockId "unknown"', () => {
    const result = run(updateScript, [], { NOTION_MOCK: 'true' });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as { success: boolean; blockId: string };
    expect(output.success).toBe(true);
    expect(output.blockId).toBe('unknown');
  });

  it('mock mode with --block-id returns the provided blockId', () => {
    const result = run(updateScript, ['--block-id', 'fake-id'], { NOTION_MOCK: 'true' });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as { success: boolean; blockId: string };
    expect(output.success).toBe(true);
    expect(output.blockId).toBe('fake-id');
  });

  it('missing --block-id exits 1 with error message', () => {
    const result = run(updateScript, []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--block-id is required');
  });

  it('missing --content exits 1 when --block-id is provided', () => {
    const result = run(updateScript, ['--block-id', 'test-block']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--content is required');
  });
});
