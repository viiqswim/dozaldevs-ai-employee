import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireEnv } from '../../../../src/worker-tools/lib/require-env.js';

describe('requireEnv', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['REQUIRE_ENV_TEST_VAR'];
  });

  it('returns the env var value when set', () => {
    process.env['REQUIRE_ENV_TEST_VAR'] = 'hello';
    expect(requireEnv('REQUIRE_ENV_TEST_VAR')).toBe('hello');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('writes to stderr and exits 1 when env var is missing', () => {
    delete process.env['REQUIRE_ENV_TEST_VAR'];
    expect(() => requireEnv('REQUIRE_ENV_TEST_VAR')).toThrow('process.exit called');
    expect(stderrSpy).toHaveBeenCalledWith(
      'Error: REQUIRE_ENV_TEST_VAR environment variable is required\n',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('writes to stderr and exits 1 when env var is empty string', () => {
    process.env['REQUIRE_ENV_TEST_VAR'] = '';
    expect(() => requireEnv('REQUIRE_ENV_TEST_VAR')).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
