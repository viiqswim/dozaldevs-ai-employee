import { execFile } from 'child_process';
import fs from 'fs';
import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../../src/worker-tools/platform/submit-output.ts');
const OUTPUT_PATH = '/tmp/summary.txt';

function runScript(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'npx',
      ['tsx', SCRIPT_PATH, ...args],
      { env: { ...process.env } },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr, code: err ? ((err.code as number) ?? 1) : 0 });
      },
    );
  });
}

afterEach(() => {
  if (fs.existsSync(OUTPUT_PATH)) {
    fs.unlinkSync(OUTPUT_PATH);
  }
});

describe('submit-output — CLI behavior', () => {
  it('1. --help exits 0 and prints usage containing NEEDS_APPROVAL', async () => {
    const { stdout, code } = await runScript(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('NEEDS_APPROVAL');
  });

  it('2. Missing --summary exits 1 with stderr containing "required"', async () => {
    const { stderr, code } = await runScript(['--classification', 'NEEDS_APPROVAL']);
    expect(code).toBe(1);
    expect(stderr.toLowerCase()).toContain('required');
  });

  it('3. Missing --classification exits 1 with stderr containing "required"', async () => {
    const { stderr, code } = await runScript(['--summary', 'Task done']);
    expect(code).toBe(1);
    expect(stderr.toLowerCase()).toContain('required');
  });

  it('4. Invalid --classification value exits 1 with stderr containing valid values', async () => {
    const { stderr, code } = await runScript([
      '--summary',
      'Task done',
      '--classification',
      'INVALID_VALUE',
    ]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/NEEDS_APPROVAL|NO_ACTION_NEEDED/);
  });

  it('5. Valid invocation (required flags only) exits 0 and writes correct JSON to /tmp/summary.txt', async () => {
    const { code } = await runScript([
      '--summary',
      'Task completed successfully',
      '--classification',
      'NO_ACTION_NEEDED',
    ]);
    expect(code).toBe(0);
    expect(fs.existsSync(OUTPUT_PATH)).toBe(true);
    const raw = fs.readFileSync(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['summary']).toBe('Task completed successfully');
    expect(parsed['classification']).toBe('NO_ACTION_NEEDED');
  });

  it('6. Valid invocation with ALL optional flags exits 0 and all fields appear in /tmp/summary.txt', async () => {
    const { code } = await runScript([
      '--summary',
      'Full output test',
      '--classification',
      'NEEDS_APPROVAL',
      '--draft',
      'Draft reply text',
      '--confidence',
      '0.85',
      '--reasoning',
      'High confidence based on context',
      '--urgency',
      '--metadata',
      '{"key":"value","count":3}',
    ]);
    expect(code).toBe(0);
    expect(fs.existsSync(OUTPUT_PATH)).toBe(true);
    const raw = fs.readFileSync(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['summary']).toBe('Full output test');
    expect(parsed['classification']).toBe('NEEDS_APPROVAL');
    expect(parsed['draft']).toBe('Draft reply text');
    expect(parsed['confidence']).toBe(0.85);
    expect(parsed['reasoning']).toBe('High confidence based on context');
    expect(parsed['urgency']).toBe(true);
    expect(parsed['metadata']).toEqual({ key: 'value', count: 3 });
  });

  it('7. --confidence 1.5 (out-of-range) exits 1 with stderr containing "confidence"', async () => {
    const { stderr, code } = await runScript([
      '--summary',
      'Task done',
      '--classification',
      'NEEDS_APPROVAL',
      '--confidence',
      '1.5',
    ]);
    expect(code).toBe(1);
    expect(stderr.toLowerCase()).toContain('confidence');
  });

  it('8. Special characters in --summary are preserved correctly in /tmp/summary.txt', async () => {
    const { code } = await runScript([
      '--summary',
      'He said "hello"',
      '--classification',
      'NO_ACTION_NEEDED',
    ]);
    expect(code).toBe(0);
    expect(fs.existsSync(OUTPUT_PATH)).toBe(true);
    const raw = fs.readFileSync(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['summary']).toBe('He said "hello"');
  });
});
