import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const HARNESS_SOURCE_PATH = join(import.meta.dirname, '../../src/workers/opencode-harness.mts');

describe('opencode-harness — task_status_log inserts (source inspection)', () => {
  let sourceCode: string;

  sourceCode = readFileSync(HARNESS_SOURCE_PATH, 'utf8');

  it('contains at least 2 task_status_log post calls', () => {
    const occurrences = (sourceCode.match(/task_status_log/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('inserts Delivering→Done status log entry', () => {
    expect(sourceCode).toContain("from_status: 'Delivering'");
    expect(sourceCode).toContain("to_status: 'Done'");
    expect(sourceCode).toContain("actor: 'opencode_harness'");
  });

  it('inserts Delivering→Failed status log entry in markFailed', () => {
    expect(sourceCode).toContain("to_status: 'Failed'");
    expect(sourceCode).toContain("actor: 'opencode_harness'");
  });

  it('Done insert is wrapped in try/catch (non-fatal)', () => {
    const doneInsertIdx = sourceCode.indexOf("to_status: 'Done'");
    expect(doneInsertIdx).toBeGreaterThan(-1);

    const before = sourceCode.slice(Math.max(0, doneInsertIdx - 200), doneInsertIdx);
    expect(before).toContain('try {');

    const after = sourceCode.slice(doneInsertIdx, doneInsertIdx + 300);
    expect(after).toContain('catch (err)');
  });

  it('Failed insert is wrapped in try/catch (non-fatal)', () => {
    const failedInsertIdx = sourceCode.indexOf("to_status: 'Failed'");
    expect(failedInsertIdx).toBeGreaterThan(-1);

    const before = sourceCode.slice(Math.max(0, failedInsertIdx - 200), failedInsertIdx);
    expect(before).toContain('try {');

    const after = sourceCode.slice(failedInsertIdx, failedInsertIdx + 300);
    expect(after).toContain('catch (err)');
  });

  it('Done status log non-fatal warn message is present', () => {
    expect(sourceCode).toContain('Delivering→Done transition (non-fatal)');
  });

  it('Failed status log non-fatal warn message is present', () => {
    expect(sourceCode).toContain('Failed to log status transition to Failed (non-fatal)');
  });
});
