import { spawn, type ChildProcess } from 'child_process';
import net from 'net';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('opencode-server');

/** Default port for the OpenCode HTTP server */
const DEFAULT_OPENCODE_PORT = 4096;
/** Default health-check timeout in ms — how long to wait for "listening" before giving up */
const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;
/** Default idle timeout in ms passed to OpenCode via env (5 minutes) */
const DEFAULT_IDLE_TIMEOUT_MS = 300_000;
/** Reconnect delay in ms after a clean TCP close */
const TCP_RECONNECT_DELAY_MS = 50;
/** Reconnect delay in ms after a TCP error */
const TCP_ERROR_RECONNECT_DELAY_MS = 100;
/** Grace period in ms before SIGKILL after SIGTERM during server stop (5 seconds) */
const FORCE_KILL_TIMEOUT_MS = 5_000;

const exitListenerRegistry = new WeakMap<ChildProcess, () => void>();

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
  const port = options?.port ?? DEFAULT_OPENCODE_PORT;
  const cwd = options?.cwd ?? '/workspace';
  const healthTimeoutMs = options?.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;

  let listeningDetected = false;

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
          OPENCODE_IDLE_TIMEOUT:
            process.env.OPENCODE_IDLE_TIMEOUT ?? String(DEFAULT_IDLE_TIMEOUT_MS),
        },
      },
    );

    let resolved = false;
    const timers = {
      timeoutHandle: undefined as ReturnType<typeof setTimeout> | undefined,
    };

    const resolveOnce = (value: OpencodeServerHandle | null) => {
      if (resolved) return;
      resolved = true;
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
            setTimeout(connectSocket, TCP_RECONNECT_DELAY_MS);
          }
        });
        sock.on('error', () => {
          if (!keepaliveAbortController?.signal.aborted) {
            setTimeout(connectSocket, TCP_ERROR_RECONNECT_DELAY_MS);
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
            setTimeout(runKeepalive, TCP_RECONNECT_DELAY_MS);
          }
        })
        .catch(() => {
          if (!keepaliveAbortController?.signal.aborted) {
            setTimeout(runKeepalive, TCP_ERROR_RECONNECT_DELAY_MS);
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
        listeningDetected = true;
        startKeepaliveOnce();
        setTimeout(() => {
          exitListenerRegistry.set(childProcess, removeExitListeners);
          const handle: OpencodeServerHandle = {
            process: childProcess,
            url: `http://localhost:${port}`,
            kill: async () => stopOpencodeServer(handle),
            onExit,
            stopKeepalive,
          };
          resolveOnce(handle);
        }, 200);
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
      removeExitListeners();
      exitListenerRegistry.delete(childProcess);
      onExitResolve(code);
      if (!listeningDetected) {
        resolveOnce(null);
      }
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
    const removeExitListeners = () => {
      process.removeListener('exit', exitCleanup);
      process.removeListener('SIGTERM', exitCleanup);
    };
    process.on('exit', exitCleanup);
    process.on('SIGTERM', exitCleanup);

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
  exitListenerRegistry.get(handle.process)?.();
  exitListenerRegistry.delete(handle.process);

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
    }, FORCE_KILL_TIMEOUT_MS);

    handle.process.once('exit', () => {
      clearTimeout(forceKillTimeout);
      resolve();
    });
  });
}
