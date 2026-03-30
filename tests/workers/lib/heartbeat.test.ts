import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHeartbeat, escalate } from '../../../src/workers/lib/heartbeat.js';
import type { PostgRESTClient } from '../../../src/workers/lib/postgrest-client.js';

function createMockClient(): PostgRESTClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  };
}

describe('startHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires heartbeat after 60s and patches executions table', async () => {
    const mockClient = createMockClient();
    const handle = startHeartbeat({
      executionId: 'exec-1',
      postgrestClient: mockClient,
    });

    // Advance time by 60s
    await vi.advanceTimersByTimeAsync(60000);

    expect(mockClient.patch).toHaveBeenCalledWith(
      'executions',
      'id=eq.exec-1',
      expect.objectContaining({
        heartbeat_at: expect.any(String),
        current_stage: '',
      }),
    );

    handle.stop();
  });

  it('stop() clears interval and prevents further heartbeats', async () => {
    const mockClient = createMockClient();
    const handle = startHeartbeat({
      executionId: 'exec-1',
      postgrestClient: mockClient,
    });

    // First heartbeat at 60s
    await vi.advanceTimersByTimeAsync(60000);
    expect(mockClient.patch).toHaveBeenCalledTimes(1);

    // Stop the heartbeat
    handle.stop();

    // Advance time by another 60s
    await vi.advanceTimersByTimeAsync(60000);

    // Should still be 1 call (no new calls after stop)
    expect(mockClient.patch).toHaveBeenCalledTimes(1);
  });

  it('updateStage() changes the stage sent in next heartbeat', async () => {
    const mockClient = createMockClient();
    const handle = startHeartbeat({
      executionId: 'exec-1',
      postgrestClient: mockClient,
      currentStage: 'initializing',
    });

    // First heartbeat with initial stage
    await vi.advanceTimersByTimeAsync(60000);
    expect(mockClient.patch).toHaveBeenLastCalledWith(
      'executions',
      'id=eq.exec-1',
      expect.objectContaining({
        current_stage: 'initializing',
      }),
    );

    // Update stage
    handle.updateStage('validating');

    // Second heartbeat with new stage
    await vi.advanceTimersByTimeAsync(60000);
    expect(mockClient.patch).toHaveBeenLastCalledWith(
      'executions',
      'id=eq.exec-1',
      expect.objectContaining({
        current_stage: 'validating',
      }),
    );

    handle.stop();
  });

  it('logs warning and continues when heartbeat fetch fails', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockClient.patch = vi.fn().mockRejectedValue(new Error('Network error'));

    const handle = startHeartbeat({
      executionId: 'exec-1',
      postgrestClient: mockClient,
    });

    await vi.advanceTimersByTimeAsync(60000);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[heartbeat] Failed to update execution exec-1'),
    );

    // Verify no exception was thrown (handle still works)
    handle.updateStage('test');
    expect(handle).toBeDefined();

    handle.stop();
    warnSpy.mockRestore();
  });

  it('skips DB write when executionId is null', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const handle = startHeartbeat({
      executionId: null,
      postgrestClient: mockClient,
    });

    await vi.advanceTimersByTimeAsync(60000);

    expect(mockClient.patch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[heartbeat] No executionId, skipping DB write');

    handle.stop();
    warnSpy.mockRestore();
  });

  it('respects custom intervalMs option', async () => {
    const mockClient = createMockClient();
    const handle = startHeartbeat({
      executionId: 'exec-1',
      postgrestClient: mockClient,
      intervalMs: 30000,
    });

    // Advance by 30s (custom interval)
    await vi.advanceTimersByTimeAsync(30000);

    expect(mockClient.patch).toHaveBeenCalledTimes(1);

    // Advance by another 30s
    await vi.advanceTimersByTimeAsync(30000);

    expect(mockClient.patch).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it('includes heartbeat_at timestamp in ISO format', async () => {
    const mockClient = createMockClient();
    const handle = startHeartbeat({
      executionId: 'exec-1',
      postgrestClient: mockClient,
    });

    await vi.advanceTimersByTimeAsync(60000);

    const callArgs = vi.mocked(mockClient.patch).mock.calls[0];
    const body = callArgs[2] as Record<string, unknown>;
    const timestamp = body.heartbeat_at as string;

    // Verify it's a valid ISO string
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(() => new Date(timestamp)).not.toThrow();

    handle.stop();
  });
});

