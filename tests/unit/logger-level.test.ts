import { describe, it, expect, afterEach } from 'vitest';
import { createLogger } from '../../src/lib/logger.js';

describe('createLogger() — LOG_LEVEL env var', () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  afterEach(() => {
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
  });

  it('uses level "debug" when LOG_LEVEL=debug', () => {
    process.env.LOG_LEVEL = 'debug';
    const logger = createLogger('test-component');
    expect(logger.level).toBe('debug');
  });

  it('uses level "info" when LOG_LEVEL is unset', () => {
    delete process.env.LOG_LEVEL;
    const logger = createLogger('test-component');
    expect(logger.level).toBe('info');
  });

  it('uses level "warn" when LOG_LEVEL=warn', () => {
    process.env.LOG_LEVEL = 'warn';
    const logger = createLogger('test-component');
    expect(logger.level).toBe('warn');
  });

  it('uses level "error" when LOG_LEVEL=error', () => {
    process.env.LOG_LEVEL = 'error';
    const logger = createLogger('test-component');
    expect(logger.level).toBe('error');
  });
});
