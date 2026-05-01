import { spawn, type ChildProcess } from 'child_process';
import net from 'net';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('opencode-server');

export interface OpencodeServerHandle {
  process: ChildProcess;
  url: string;
  kill: () => Promise<void>;
  onExit: Promise<number | null>;
  stopKeepalive: () => void;
}

export interface StartOpencodeServerOptions {
  port?: number;
  cwd?: string;
  healthTimeoutMs?: number;
}

export async function startOpencodeServer(
  options?: StartOpencodeServerOptions,
): Promise<OpencodeServerHandle | null> {
  const port = options?.port ?? 4096;
  const cwd = options?.cwd ?? '/workspace';
  const healthTimeoutMs = options?.healthTimeoutMs ?? 30000;

  return new Promise<OpencodeServerHandle | null>((resolve) => {
    const childProcess = spawn(
      'opencode',
      ['serve', '--port', String(port), '--hostname', '0.0.0.0', '--print-logs'],
      {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: {
          ...process.env,
          OPENCODE_IDLE_TIMEOUT: process.env.OPENCODE_IDLE_TIMEOUT ?? '300000',
        },
      },
    );

    let resolved = false;
    const timers = {
      pollInterval: undefined as ReturnType<typeof setInterval> | undefined,
      timeoutHandle: undefined as ReturnType<typeof setTimeout> | undefined,
    };

    const resolveOnce = (value: OpencodeServerHandle | null) => {
      if (resolved) return;
      resolved = true;
      if (timers.pollInterval !== undefined) clearInterval(timers.pollInterval);
      if (timers.timeoutHandle !== undefined) clearTimeout(timers.timeoutHandle);
      resolve(value);
    };

    let onExitResolve: (code: number | null) => void = () => {};
    const onExit = new Promise<number | null>((res) => {
      onExitResolve = res;
    });

    let tcpSocket: net.Socket | null = null;
    let keepaliveAbortController: AbortController | null = null;

    const stopKeepalive = () => {
      keepaliveAbortController?.abort();
      if (tcpSocket && !tcpSocket.destroyed) {
        tcpSocket.destroy();
        tcpSocket = null;
      }
    };

    const startTcpKeepalive = () => {
      const connectSocket = () => {
        if (keepaliveAbortController?.signal.aborted) return;
        const sock = net.createConnection({ port, host: '127.0.0.1' });
        tcpSocket = sock;
        sock.on('connect', () => {
          log.info(`[opencode-server] TCP keepalive connected on port ${port}`);
        });
        sock.on('close', () => {
          if (!keepaliveAbortController?.signal.aborted) {
            setTimeout(connectSocket, 50);
          }
        });
        sock.on('error', () => {
          if (!keepaliveAbortController?.signal.aborted) {
            setTimeout(connectSocket, 100);
          }
        });
      };
      connectSocket();
    };

    const runKeepalive = (): void => {
      if (keepaliveAbortController?.signal.aborted) return;
      fetch(`http://localhost:${port}/event`, {
        headers: { Accept: 'text/event-stream' },
        signal: keepaliveAbortController?.signal,
      })
        .then(async (res) => {
          if (!res.body) return;
          const reader = res.body.getReader();
          try {
            while (!keepaliveAbortController?.signal.aborted) {
              const { done } = await reader.read();
              if (done) break;
            }
          } catch {
            // intentionally empty
          } finally {
            reader.releaseLock();
          }
          if (!keepaliveAbortController?.signal.aborted) {
            setTimeout(runKeepalive, 50);
          }
        })
        .catch(() => {
          if (!keepaliveAbortController?.signal.aborted) {
            setTimeout(runKeepalive, 100);
          }
        });
    };

    let keepaliveStarted = false;

    const startKeepaliveOnce = () => {
      if (keepaliveStarted) return;
      keepaliveStarted = true;
      keepaliveAbortController = new AbortController();
      log.info(`[opencode-server] Starting TCP keepalive + SSE on port ${port}`);
      startTcpKeepalive();
      runKeepalive();
    };

    childProcess.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split('\n').filter(Boolean);
      for (const line of lines) {
        log.info(`[opencode-server:stdout] ${line}`);
      }
      if (text.includes('listening')) {
        startKeepaliveOnce();
      }
    });

    childProcess.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        log.info(`[opencode-server:stderr] ${line}`);
      }
    });

    childProcess.on('exit', (code) => {
      log.warn(`[opencode-server] opencode serve exited with code ${code}`);
      onExitResolve(code);
      resolveOnce(null);
    });

    childProcess.on('error', (err) => {
      log.warn(`[opencode-server] Failed to spawn opencode: ${err.message}`);
      onExitResolve(null);
      resolveOnce(null);
    });

    const exitCleanup = () => {
      if (!childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
    };
    process.on('exit', exitCleanup);
    process.on('SIGTERM', exitCleanup);

    timers.pollInterval = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`http://localhost:${port}/global/health`);
          if (response.ok) {
            const data = (await response.json()) as { healthy?: boolean };
            if (data.healthy === true) {
              startKeepaliveOnce();

              const handle: OpencodeServerHandle = {
                process: childProcess,
                url: `http://localhost:${port}`,
                kill: async () => stopOpencodeServer(handle),
                onExit,
                stopKeepalive,
              };
              resolveOnce(handle);
            }
          }
        } catch {
          // not ready yet
        }
      })();
    }, 100);

    timers.timeoutHandle = setTimeout(() => {
      log.warn(
        `[opencode-server] Health check timed out after ${healthTimeoutMs}ms — killing process`,
      );
      if (!childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
      resolveOnce(null);
    }, healthTimeoutMs);
  });
}

export async function stopOpencodeServer(handle: OpencodeServerHandle): Promise<void> {
  handle.stopKeepalive();

  if (handle.process.killed) return;

  handle.process.kill('SIGTERM');

  await new Promise<void>((resolve) => {
    const forceKillTimeout = setTimeout(() => {
      if (!handle.process.killed) {
        log.warn('[opencode-server] Process did not exit within 5s — sending SIGKILL');
        try {
          handle.process.kill('SIGKILL');
        } catch (err) {
          log.warn(
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
