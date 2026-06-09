import { describe, it, expect, afterEach } from 'vitest';
import { optionalEnv } from '../require-env.js';

describe('optionalEnv', () => {
  const TEST_VAR = 'TEST_OPTIONAL_ENV_VAR';

  afterEach(() => {
    delete process.env[TEST_VAR];
  });

  it('returns the value when env var is set', () => {
    process.env[TEST_VAR] = 'hello';
    expect(optionalEnv(TEST_VAR)).toBe('hello');
  });

  it('returns undefined when env var is not set', () => {
    delete process.env[TEST_VAR];
    expect(optionalEnv(TEST_VAR)).toBeUndefined();
  });

  it('returns undefined when env var is empty string', () => {
    process.env[TEST_VAR] = '';
    expect(optionalEnv(TEST_VAR)).toBeUndefined();
  });
});
