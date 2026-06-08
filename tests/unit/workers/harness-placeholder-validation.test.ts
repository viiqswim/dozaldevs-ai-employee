import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const OUTPUT_CONTRACT_PATH = join(
  import.meta.dirname,
  '../../../src/workers/lib/output-contract.mts',
);

describe('harness PLACEHOLDER validation — source check', () => {
  it('output-contract.mts defines PLACEHOLDER_PATTERN constant', () => {
    const source = readFileSync(OUTPUT_CONTRACT_PATH, 'utf8');
    expect(source).toContain('PLACEHOLDER_PATTERN');
  });

  it('output-contract.mts tests ts value against PLACEHOLDER_PATTERN', () => {
    const source = readFileSync(OUTPUT_CONTRACT_PATH, 'utf8');
    expect(source).toMatch(/PLACEHOLDER_PATTERN\.test\(/);
  });

  it('PLACEHOLDER_PATTERN uses case-insensitive regex matching /PLACEHOLDER/i', () => {
    const source = readFileSync(OUTPUT_CONTRACT_PATH, 'utf8');
    expect(source).toContain('/PLACEHOLDER/i');
  });

  it('harness validation throws on invalid approval metadata', () => {
    const source = readFileSync(OUTPUT_CONTRACT_PATH, 'utf8');
    expect(source).toContain('Invalid approval metadata detected');
  });
});
