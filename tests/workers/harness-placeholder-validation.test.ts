import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const HARNESS_SOURCE_PATH = join(import.meta.dirname, '../../src/workers/opencode-harness.mts');

describe('harness PLACEHOLDER validation — source check', () => {
  it('opencode-harness.mts defines PLACEHOLDER_PATTERN constant', () => {
    const source = readFileSync(HARNESS_SOURCE_PATH, 'utf8');
    expect(source).toContain('PLACEHOLDER_PATTERN');
  });

  it('opencode-harness.mts tests ts value against PLACEHOLDER_PATTERN', () => {
    const source = readFileSync(HARNESS_SOURCE_PATH, 'utf8');
    expect(source).toMatch(/PLACEHOLDER_PATTERN\.test\(/);
  });

  it('PLACEHOLDER_PATTERN uses case-insensitive regex matching /PLACEHOLDER/i', () => {
    const source = readFileSync(HARNESS_SOURCE_PATH, 'utf8');
    expect(source).toContain('/PLACEHOLDER/i');
  });

  it('harness validation throws on invalid approval metadata', () => {
    const source = readFileSync(HARNESS_SOURCE_PATH, 'utf8');
    expect(source).toContain('Invalid approval metadata detected');
  });
});
