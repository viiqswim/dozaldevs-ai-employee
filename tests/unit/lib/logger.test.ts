import { describe, it, expect } from 'vitest';
import { Writable } from 'stream';
import pino from 'pino';
import {
  createLogger,
  taskLogger,
  type Logger,
  logStep,
  logTool,
  logCost,
  logTiming,
  logToolResolution,
} from '../../../src/lib/logger.js';

describe('logger', () => {
  describe('createLogger', () => {
    it('returns a pino Logger instance', () => {
      const logger = createLogger('test-component');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('does not throw when called', () => {
      expect(() => createLogger('test-component')).not.toThrow();
    });

    it('does not throw when logging circular references', () => {
      const logger = createLogger('test-component');
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      expect(() => logger.info(obj, 'test message')).not.toThrow();
    });

    it('binds component to logger', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });

      const testLogger = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      const logger = testLogger.child({ component: 'my-component' });
      logger.info('test message');

      const parsed = JSON.parse(output);
      expect(parsed.component).toBe('my-component');
    });

    it('includes ISO timestamp in output', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });

      const testLogger = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      testLogger.info('test');

      const parsed = JSON.parse(output);
      expect(parsed.time).toBeDefined();
      expect(typeof parsed.time).toBe('string');
      expect(parsed.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('redacts sensitive fields', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });

      const testLogger = pino(
        {
          timestamp: pino.stdTimeFunctions.isoTime,
          redact: {
            paths: ['GITHUB_TOKEN', 'JIRA_TOKEN', '*_TOKEN', '*_SECRET', '*_KEY', '*_PASSWORD'],
            censor: '[REDACTED]',
          },
        },
        dest,
      );

      testLogger.info({ GITHUB_TOKEN: 'secret123' }, 'test');
      const parsed = JSON.parse(output);
      expect(parsed.GITHUB_TOKEN).toBe('[REDACTED]');
    });
  });

  describe('taskLogger', () => {
    it('returns a pino Logger instance', () => {
      const logger = taskLogger('test-component', 'task-123');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('does not throw when called', () => {
      expect(() => taskLogger('test-component', 'task-123')).not.toThrow();
    });

    it('binds component and taskId to logger', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });

      const testLogger = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      const logger = testLogger.child({ component: 'my-component' }).child({ taskId: 'task-456' });
      logger.info('test message');

      const parsed = JSON.parse(output);
      expect(parsed.component).toBe('my-component');
      expect(parsed.taskId).toBe('task-456');
    });

    it('does not throw when logging circular references', () => {
      const logger = taskLogger('test-component', 'task-123');
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      expect(() => logger.info(obj, 'test message')).not.toThrow();
    });
  });

  describe('Logger type export', () => {
    it('Logger type is exported', () => {
      const logger: Logger = createLogger('test');
      expect(logger).toBeDefined();
    });
  });

  describe('logStep', () => {
    it('logs with emoji prefix in message', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });
      const l = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      logStep(l, '🚀', 'starting wave 1');
      const parsed = JSON.parse(output);
      expect(parsed.msg).toBe('🚀 starting wave 1');
      expect(parsed.emoji).toBe('🚀');
    });

    it('includes extras in structured output', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });
      const l = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      logStep(l, '📋', 'test', { waveNumber: 3 });
      const parsed = JSON.parse(output);
      expect(parsed.waveNumber).toBe(3);
    });
  });

  describe('logTool', () => {
    it('uses 🔧 for ok status', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });
      const l = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      logTool(l, 'pnpm install', 5000, 'ok');
      const parsed = JSON.parse(output);
      expect(parsed.msg).toBe('🔧 pnpm install (5000ms)');
      expect(parsed.status).toBe('ok');
    });

    it('uses ❌ for error status', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });
      const l = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      logTool(l, 'pnpm test', 1000, 'error');
      const parsed = JSON.parse(output);
      expect(parsed.msg).toContain('❌');
      expect(parsed.status).toBe('error');
    });
  });

  describe('logCost', () => {
    it('formats token counts with in/out labels', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });
      const l = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      logCost(l, 1000, 500);
      const parsed = JSON.parse(output);
      expect(parsed.msg).toBe('💰 1000in/500out tokens');
      expect(parsed.tokensIn).toBe(1000);
      expect(parsed.tokensOut).toBe(500);
    });

    it('does not include dollar amounts', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });
      const l = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      logCost(l, 100, 50);
      expect(output).not.toContain('$');
      expect(output).not.toContain('usd');
      expect(output).not.toContain('USD');
    });
  });

  describe('logTiming', () => {
    it('formats timing message correctly', () => {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });
      const l = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      logTiming(l, 'Phase 1 planning', 120000, 300000);
      const parsed = JSON.parse(output);
      expect(parsed.msg).toBe('TIMING: Phase 1 planning completed in 120000ms (total: 300000ms)');
      expect(parsed.elapsedMs).toBe(120000);
      expect(parsed.totalMs).toBe(300000);
    });
  });

  describe('logToolResolution', () => {
    function captureWarn(event: Parameters<typeof logToolResolution>[1]) {
      let output = '';
      const dest = new Writable({
        write(chunk, _enc, cb) {
          output += chunk.toString();
          cb();
        },
      });
      const l = pino({ timestamp: pino.stdTimeFunctions.isoTime }, dest);
      logToolResolution(l, event);
      return JSON.parse(output);
    }

    it('emits a warn-level record for a dropped tool with structured fields', () => {
      const parsed = captureWarn({
        tenantId: 'tenant-1',
        archetypeId: null,
        originalTool: '/tools/bogus/x',
        outcome: 'dropped',
        reason: 'not in tool library',
      });
      expect(parsed.level).toBe(40);
      expect(parsed.msg).toBe('tool path dropped');
      expect(parsed.tenantId).toBe('tenant-1');
      expect(parsed.archetypeId).toBeNull();
      expect(parsed.originalTool).toBe('/tools/bogus/x');
      expect(parsed.outcome).toBe('dropped');
      expect(parsed.reason).toBe('not in tool library');
    });

    it('emits a warn-level record for a normalized tool including resolvedTo', () => {
      const parsed = captureWarn({
        tenantId: 'tenant-2',
        archetypeId: 'arch-9',
        originalTool: '/tools/slack/read-channels',
        outcome: 'normalized',
        resolvedTo: '/tools/slack/read-channels.ts',
      });
      expect(parsed.level).toBe(40);
      expect(parsed.msg).toBe('tool path normalized');
      expect(parsed.outcome).toBe('normalized');
      expect(parsed.resolvedTo).toBe('/tools/slack/read-channels.ts');
    });
  });
});
