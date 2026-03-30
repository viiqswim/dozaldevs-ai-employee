/**
 * Manages the lifecycle of the `opencode serve` child process.
 * Handles spawn, health-poll until ready, and clean shutdown.
 */

import { spawn, type ChildProcess } from 'child_process';

export interface OpencodeServerHandle {
  process: ChildProcess;
  url: string;
  kill: () => Promise<void>;
}

export interface StartOpencodeServerOptions {
  /** Default: 4096 */
  port?: number;
  /** Default: '/workspace' */
  cwd?: string;
  /** Default: 30000 (30s) */
  healthTimeoutMs?: number;
}

/**
 * Spawns `opencode serve --port {port}` and waits until the health endpoint
 * responds `{ healthy: true }`. Returns null if the process fails to start or
 * the health check times out.
 */
export async function startOpencodeServer(
  options?: StartOpencodeServerOptions,
): Promise<OpencodeServerHandle | null> {
  const port = options?.port ?? 4096;
  const cwd = options?.cwd ?? '/workspace';
  const healthTimeoutMs = options?.healthTimeoutMs ?? 30000;

  return new Promise<OpencodeServerHandle | null>((resolve) => {
    const childProcess = spawn('opencode', ['serve', '--port', String(port)], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    let resolved = false;
    let pollInterval: ReturnType<typeof setInterval> | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const resolveOnce = (value: OpencodeServerHandle | null) => {
      if (resolved) return;
      resolved = true;
      if (pollInterval !== undefined) clearInterval(pollInterval);
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      resolve(value);
    };

    childProcess.on('error', (err) => {
      console.warn(`[opencode-server] Failed to spawn opencode: ${err.message}`);
      resolveOnce(null);
    });

    const exitCleanup = () => {
      if (!childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
    };
    process.on('exit', exitCleanup);
    process.on('SIGTERM', exitCleanup);

    pollInterval = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`http://localhost:${port}/global/health`);
          if (response.ok) {
            const data = (await response.json()) as { healthy?: boolean };
            if (data.healthy === true) {
              const handle: OpencodeServerHandle = {
                process: childProcess,
                url: `http://localhost:${port}`,
                kill: async () => stopOpencodeServer(handle),
              };
              resolveOnce(handle);
            }
          }
        } catch {
          // Server not ready yet — continue polling
        }
      })();
    }, 1000);

    timeoutHandle = setTimeout(() => {
      console.warn(
        `[opencode-server] Health check timed out after ${healthTimeoutMs}ms — killing process`,
      );
      if (!childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
      resolveOnce(null);
    }, healthTimeoutMs);
  });
}

/**
 * Gracefully stops a running opencode server.
 * Sends SIGTERM first, waits up to 5s, then SIGKILL if still alive.
 * Never throws — cleanup must always succeed.
 */
export async function stopOpencodeServer(handle: OpencodeServerHandle): Promise<void> {
  if (handle.process.killed) return;

  handle.process.kill('SIGTERM');

  await new Promise<void>((resolve) => {
    const forceKillTimeout = setTimeout(() => {
      if (!handle.process.killed) {
        console.warn('[opencode-server] Process did not exit within 5s — sending SIGKILL');
        try {
          handle.process.kill('SIGKILL');
        } catch (err) {
          console.warn(
            `[opencode-server] SIGKILL failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      resolve();
    }, 5000);

    handle.process.once('exit', () => {
      clearTimeout(forceKillTimeout);
      resolve();
    });
  });
}