describe('escalate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SLACK_WEBHOOK_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it('patches task status to AwaitingInput with failure_reason', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await escalate({
      executionId: 'exec-1',
      taskId: 'task-1',
      reason: 'Validation failed',
      postgrestClient: mockClient,
    });

    expect(mockClient.patch).toHaveBeenCalledWith(
      'tasks',
      'id=eq.task-1',
      expect.objectContaining({
        status: 'AwaitingInput',
        failure_reason: 'Validation failed',
        updated_at: expect.any(String),
      }),
    );

    warnSpy.mockRestore();
  });

  it('posts task_status_log with correct transition', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await escalate({
      executionId: 'exec-1',
      taskId: 'task-1',
      reason: 'Timeout',
      postgrestClient: mockClient,
    });

    expect(mockClient.post).toHaveBeenCalledWith('task_status_log', {
      task_id: 'task-1',
      from_status: 'Executing',
      to_status: 'AwaitingInput',
      actor: 'machine',
    });

    warnSpy.mockRestore();
  });

  it('posts to Slack webhook when SLACK_WEBHOOK_URL is set', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

    await escalate({
      executionId: 'exec-1',
      taskId: 'task-1',
      reason: 'Manual escalation',
      postgrestClient: mockClient,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://hooks.slack.com/test',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('task-1'),
      }),
    );

    warnSpy.mockRestore();
  });

  it('skips Slack POST when SLACK_WEBHOOK_URL is not set', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Ensure SLACK_WEBHOOK_URL is not set
    delete process.env.SLACK_WEBHOOK_URL;

    await escalate({
      executionId: 'exec-1',
      taskId: 'task-1',
      reason: 'Test escalation',
      postgrestClient: mockClient,
    });

    expect(fetchSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('logs warning but continues when task PATCH fails', async () => {
    const mockClient = createMockClient();
    mockClient.patch = vi.fn().mockRejectedValue(new Error('DB error'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await escalate({
      executionId: 'exec-1',
      taskId: 'task-1',
      reason: 'Test',
      postgrestClient: mockClient,
    });

    // Should log warning about patch failure
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[escalate] Failed to update task status'),
    );

    // But should still call post for task_status_log
    expect(mockClient.post).toHaveBeenCalledWith('task_status_log', expect.any(Object));

    warnSpy.mockRestore();
  });

  it('logs warning but continues when task_status_log POST fails', async () => {
    const mockClient = createMockClient();
    mockClient.post = vi.fn().mockRejectedValue(new Error('DB error'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await escalate({
      executionId: 'exec-1',
      taskId: 'task-1',
      reason: 'Test',
      postgrestClient: mockClient,
    });

    // Should log warning about post failure
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[escalate] Failed to write task_status_log'),
    );

    // But should still have called patch
    expect(mockClient.patch).toHaveBeenCalledWith('tasks', 'id=eq.task-1', expect.any(Object));

    warnSpy.mockRestore();
  });

  it('includes failedStage in Slack message when provided', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

    await escalate({
      executionId: 'exec-1',
      taskId: 'task-1',
      reason: 'Validation error',
      failedStage: 'data_processing',
      postgrestClient: mockClient,
    });

    const callArgs = fetchSpy.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);

    expect(body.text).toContain('data_processing');

    warnSpy.mockRestore();
  });

  it('logs escalation to stdout', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await escalate({
      executionId: 'exec-1',
      taskId: 'task-1',
      reason: 'Critical error',
      postgrestClient: mockClient,
    });

    expect(warnSpy).toHaveBeenCalledWith('[escalate] Task task-1: Critical error');

    warnSpy.mockRestore();
  });

  it('handles Slack webhook returning non-ok status', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchSpy);

    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

    await escalate({
      executionId: 'exec-1',
      taskId: 'task-1',
      reason: 'Test',
      postgrestClient: mockClient,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[escalate] Slack webhook returned HTTP 500'),
    );

    warnSpy.mockRestore();
  });

  it('handles Slack fetch error gracefully', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.fn().mockRejectedValue(new Error('Network timeout'));
    vi.stubGlobal('fetch', fetchSpy);

    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

    await escalate({
      executionId: 'exec-1',
      taskId: 'task-1',
      reason: 'Test',
      postgrestClient: mockClient,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[escalate] Failed to post to Slack'),
    );

    warnSpy.mockRestore();
  });
});
