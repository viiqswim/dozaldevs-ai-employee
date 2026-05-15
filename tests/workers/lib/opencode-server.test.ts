import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  createLogger: () => mockLogger,
  taskLogger: () => mockLogger,
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('net', () => ({
  default: {
    createConnection: vi.fn(() => ({
      destroyed: false,
      destroy: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

import {
  startOpencodeServer,
  stopOpencodeServer,
} from '../../../src/workers/lib/opencode-server.js';
import { spawn } from 'child_process';

const mockSpawn = vi.mocked(spawn);

function createMockProcess(): ChildProcess & EventEmitter {
  const proc = new EventEmitter() as unknown as ChildProcess & EventEmitter;
  Object.assign(proc, {
    pid: 12345,
    killed: false,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
  (proc as unknown as Record<string, unknown>).kill = vi.fn((_signal?: string | number) => true);
  return proc;
}

describe('opencode-server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('startOpencodeServer()', () => {
    it('spawns process with correct arguments and default options', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn());

      const promise = startOpencodeServer();

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['serve', '--port', '4096', '--hostname', '0.0.0.0', '--print-logs'],
        expect.objectContaining({
          cwd: '/workspace',
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
          env: expect.objectContaining({
            OPENCODE_IDLE_TIMEOUT: expect.any(String),
          }),
        }),
      );

      // Cleanup
      mockProc.emit('error', new Error('cleanup'));
      await promise;
    });

    it('respects custom port option', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn());

      const promise = startOpencodeServer({ port: 5000 });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['serve', '--port', '5000', '--hostname', '0.0.0.0', '--print-logs'],
        expect.objectContaining({
          cwd: '/workspace',
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
          env: expect.objectContaining({
            OPENCODE_IDLE_TIMEOUT: expect.any(String),
          }),
        }),
      );

      mockProc.emit('error', new Error('cleanup'));
      await promise;
    });

    it('respects custom cwd option', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn());

      const promise = startOpencodeServer({ cwd: '/custom/path' });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['serve', '--port', '4096', '--hostname', '0.0.0.0', '--print-logs'],
        expect.objectContaining({
          cwd: '/custom/path',
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
          env: expect.objectContaining({
            OPENCODE_IDLE_TIMEOUT: expect.any(String),
          }),
        }),
      );

      mockProc.emit('error', new Error('cleanup'));
      await promise;
    });

    it('returns handle with correct url and kill function when stdout emits listening', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ body: null }));

      vi.useFakeTimers();
      const promise = startOpencodeServer({ port: 4096 });

      // Trigger resolve by emitting 'listening' on stdout — the actual detection mechanism
      (mockProc.stdout as EventEmitter).emit(
        'data',
        Buffer.from('opencode listening on port 4096'),
      );

      // Advance past the 200ms delay in source after detecting 'listening'
      vi.advanceTimersByTime(201);

      const result = await promise;

      expect(result).not.toBeNull();
      expect(result?.url).toBe('http://localhost:4096');
      expect(result?.process).toBe(mockProc);
      expect(typeof result?.kill).toBe('function');

      result?.stopKeepalive();
      vi.useRealTimers();
    });

    it('returns null when process emits error on spawn', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn());

      const promise = startOpencodeServer();

      // Emit error immediately
      mockProc.emit('error', new Error('spawn failed'));

      const result = await promise;

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[opencode-server] Failed to spawn opencode: spawn failed',
      );
    });

    it('returns null when health check times out', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      vi.stubGlobal('fetch', mockFetch);

      vi.useFakeTimers();

      const promise = startOpencodeServer({ healthTimeoutMs: 30000 });

      // Advance time past the timeout
      vi.advanceTimersByTime(31000);

      const result = await promise;

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[opencode-server] Health check timed out after 30000ms — killing process',
      );
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');

      vi.useRealTimers();
    });

    it('resolves when listening appears after initial stdout output', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ body: null }));

      vi.useFakeTimers();
      const promise = startOpencodeServer();

      // First emit non-listening output
      (mockProc.stdout as EventEmitter).emit('data', Buffer.from('Starting server...\n'));
      (mockProc.stdout as EventEmitter).emit('data', Buffer.from('Initializing...\n'));

      // Then emit the listening signal
      (mockProc.stdout as EventEmitter).emit(
        'data',
        Buffer.from('Server listening on port 4096\n'),
      );
      vi.advanceTimersByTime(201);

      const result = await promise;

      expect(result).not.toBeNull();
      expect(result?.url).toBe('http://localhost:4096');

      result?.stopKeepalive();
      vi.useRealTimers();
    });

    it('resolves when listening is embedded in multi-line stdout chunk', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ body: null }));

      vi.useFakeTimers();
      const promise = startOpencodeServer();

      // Emit a single chunk containing multiple lines, one of which has 'listening'
      (mockProc.stdout as EventEmitter).emit(
        'data',
        Buffer.from('init\nserver listening on 4096\ndone\n'),
      );
      vi.advanceTimersByTime(201);

      const result = await promise;

      expect(result).not.toBeNull();
      expect(result?.url).toBe('http://localhost:4096');

      result?.stopKeepalive();
      vi.useRealTimers();
    });
  });

  describe('stopOpencodeServer()', () => {
    it('sends SIGTERM and resolves when process exits gracefully', async () => {
      const mockProc = createMockProcess();
      (mockProc as unknown as { killed: boolean }).killed = false;

      const handle = {
        process: mockProc,
        url: 'http://localhost:4096',
        kill: async () => {},
        onExit: Promise.resolve(null),
        stopKeepalive: () => {},
      };

      const promise = stopOpencodeServer(handle);

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');

      // Simulate process exiting
      mockProc.emit('exit', 0, null);

      await promise;

      expect(mockProc.kill).toHaveBeenCalledTimes(1);
    });

    it('sends SIGKILL after 5s if process does not exit', async () => {
      const mockProc = createMockProcess();
      (mockProc as unknown as { killed: boolean }).killed = false;

      const handle = {
        process: mockProc,
        url: 'http://localhost:4096',
        kill: async () => {},
        onExit: Promise.resolve(null),
        stopKeepalive: () => {},
      };

      vi.useFakeTimers();
      const promise = stopOpencodeServer(handle);

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');

      // Advance past the 5s timeout to trigger SIGKILL
      vi.advanceTimersByTime(5001);

      await promise;

      expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[opencode-server] Process did not exit within 5s — sending SIGKILL',
      );

      vi.useRealTimers();
    });

    it('returns immediately if process is already killed', async () => {
      const mockProc = createMockProcess();
      (mockProc as unknown as { killed: boolean }).killed = true;

      const handle = {
        process: mockProc,
        url: 'http://localhost:4096',
        kill: async () => {},
        onExit: Promise.resolve(null),
        stopKeepalive: () => {},
      };

      await stopOpencodeServer(handle);

      expect(mockProc.kill).not.toHaveBeenCalled();
    });

    it('clears timeout when process exits before 5s', async () => {
      const mockProc = createMockProcess();
      (mockProc as unknown as { killed: boolean }).killed = false;

      const handle = {
        process: mockProc,
        url: 'http://localhost:4096',
        kill: async () => {},
        onExit: Promise.resolve(null),
        stopKeepalive: () => {},
      };

      vi.useFakeTimers();

      const promise = stopOpencodeServer(handle);

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');

      // Advance time to 2s (before 5s timeout)
      vi.advanceTimersByTime(2000);

      // Process exits
      mockProc.emit('exit', 0, null);

      await promise;

      // Advance time past 5s to verify timeout was cleared
      vi.advanceTimersByTime(4000);

      // SIGKILL should not have been called
      expect(mockProc.kill).toHaveBeenCalledTimes(1); // Only SIGTERM

      vi.useRealTimers();
    });

    it('handles SIGKILL failure gracefully', async () => {
      const mockProc = createMockProcess();
      (mockProc as unknown as { killed: boolean }).killed = false;
      (mockProc as unknown as { kill: unknown }).kill = vi.fn((signal?: string | number) => {
        if (signal === 'SIGKILL') {
          throw new Error('Permission denied');
        }
        return true;
      });

      const handle = {
        process: mockProc,
        url: 'http://localhost:4096',
        kill: async () => {},
        onExit: Promise.resolve(null),
        stopKeepalive: () => {},
      };

      vi.useFakeTimers();
      const promise = stopOpencodeServer(handle);

      // Advance past the 5s timeout to trigger SIGKILL attempt
      vi.advanceTimersByTime(5001);

      await promise;

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[opencode-server] SIGKILL failed: Permission denied',
      );

      vi.useRealTimers();
    });
  });

  describe('handle.kill()', () => {
    it('calls stopOpencodeServer when handle.kill() is invoked', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ body: null }));

      vi.useFakeTimers();
      const promise = startOpencodeServer();

      // Emit listening to get the handle
      (mockProc.stdout as EventEmitter).emit('data', Buffer.from('listening on port 4096'));
      vi.advanceTimersByTime(201);

      const handle = await promise;
      expect(handle).not.toBeNull();

      // Call handle.kill()
      const killPromise = handle!.kill();
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');

      // Let the process exit gracefully to resolve the kill promise
      mockProc.emit('exit', 0, null);
      await killPromise;

      vi.useRealTimers();
    });
  });
});
