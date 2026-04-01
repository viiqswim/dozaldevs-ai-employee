import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Mock @opencode-ai/sdk BEFORE importing module under test
vi.mock('@opencode-ai/sdk', () => ({
  createOpencodeClient: vi.fn(),
}));

const { createSessionManager } = await import('../../../src/workers/lib/session-manager.js');
import { createOpencodeClient } from '@opencode-ai/sdk';

const mockCreateClient = vi.mocked(createOpencodeClient);

/**
 * Helper to create a mock OpenCode client with all required methods
 */
function createMockClient() {
  return {
    session: {
      create: vi.fn(),
      promptAsync: vi.fn(),
      abort: vi.fn(),
      status: vi.fn(),
    },
    event: {
      subscribe: vi.fn(),
    },
  };
}

describe('createSessionManager', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    mockCreateClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof createOpencodeClient>,
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSession()', () => {
    it('returns session ID on successful creation', async () => {
      mockClient.session.create.mockResolvedValue({
        data: { id: 'sess-1', title: 'Test Session' },
      });

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.createSession('Test Session');

      expect(result).toBe('sess-1');
      expect(mockClient.session.create).toHaveBeenCalledWith({
        body: { title: 'Test Session' },
      });
    });

    it('returns null and warns on creation error', async () => {
      const error = new Error('Server error');
      mockClient.session.create.mockRejectedValue(error);

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.createSession('Test Session');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns null when response data is missing', async () => {
      mockClient.session.create.mockResolvedValue({ data: null });

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.createSession('Test Session');

      expect(result).toBeNull();
    });

    it('returns null when response id is missing', async () => {
      mockClient.session.create.mockResolvedValue({
        data: { title: 'Test Session' },
      });

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.createSession('Test Session');

      expect(result).toBeNull();
    });
  });

  describe('injectTaskPrompt()', () => {
    it('returns true on successful prompt injection', async () => {
      mockClient.session.promptAsync.mockResolvedValue({});

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.injectTaskPrompt('sess-1', 'Test prompt');

      expect(result).toBe(true);
      expect(mockClient.session.promptAsync).toHaveBeenCalledWith({
        path: { id: 'sess-1' },
        body: { parts: [{ type: 'text', text: 'Test prompt' }] },
      });
    });

    it('returns false and warns on prompt injection error', async () => {
      const error = new Error('Prompt failed');
      mockClient.session.promptAsync.mockRejectedValue(error);

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.injectTaskPrompt('sess-1', 'Test prompt');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('handles non-Error exceptions', async () => {
      mockClient.session.promptAsync.mockRejectedValue('String error');

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.injectTaskPrompt('sess-1', 'Test prompt');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('monitorSession()', () => {
    it('resolves with idle when session.idle event is received after minElapsedMs', async () => {
      const mockStream = (async function* () {
        await new Promise((r) => setImmediate(r));
        yield {
          type: 'session.idle',
          properties: { sessionID: 'sess-1' },
        };
      })();

      mockClient.event.subscribe.mockResolvedValue({ stream: mockStream });

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.monitorSession('sess-1', {
        minElapsedMs: 0,
        timeoutMs: 5000,
      });

      expect(result).toEqual({ completed: true, reason: 'idle' });
    });

    it('resolves with idle when session.status event with idle type is received', async () => {
      const mockStream = (async function* () {
        await new Promise((r) => setImmediate(r));
        yield {
          type: 'session.status',
          properties: {
            sessionID: 'sess-1',
            status: { type: 'idle' },
          },
        };
      })();

      mockClient.event.subscribe.mockResolvedValue({ stream: mockStream });

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.monitorSession('sess-1', {
        minElapsedMs: 0,
        timeoutMs: 5000,
      });

      expect(result).toEqual({ completed: true, reason: 'idle' });
    });

    it('resolves with timeout when timeoutMs is exceeded', async () => {
      vi.useFakeTimers();

      // eslint-disable-next-line require-yield
      const mockStream = (async function* () {
        await new Promise(() => {});
      })();

      mockClient.event.subscribe.mockResolvedValue({ stream: mockStream });

      const manager = createSessionManager('http://localhost:4096');
      const promise = manager.monitorSession('sess-1', {
        minElapsedMs: 0,
        timeoutMs: 5000,
      });

      // Advance time past timeout
      vi.advanceTimersByTime(5001);

      const result = await promise;

      expect(result).toEqual({ completed: false, reason: 'timeout' });

      vi.useRealTimers();
    });

    it('ignores events from other sessions', async () => {
      const mockStream = (async function* () {
        await new Promise((r) => setImmediate(r));
        yield {
          type: 'session.idle',
          properties: { sessionID: 'sess-2' }, // Different session
        };
        // Never yields for sess-1
        await new Promise(() => {});
      })();

      mockClient.event.subscribe.mockResolvedValue({ stream: mockStream });

      vi.useFakeTimers();

      const manager = createSessionManager('http://localhost:4096');
      const promise = manager.monitorSession('sess-1', {
        minElapsedMs: 0,
        timeoutMs: 5000,
      });

      vi.advanceTimersByTime(5001);

      const result = await promise;

      expect(result).toEqual({ completed: false, reason: 'timeout' });

      vi.useRealTimers();
    });

    it('respects minElapsedMs before marking session complete', async () => {
      vi.useFakeTimers();

      const mockStream = (async function* () {
        // Yield immediately (before minElapsedMs)
        yield {
          type: 'session.idle',
          properties: { sessionID: 'sess-1' },
        };
        // Wait for minElapsedMs to pass
        await new Promise((r) => setTimeout(r, 35000));
        yield {
          type: 'session.idle',
          properties: { sessionID: 'sess-1' },
        };
      })();

      mockClient.event.subscribe.mockResolvedValue({ stream: mockStream });

      const manager = createSessionManager('http://localhost:4096');
      const promise = manager.monitorSession('sess-1', {
        minElapsedMs: 30000,
        timeoutMs: 60000,
      });

      // Advance time to trigger second event
      vi.advanceTimersByTime(35001);

      const result = await promise;

      expect(result).toEqual({ completed: true, reason: 'idle' });

      vi.useRealTimers();
    });

    it('uses default timeoutMs when not provided', async () => {
      const mockStream = (async function* () {
        await new Promise((r) => setImmediate(r));
        yield {
          type: 'session.idle',
          properties: { sessionID: 'sess-1' },
        };
      })();

      mockClient.event.subscribe.mockResolvedValue({ stream: mockStream });

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.monitorSession('sess-1', {
        minElapsedMs: 0,
      });

      expect(result).toEqual({ completed: true, reason: 'idle' });
    });

    it('handles SSE stream errors gracefully', async () => {
      // eslint-disable-next-line require-yield
      const mockStream = (async function* () {
        throw new Error('SSE connection failed');
      })();

      mockClient.event.subscribe.mockResolvedValue({ stream: mockStream });

      vi.useFakeTimers();

      const manager = createSessionManager('http://localhost:4096');
      const promise = manager.monitorSession('sess-1', {
        minElapsedMs: 0,
        timeoutMs: 5000,
      });

      // Advance time past timeout to resolve the promise
      vi.advanceTimersByTime(5001);

      const result = await promise;

      // Should timeout since SSE failed and we don't wait for polling
      expect(result).toEqual({ completed: false, reason: 'timeout' });

      vi.useRealTimers();
    });
  });

  describe('abortSession()', () => {
    it('calls client.session.abort with correct session ID', async () => {
      mockClient.session.abort.mockResolvedValue({});

      const manager = createSessionManager('http://localhost:4096');
      await manager.abortSession('sess-1');

      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: 'sess-1' },
      });
    });

    it('logs warning on abort error but does not throw', async () => {
      const error = new Error('Abort failed');
      mockClient.session.abort.mockRejectedValue(error);

      const manager = createSessionManager('http://localhost:4096');

      // Should not throw
      await expect(manager.abortSession('sess-1')).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('handles non-Error exceptions', async () => {
      mockClient.session.abort.mockRejectedValue('String error');

      const manager = createSessionManager('http://localhost:4096');

      await expect(manager.abortSession('sess-1')).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('sendFixPrompt()', () => {
    it('sends fix prompt with error output under 4000 chars', async () => {
      mockClient.session.promptAsync.mockResolvedValue({});
      const errorOutput = 'This is a short error message';

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.sendFixPrompt('sess-1', 'build', errorOutput);

      expect(result).toBe(true);
      const callArgs = mockClient.session.promptAsync.mock.calls[0][0];
      expect(callArgs.body.parts[0].text).toContain(errorOutput);
      expect(callArgs.body.parts[0].text).toContain('build');
    });

    it('truncates error output to 4000 characters', async () => {
      mockClient.session.promptAsync.mockResolvedValue({});
      const longError = 'x'.repeat(5000);

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.sendFixPrompt('sess-1', 'test', longError);

      expect(result).toBe(true);
      const callArgs = mockClient.session.promptAsync.mock.calls[0][0];
      const promptText = callArgs.body.parts[0].text;

      // Should contain exactly 4000 chars of the error (in the code block)
      expect(promptText).toContain('x'.repeat(4000));
      expect(promptText).not.toContain('x'.repeat(4001));
    });

    it('returns false and warns on prompt send error', async () => {
      const error = new Error('Send failed');
      mockClient.session.promptAsync.mockRejectedValue(error);

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.sendFixPrompt('sess-1', 'build', 'error');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('includes failed stage name in prompt', async () => {
      mockClient.session.promptAsync.mockResolvedValue({});

      const manager = createSessionManager('http://localhost:4096');
      await manager.sendFixPrompt('sess-1', 'validation', 'error output');

      const callArgs = mockClient.session.promptAsync.mock.calls[0][0];
      const promptText = callArgs.body.parts[0].text;

      expect(promptText).toContain('validation');
      expect(promptText).toContain('validation stage failed');
    });

    it('formats error output in code block', async () => {
      mockClient.session.promptAsync.mockResolvedValue({});
      const errorOutput = 'Error: Something went wrong';

      const manager = createSessionManager('http://localhost:4096');
      await manager.sendFixPrompt('sess-1', 'build', errorOutput);

      const callArgs = mockClient.session.promptAsync.mock.calls[0][0];
      const promptText = callArgs.body.parts[0].text;

      expect(promptText).toContain('```');
      expect(promptText).toContain(errorOutput);
    });

    it('handles non-Error exceptions', async () => {
      mockClient.session.promptAsync.mockRejectedValue('String error');

      const manager = createSessionManager('http://localhost:4096');
      const result = await manager.sendFixPrompt('sess-1', 'build', 'error');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('integration', () => {
    it('initializes with correct baseUrl', () => {
      const manager = createSessionManager('http://localhost:4096');

      expect(mockCreateClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:4096',
      });
    });

    it('supports multiple manager instances with different baseUrls', () => {
      const manager1 = createSessionManager('http://localhost:4096');
      const manager2 = createSessionManager('http://localhost:5000');

      expect(mockCreateClient).toHaveBeenCalledTimes(2);
      expect(mockCreateClient).toHaveBeenNthCalledWith(1, {
        baseUrl: 'http://localhost:4096',
      });
      expect(mockCreateClient).toHaveBeenNthCalledWith(2, {
        baseUrl: 'http://localhost:5000',
      });
    });
  });
});
