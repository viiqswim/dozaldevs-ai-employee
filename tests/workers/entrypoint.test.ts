import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

describe('entrypoint.sh', () => {
  const entrypointPath = join(process.cwd(), 'src/workers/entrypoint.sh');
  let fileContent: string;

  it('file exists', () => {
    expect(existsSync(entrypointPath)).toBe(true);
  });

  it('has bash shebang', () => {
    fileContent = readFileSync(entrypointPath, 'utf-8');
    expect(fileContent.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('has set -euo pipefail', () => {
    fileContent = readFileSync(entrypointPath, 'utf-8');
    expect(fileContent).toContain('set -euo pipefail');
  });

  it('has all 7 steps', () => {
    fileContent = readFileSync(entrypointPath, 'utf-8');
    for (let i = 1; i <= 7; i++) {
      expect(fileContent).toContain(`[STEP ${i}/7]`);
    }
  });

  it('has idempotency flags', () => {
    fileContent = readFileSync(entrypointPath, 'utf-8');
    expect(fileContent).toContain('step_done');
    expect(fileContent).toContain('mark_step_done');
  });

  it('validates required env vars', () => {
    fileContent = readFileSync(entrypointPath, 'utf-8');
    expect(fileContent).toContain('TASK_ID');
    expect(fileContent).toContain('REPO_URL');
    expect(fileContent).toContain('SUPABASE_URL');
    expect(fileContent).toContain('SUPABASE_SECRET_KEY');
  });

  it('passes bash syntax check', () => {
    expect(() => {
      execSync('bash -n src/workers/entrypoint.sh', { encoding: 'utf-8' });
    }).not.toThrow();
  });

  it('has workspace variable', () => {
    fileContent = readFileSync(entrypointPath, 'utf-8');
    expect(fileContent).toContain('WORKSPACE="/workspace"');
  });
});
