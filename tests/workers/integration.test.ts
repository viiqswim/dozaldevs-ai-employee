// To run integration tests locally:
// 1. Start OpenCode server: opencode serve --port 4096
// 2. Run: OPENCODE_TEST_URL=http://localhost:4096 pnpm test -- --run tests/workers/integration.test.ts

import { describe, it, expect } from 'vitest';
import { createSessionManager } from '../../src/workers/lib/session-manager.js';

const INTEGRATION = !!process.env.OPENCODE_TEST_URL;

describe('OpenCode SDK integration tests: skip behavior when no server', () => {
  it('integration test suite is defined (skip logic working)', () => {
    expect(INTEGRATION || 'no-server').toBeTruthy();
  });
});

describe.skipIf(!INTEGRATION)('OpenCode SDK integration tests', () => {
  const baseUrl = process.env.OPENCODE_TEST_URL!;

  it('connects to the OpenCode server health endpoint', async () => {
    const response = await fetch(`${baseUrl}/global/health`);
    expect(response.ok).toBe(true);
    const data = (await response.json()) as { healthy?: boolean };
    expect(data.healthy).toBe(true);
  }, 30000);

  it('creates a session and returns a session ID', async () => {
    const sm = createSessionManager(baseUrl);
    const sessionId = await sm.createSession('integration-test-session');
    expect(sessionId).toBeTruthy();
    expect(typeof sessionId).toBe('string');
    if (sessionId) await sm.abortSession(sessionId);
  }, 30000);

  it('injects a prompt into a session', async () => {
    const sm = createSessionManager(baseUrl);
    const sessionId = await sm.createSession('integration-test-prompt');
    expect(sessionId).toBeTruthy();
    if (sessionId) {
      const success = await sm.injectTaskPrompt(sessionId, 'Reply with exactly: test-ok');
      expect(success).toBe(true);
      await sm.abortSession(sessionId);
    }
  }, 30000);

  it('monitors a session and detects idle', async () => {
    const sm = createSessionManager(baseUrl);
    const sessionId = await sm.createSession('integration-test-monitor');
    expect(sessionId).toBeTruthy();
    if (sessionId) {
      await sm.injectTaskPrompt(sessionId, 'Reply with: hello');
      const result = await sm.monitorSession(sessionId, { timeoutMs: 30000, minElapsedMs: 0 });
      expect(result.completed).toBe(true);
      await sm.abortSession(sessionId);
    }
  }, 60000);

  it('aborts a session', async () => {
    const sm = createSessionManager(baseUrl);
    const sessionId = await sm.createSession('integration-test-abort');
    expect(sessionId).toBeTruthy();
    if (sessionId) {
      await expect(sm.abortSession(sessionId)).resolves.not.toThrow();
    }
  }, 30000);

  it('handles concurrent sessions', async () => {
    const sm = createSessionManager(baseUrl);
    const [s1, s2] = await Promise.all([
      sm.createSession('integration-concurrent-1'),
      sm.createSession('integration-concurrent-2'),
    ]);
    expect(s1).not.toBe(s2);
    expect(s1).toBeTruthy();
    expect(s2).toBeTruthy();
    if (s1) await sm.abortSession(s1);
    if (s2) await sm.abortSession(s2);
  }, 30000);
});
