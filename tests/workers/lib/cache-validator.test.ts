import { describe, it, expect } from 'vitest';
import { validateCache } from '../../../src/workers/lib/cache-validator.js';

describe('cache-validator', () => {
  it('returns invalid for non-existent cache path', async () => {
    const result = await validateCache('/nonexistent/path', 'https://github.com/test/repo.git');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('.git directory structure is invalid');
  });

  it('returns invalid for empty cache path', async () => {
    const result = await validateCache('', 'https://github.com/test/repo.git');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('.git directory structure is invalid');
  });

  it('never throws - always returns result object', async () => {
    const result = await validateCache('/nonexistent', 'https://github.com/test/repo.git');

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('reason');
    expect(typeof result.valid).toBe('boolean');
    expect(typeof result.reason).toBe('string');
  });

  it('returns invalid for path without .git directory', async () => {
    const result = await validateCache('/tmp', 'https://github.com/test/repo.git');

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('.git directory structure is invalid');
  });

  it('returns invalid for null cache path', async () => {
    const result = await validateCache(null as any, 'https://github.com/test/repo.git');

    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns invalid for null remote URL', async () => {
    const result = await validateCache('/tmp', null as any);

    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
