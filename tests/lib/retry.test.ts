import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sleep, withRetry } from '../../src/lib/retry.js';

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately with 0ms', async () => {
    const promise = sleep(0);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds on first attempt without retry', async () => {
    const fn = vi.fn(async () => 'success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds on second attempt', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount < 2) throw new Error('fail');
      return 'success';
    });

    const promise = withRetry(fn, { baseDelayMs: 0 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries and succeeds on third attempt', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount < 3) throw new Error('fail');
      return 'success';
    });

    const promise = withRetry(fn, { baseDelayMs: 0 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws original error after all attempts exhausted', async () => {
    const fn = vi.fn(async () => {
      throw new Error('persistent failure');
    });

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 });
    const assertion = expect(promise).rejects.toThrow('persistent failure');
    await vi.runAllTimersAsync();

    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws non-retryable errors immediately without retry', async () => {
    const fn = vi.fn(async () => {
      throw new Error('non-retryable');
    });

    const retryOn = vi.fn((err: unknown) => {
      if (err instanceof Error && err.message === 'non-retryable') {
        return false;
      }
      return true;
    });

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, retryOn });
    const assertion = expect(promise).rejects.toThrow('non-retryable');
    await vi.runAllTimersAsync();

    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(retryOn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff with correct delays', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount < 3) throw new Error('fail');
      return 'success';
    });

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 1000 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('works with baseDelayMs: 0 for instant retry', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount < 2) throw new Error('fail');
      return 'success';
    });

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
