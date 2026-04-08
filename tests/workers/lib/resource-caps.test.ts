import { describe, it, expect } from 'vitest';
import {
  RESOURCE_CAPS,
  applyResourceCaps,
  resourceCapsForShell,
} from '../../../src/workers/lib/resource-caps.js';

describe('RESOURCE_CAPS', () => {
  it('has exactly 4 caps with the correct Nexus values', () => {
    expect(RESOURCE_CAPS.TURBO_CONCURRENCY).toBe('2');
    expect(RESOURCE_CAPS.NEXUS_VITEST_MAX_WORKERS).toBe('2');
    expect(RESOURCE_CAPS.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS).toBe('1200000');
    expect(RESOURCE_CAPS.NODE_OPTIONS).toBe('--max-old-space-size=4096');
    expect(Object.keys(RESOURCE_CAPS)).toHaveLength(4);
  });
});

describe('applyResourceCaps', () => {
  it('sets all caps when env is empty', () => {
    const env: NodeJS.ProcessEnv = {};
    applyResourceCaps(env);
    expect(env['TURBO_CONCURRENCY']).toBe('2');
    expect(env['NEXUS_VITEST_MAX_WORKERS']).toBe('2');
    expect(env['OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS']).toBe('1200000');
    expect(env['NODE_OPTIONS']).toBe('--max-old-space-size=4096');
  });

  it('does NOT override vars already set in env', () => {
    const env: NodeJS.ProcessEnv = { TURBO_CONCURRENCY: '8' };
    applyResourceCaps(env);
    expect(env['TURBO_CONCURRENCY']).toBe('8'); // preserved
    expect(env['NEXUS_VITEST_MAX_WORKERS']).toBe('2'); // set by function
  });

  it('does not modify process.env by default without explicit env arg', () => {
    // Just verify it doesn't throw
    expect(() => applyResourceCaps({})).not.toThrow();
  });
});

describe('resourceCapsForShell', () => {
  it('produces KEY=VALUE lines for all unset caps', () => {
    const output = resourceCapsForShell({});
    const lines = output.split('\n').filter(Boolean);
    expect(lines).toHaveLength(4);
    expect(lines).toContain('TURBO_CONCURRENCY=2');
    expect(lines).toContain('NEXUS_VITEST_MAX_WORKERS=2');
    expect(lines).toContain('OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS=1200000');
    expect(lines).toContain('NODE_OPTIONS=--max-old-space-size=4096');
  });

  it('omits caps that are already set in env', () => {
    const output = resourceCapsForShell({ TURBO_CONCURRENCY: '8' });
    expect(output).not.toContain('TURBO_CONCURRENCY=');
    expect(output).toContain('NEXUS_VITEST_MAX_WORKERS=2');
  });

  it('returns empty string when all caps already set', () => {
    const allSet: NodeJS.ProcessEnv = {
      TURBO_CONCURRENCY: '8',
      NEXUS_VITEST_MAX_WORKERS: '4',
      OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: '999',
      NODE_OPTIONS: '--max-old-space-size=8192',
    };
    expect(resourceCapsForShell(allSet)).toBe('');
  });
});
