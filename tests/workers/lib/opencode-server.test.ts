import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
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

      expect(mockSpawn).toHaveBeenCalledWith('opencode', ['serve', '--port', '4096'], {
        cwd: '/workspace',
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      // Cleanup
      mockProc.emit('error', new Error('cleanup'));
      await promise;
    });

    it('respects custom port option', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn());

      const promise = startOpencodeServer({ port: 5000 });

      expect(mockSpawn).toHaveBeenCalledWith('opencode', ['serve', '--port', '5000'], {
        cwd: '/workspace',
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      mockProc.emit('error', new Error('cleanup'));
      await promise;
    });

    it('respects custom cwd option', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn());

      const promise = startOpencodeServer({ cwd: '/custom/path' });

      expect(mockSpawn).toHaveBeenCalledWith('opencode', ['serve', '--port', '4096'], {
        cwd: '/custom/path',
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      mockProc.emit('error', new Error('cleanup'));
      await promise;
    });

    it('returns handle with correct url and kill function on successful health check', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ healthy: true }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const promise = startOpencodeServer({ port: 4096 });

      // Trigger health check success
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await promise;

      expect(result).not.toBeNull();
      expect(result?.url).toBe('http://localhost:4096');
      expect(result?.process).toBe(mockProc);
      expect(typeof result?.kill).toBe('function');
    });

    it('returns null when process emits error on spawn', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);
      vi.stubGlobal('fetch', vi.fn());

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const promise = startOpencodeServer();

      // Emit error immediately
      mockProc.emit('error', new Error('spawn failed'));

      const result = await promise;

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        '[opencode-server] Failed to spawn opencode: spawn failed',
      );
    });

    it('returns null when health check times out', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      vi.stubGlobal('fetch', mockFetch);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.useFakeTimers();

      const promise = startOpencodeServer({ healthTimeoutMs: 30000 });

      // Advance time past the timeout
      vi.advanceTimersByTime(31000);

      const result = await promise;

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        '[opencode-server] Health check timed out after 30000ms — killing process',
      );
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');

      vi.useRealTimers();
    });

    it('polls health endpoint until server is ready', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          // First two calls fail
          return Promise.reject(new Error('Not ready'));
        }
        // Third call succeeds
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ healthy: true }),
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const promise = startOpencodeServer();

      // Wait for polling to succeed
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const result = await promise;

      expect(result).not.toBeNull();
      expect(result?.url).toBe('http://localhost:4096');
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('handles health check response with healthy=false', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          // First call returns healthy=false
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ healthy: false }),
          });
        }
        // Second call returns healthy=true
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ healthy: true }),
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const promise = startOpencodeServer();

      await new Promise((resolve) => setTimeout(resolve, 2500));

      const result = await promise;

      expect(result).not.toBeNull();
      expect(result?.url).toBe('http://localhost:4096');
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
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const promise = stopOpencodeServer(handle);

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');

      // Wait for the 5s timeout to trigger SIGKILL
      await promise;

      expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
      expect(warnSpy).toHaveBeenCalledWith(
        '[opencode-server] Process did not exit within 5s — sending SIGKILL',
      );
    });

    it('returns immediately if process is already killed', async () => {
      const mockProc = createMockProcess();
      (mockProc as unknown as { killed: boolean }).killed = true;

      const handle = {
        process: mockProc,
        url: 'http://localhost:4096',
        kill: async () => {},
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
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const promise = stopOpencodeServer(handle);

      // Wait for the 5s timeout to trigger SIGKILL attempt
      await promise;

      expect(warnSpy).toHaveBeenCalledWith('[opencode-server] SIGKILL failed: Permission denied');
    });
  });

  describe('handle.kill()', () => {
    it('calls stopOpencodeServer when handle.kill() is invoked', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ healthy: true }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const promise = startOpencodeServer();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const handle = await promise;

      expect(handle).not.toBeNull();

      // Call handle.kill()
      await handle!.kill();

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });
});
