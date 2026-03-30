import { createOpencodeClient } from '@opencode-ai/sdk';

export interface SessionMonitorResult {
  completed: boolean;
  reason?: 'idle' | 'timeout' | 'error';
}

export interface MonitorOptions {
  timeoutMs?: number; // default: 60 * 60 * 1000 (60 minutes)
  minElapsedMs?: number; // default: 30000 (30 seconds minimum before marking complete)
}

export interface SessionManager {
  createSession(title: string): Promise<string | null>;
  injectTaskPrompt(sessionId: string, prompt: string): Promise<boolean>;
  monitorSession(sessionId: string, options?: MonitorOptions): Promise<SessionMonitorResult>;
  abortSession(sessionId: string): Promise<void>;
  sendFixPrompt(sessionId: string, failedStage: string, errorOutput: string): Promise<boolean>;
}

/**
 * Create a session manager that interacts with OpenCode via the SDK.
 *
 * @param baseUrl - Base URL of the OpenCode server (e.g. "http://localhost:4096")
 * @returns SessionManager implementation
 */
export function createSessionManager(baseUrl: string): SessionManager {
  const client = createOpencodeClient({ baseUrl });

  /**
   * Subscribe to the SSE event stream and monitor for session idle state.
   * Returns a promise that resolves when the session becomes idle or times out.
   */
  async function monitorViaSSE(
    sessionId: string,
    startTime: number,
    minElapsedMs: number,
    timeoutMs: number,
    reconnect: boolean,
  ): Promise<SessionMonitorResult> {
    return new Promise<SessionMonitorResult>((resolve) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const settle = (result: SessionMonitorResult): void => {
        if (settled) return;
        settled = true;
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        resolve(result);
      };

      timeoutHandle = setTimeout(() => {
        settle({ completed: false, reason: 'timeout' });
      }, timeoutMs);

      const runStreamOnce = async (): Promise<void> => {
        const result = await client.event.subscribe();
        for await (const event of result.stream) {
          if (settled) break;

          if (event.type === 'session.idle' && event.properties.sessionID === sessionId) {
            const elapsed = Date.now() - startTime;
            if (elapsed >= minElapsedMs) {
              settle({ completed: true, reason: 'idle' });
              return;
            }
          }

          if (
            event.type === 'session.status' &&
            event.properties.sessionID === sessionId &&
            event.properties.status.type === 'idle'
          ) {
            const elapsed = Date.now() - startTime;
            if (elapsed >= minElapsedMs) {
              settle({ completed: true, reason: 'idle' });
              return;
            }
          }
        }
      };

      const runStream = async (): Promise<void> => {
        try {
          await runStreamOnce();
        } catch (sseError) {
          if (settled) return;

          if (reconnect) {
            console.warn(
              `[session-manager] SSE disconnected for session ${sessionId}, attempting reconnect`,
            );
            try {
              await runStreamOnce();
            } catch (reconnectError) {
              if (settled) return;
              console.warn(
                `[session-manager] SSE reconnect failed for session ${sessionId}, falling back to polling:`,
                reconnectError,
              );
              startPolling();
            }
          } else {
            console.warn(
              `[session-manager] SSE reconnect failed for session ${sessionId}, starting polling`,
            );
            startPolling();
          }
        }
      };

      const startPolling = (): void => {
        const pollInterval = setInterval(() => {
          if (settled) {
            clearInterval(pollInterval);
            return;
          }

          void (async () => {
            try {
              const statusResponse = await client.session.status();
              if (!settled) {
                const statusMap = statusResponse.data;
                if (statusMap && statusMap[sessionId]?.type === 'idle') {
                  const elapsed = Date.now() - startTime;
                  if (elapsed >= minElapsedMs) {
                    clearInterval(pollInterval);
                    settle({ completed: true, reason: 'idle' });
                  }
                }
              }
            } catch (pollError) {
              console.warn(`[session-manager] Polling error for session ${sessionId}:`, pollError);
            }
          })();
        }, 10_000);
      };

      void runStream();
    });
  }

  return {
    /**
     * Create a new OpenCode session with the given title.
     *
     * @param title - Human-readable session title
     * @returns The new session ID, or null on failure
     */
    async createSession(title: string): Promise<string | null> {
      try {
        const response = await client.session.create({ body: { title } });
        return response.data?.id ?? null;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[session-manager] Failed to create session "${title}": ${errorMsg}`);
        return null;
      }
    },

    /**
     * Send a prompt to an existing session asynchronously (fire and forget).
     *
     * @param sessionId - The session to send the prompt to
     * @param prompt - Text prompt to inject
     * @returns true on success, false on error
     */
    async injectTaskPrompt(sessionId: string, prompt: string): Promise<boolean> {
      try {
        await client.session.promptAsync({
          path: { id: sessionId },
          body: { parts: [{ type: 'text', text: prompt }] },
        });
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[session-manager] Failed to inject prompt into session ${sessionId}: ${errorMsg}`,
        );
        return false;
      }
    },

    /**
     * Monitor a session until it becomes idle or times out.
     * Primary strategy: SSE event stream.
     * Fallback: polling every 10s if SSE fails after one reconnect attempt.
     *
     * @param sessionId - The session to monitor
     * @param options - Optional timeout and min-elapsed configuration
     * @returns Result indicating whether the session completed or timed out
     */
    async monitorSession(
      sessionId: string,
      options?: MonitorOptions,
    ): Promise<SessionMonitorResult> {
      const timeoutMs = options?.timeoutMs ?? 60 * 60 * 1000;
      const minElapsedMs = options?.minElapsedMs ?? 30_000;
      const startTime = Date.now();

      return monitorViaSSE(sessionId, startTime, minElapsedMs, timeoutMs, true);
    },

    /**
     * Abort an active session.
     * Logs on error but does not throw.
     *
     * @param sessionId - The session to abort
     */
    async abortSession(sessionId: string): Promise<void> {
      try {
        await client.session.abort({ path: { id: sessionId } });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[session-manager] Failed to abort session ${sessionId}: ${errorMsg}`);
      }
    },

    /**
     * Send a fix prompt to a session after a validation stage failure.
     * Truncates errorOutput to 4000 characters to stay within prompt limits.
     *
     * @param sessionId - The session to send the fix prompt to
     * @param failedStage - Name of the validation stage that failed
     * @param errorOutput - Raw error output from the failed stage
     * @returns true on success, false on error
     */
    async sendFixPrompt(
      sessionId: string,
      failedStage: string,
      errorOutput: string,
    ): Promise<boolean> {
      const truncatedErrorOutput =
        errorOutput.length > 4000 ? errorOutput.slice(0, 4000) : errorOutput;

      const fixPrompt = `The ${failedStage} validation stage failed with the following error:

\`\`\`
${truncatedErrorOutput}
\`\`\`

Please analyze this error and fix the issue. Make the minimal changes needed to resolve the error.`;

      try {
        await client.session.promptAsync({
          path: { id: sessionId },
          body: { parts: [{ type: 'text', text: fixPrompt }] },
        });
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[session-manager] Failed to send fix prompt to session ${sessionId}: ${errorMsg}`,
        );
        return false;
      }
    },
  };
}
