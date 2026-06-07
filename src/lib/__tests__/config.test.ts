import { afterEach, describe, expect, it } from 'vitest';
import { requireEnv, getEnv } from '../config.js';

const SCRATCH_VAR = '__CONFIG_TEST_SCRATCH__';

describe('requireEnv', () => {
  afterEach(() => {
    delete process.env[SCRATCH_VAR];
  });

  it('returns the value when the variable is set', () => {
    process.env[SCRATCH_VAR] = 'hello-world';
    expect(requireEnv(SCRATCH_VAR)).toBe('hello-world');
  });

  it('throws when the variable is absent', () => {
    delete process.env[SCRATCH_VAR];
    expect(() => requireEnv(SCRATCH_VAR)).toThrow(
      `Missing required environment variable: ${SCRATCH_VAR}`,
    );
  });

  it('throws when the variable is an empty string', () => {
    process.env[SCRATCH_VAR] = '';
    expect(() => requireEnv(SCRATCH_VAR)).toThrow(
      `Missing required environment variable: ${SCRATCH_VAR}`,
    );
  });
});

describe('getEnv', () => {
  afterEach(() => {
    delete process.env[SCRATCH_VAR];
  });

  it('returns the value when the variable is set', () => {
    process.env[SCRATCH_VAR] = 'present';
    expect(getEnv(SCRATCH_VAR, 'fallback')).toBe('present');
  });

  it('returns the default when the variable is absent', () => {
    delete process.env[SCRATCH_VAR];
    expect(getEnv(SCRATCH_VAR, 'fallback')).toBe('fallback');
  });
});

describe('typed constants', () => {
  it('INNGEST_EVENT_KEY defaults to "local"', async () => {
    const { INNGEST_EVENT_KEY } = await import('../config.js');
    expect(typeof INNGEST_EVENT_KEY).toBe('string');
  });

  it('INNGEST_BASE_URL defaults to localhost:8288', async () => {
    const { INNGEST_BASE_URL } = await import('../config.js');
    expect(INNGEST_BASE_URL).toMatch(/localhost:8288|inngest/);
  });

  it('WORKER_RUNTIME defaults to "docker"', async () => {
    const { WORKER_RUNTIME } = await import('../config.js');
    expect(['docker', 'fly']).toContain(WORKER_RUNTIME);
  });
});
