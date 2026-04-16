import { describe, it, expect, vi } from 'vitest';
import { createFilteredBoltLogger } from '../../src/gateway/slack-logger.js';

describe('createFilteredBoltLogger', () => {
  function makeMockPino() {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  it('filters pong-timeout warn — demotes to debug', () => {
    const pino = makeMockPino();
    const logger = createFilteredBoltLogger(pino as any);
    logger.warn("A pong wasn't received from the server before the timeout of 5000ms!");
    expect(pino.warn).not.toHaveBeenCalled();
    expect(pino.debug).toHaveBeenCalled();
  });

  it('filters ping-timeout warn — demotes to debug', () => {
    const pino = makeMockPino();
    const logger = createFilteredBoltLogger(pino as any);
    logger.warn("A ping wasn't received from the server before the timeout of 10000ms!");
    expect(pino.warn).not.toHaveBeenCalled();
    expect(pino.debug).toHaveBeenCalled();
  });

  it('forwards unrelated warn to pino warn (false-positive guard)', () => {
    const pino = makeMockPino();
    const logger = createFilteredBoltLogger(pino as any);
    logger.warn('Slack workspace not found');
    expect(pino.warn).toHaveBeenCalled();
    expect(pino.debug).not.toHaveBeenCalled();
  });

  it('never filters error — forwards to pino error (auth failure guard)', () => {
    const pino = makeMockPino();
    const logger = createFilteredBoltLogger(pino as any);
    logger.error('invalid_auth');
    expect(pino.error).toHaveBeenCalled();
  });
});
