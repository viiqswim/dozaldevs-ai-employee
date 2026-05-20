import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSpawn = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockStartOpencodeServer = vi.hoisted(() => vi.fn());
const mockCreateSessionManager = vi.hoisted(() => vi.fn());
const mockExtractUsage = vi.hoisted(() => vi.fn());
const mockStartHeartbeat = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({ spawn: mockSpawn }));
vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/workers/lib/opencode-server.js', () => ({
  startOpencodeServer: mockStartOpencodeServer,
}));
vi.mock('../../src/workers/lib/session-manager.js', () => ({
  createSessionManager: mockCreateSessionManager,
  extractUsage: mockExtractUsage,
}));
vi.mock('../../src/workers/lib/heartbeat.js', () => ({
  startHeartbeat: mockStartHeartbeat,
}));
vi.mock('../../src/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

function makeChildProcess(exitCode: number) {
  const proc = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: NodeJS.EventEmitter;
    stderr: NodeJS.EventEmitter;
    killed: boolean;
    kill: (signal?: string) => void;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.kill = () => {
    proc.killed = true;
  };
  setTimeout(() => proc.emit('close', exitCode), 20);
  return proc;
}

function buildServerHandle() {
  return {
    url: 'http://localhost:4096',
    kill: vi.fn().mockResolvedValue(undefined),
    onExit: new Promise<number | null>(() => {
      // never resolves — session monitor wins the race
    }),
    stopKeepalive: vi.fn(),
    process: { killed: false, kill: vi.fn() },
  };
}

function buildSessionManagerMock() {
  return {
    createSession: vi.fn().mockResolvedValue('mock-session-id'),
    injectTaskPrompt: vi.fn().mockResolvedValue(true),
    monitorSession: vi.fn().mockResolvedValue({ completed: true, reason: 'idle' }),
    abortSession: vi.fn().mockResolvedValue(undefined),
    sendFixPrompt: vi.fn().mockResolvedValue(true),
    getTranscript: vi.fn().mockResolvedValue([{ role: 'assistant', content: 'Done' }]),
  };
}

function buildMetricsMockFetch() {
  const taskRow = {
    id: 'test-task-id',
    status: 'Ready',
    tenant_id: null,
    archetypes: {
      id: 'arch-id',
      role_name: null,
      enrichment_adapter: null,
      system_prompt: 'You are a helpful assistant.',
      model: 'minimax/minimax-m2.7',
      instructions: 'Complete the task.',
      delivery_instructions: null,
      agents_md: null,
    },
  };

  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'GET' && url.includes('/tasks')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([taskRow]) });
    }
    if (method === 'GET' && url.includes('/tenants')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (method === 'POST' && url.includes('/executions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: 'mock-exec-id' }]),
      });
    }
    if (method === 'PATCH' && url.includes('/executions')) {
      const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }
    if (method === 'PATCH' && url.includes('/tasks')) {
      const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }
    if (method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{}]) });
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
}

function findFetchCall(
  mockFetch: ReturnType<typeof vi.fn>,
  urlSubstr: string,
  method: string,
): unknown[] | undefined {
  return mockFetch.mock.calls.find((args: unknown[]) => {
    const url = args[0] as string;
    const m = ((args[1] as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
    return url.includes(urlSubstr) && m === method.toUpperCase();
  });
}

function filterFetchCalls(
  mockFetch: ReturnType<typeof vi.fn>,
  urlSubstr: string,
  method: string,
): unknown[][] {
  return mockFetch.mock.calls.filter((args: unknown[]) => {
    const url = args[0] as string;
    const m = ((args[1] as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
    return url.includes(urlSubstr) && m === method.toUpperCase();
  });
}

function waitForFetch(mockFetch: ReturnType<typeof vi.fn>, urlSubstr: string, method: string) {
  return vi.waitFor(() => expect(findFetchCall(mockFetch, urlSubstr, method)).toBeDefined(), {
    timeout: 12000,
    interval: 50,
  });
}

function waitForPatchWithBody(
  mockFetch: ReturnType<typeof vi.fn>,
  urlSubstr: string,
  bodyMatcher: (body: Record<string, unknown>) => boolean,
) {
  return vi.waitFor(
    () => {
      const calls = filterFetchCalls(mockFetch, urlSubstr, 'PATCH');
      const match = calls.find((args) => {
        try {
          const body = JSON.parse((args[1] as RequestInit).body as string) as Record<
            string,
            unknown
          >;
          return bodyMatcher(body);
        } catch {
          return false;
        }
      });
      expect(match).toBeDefined();
    },
    { timeout: 12000, interval: 50 },
  );
}

function waitForProcessExit(exitSpy: ReturnType<typeof vi.fn>) {
  return vi.waitFor(() => expect(exitSpy).toHaveBeenCalled(), { timeout: 12000, interval: 50 });
}

async function loadHarness(): Promise<void> {
  await import('../../src/workers/opencode-harness.mts');
}

describe('opencode-harness — execution metrics', () => {
  let sessionManagerMock: ReturnType<typeof buildSessionManagerMock>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.TASK_ID = 'test-task-id';
    delete process.env.EMPLOYEE_PHASE;
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-key';
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.INNGEST_BASE_URL;
    delete process.env.INNGEST_EVENT_KEY;

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    mockReadFile.mockImplementation((path: string) => {
      if (path === '/tmp/summary.txt') return Promise.resolve('task-done');
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    mockStartOpencodeServer.mockResolvedValue(buildServerHandle());

    sessionManagerMock = buildSessionManagerMock();
    mockCreateSessionManager.mockReturnValue(sessionManagerMock);

    mockExtractUsage.mockReturnValue({
      promptTokens: 100,
      completionTokens: 200,
      estimatedCostUsd: 0.05,
    });

    mockStartHeartbeat.mockReturnValue({ stop: vi.fn(), updateStage: vi.fn() });

    mockSpawn.mockImplementation(() => makeChildProcess(0));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.TASK_ID;
    delete process.env.EMPLOYEE_PHASE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it('patches tasks with started_at when entering Executing state', async () => {
    const mockFetch = buildMetricsMockFetch();
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForProcessExit(exitSpy);

    await waitForPatchWithBody(mockFetch, '/tasks', (b) => b.status === 'Executing');

    const patchCalls = filterFetchCalls(mockFetch, '/tasks', 'PATCH');
    const executingPatch = patchCalls.find((args) => {
      const body = JSON.parse((args[1] as RequestInit).body as string) as Record<string, unknown>;
      return body.status === 'Executing';
    });
    expect(executingPatch).toBeDefined();
    const body = JSON.parse(
      ((executingPatch as unknown[])[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: 'Executing',
      started_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it('calls startHeartbeat with executionId and postgrestClient after execution record creation', async () => {
    const mockFetch = buildMetricsMockFetch();
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForProcessExit(exitSpy);

    expect(mockStartHeartbeat).toHaveBeenCalledWith({
      executionId: 'mock-exec-id',
      postgrestClient: expect.any(Object),
    });
  });

  it('patches executions with status completed after successful session', async () => {
    const mockFetch = buildMetricsMockFetch();
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForProcessExit(exitSpy);

    const patchCall = findFetchCall(mockFetch, '/executions', 'PATCH')!;
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ status: 'completed' });
  });

  it('patches executions with token usage after successful session', async () => {
    const mockFetch = buildMetricsMockFetch();
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForProcessExit(exitSpy);

    const patchCall = findFetchCall(mockFetch, '/executions', 'PATCH')!;
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      prompt_tokens: 100,
      completion_tokens: 200,
      estimated_cost_usd: 0.05,
    });
  });

  it('patches executions with session_transcript after successful session', async () => {
    const mockFetch = buildMetricsMockFetch();
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForProcessExit(exitSpy);

    const patchCall = findFetchCall(mockFetch, '/executions', 'PATCH')!;
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toHaveProperty('session_transcript');
    expect(Array.isArray(body.session_transcript)).toBe(true);
  });

  it('patches tasks with completed_at after successful session', async () => {
    const mockFetch = buildMetricsMockFetch();
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForProcessExit(exitSpy);

    const patchCalls = filterFetchCalls(mockFetch, '/tasks', 'PATCH');
    const completedAtPatch = patchCalls.find((args) => {
      const body = JSON.parse((args[1] as RequestInit).body as string) as Record<string, unknown>;
      return 'completed_at' in body;
    });
    expect(completedAtPatch).toBeDefined();
    const body = JSON.parse(
      ((completedAtPatch as unknown[])[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('on session failure: patches tasks with failure_code (not null)', async () => {
    mockStartOpencodeServer.mockResolvedValue(null);

    const mockFetch = buildMetricsMockFetch();
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForProcessExit(exitSpy);

    const patchCalls = filterFetchCalls(mockFetch, '/tasks', 'PATCH');
    const failedPatch = patchCalls.find((args) => {
      const body = JSON.parse((args[1] as RequestInit).body as string) as Record<string, unknown>;
      return body.status === 'Failed';
    });
    expect(failedPatch).toBeDefined();
    const body = JSON.parse(
      ((failedPatch as unknown[])[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body.failure_code).not.toBeNull();
    expect(typeof body.failure_code).toBe('string');
    expect(body.failure_code).toBe('session_failed');
  });

  it('SIGTERM handler patches tasks with failure_code worker_terminated', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && url.includes('/tasks')) {
        return new Promise(() => {
          // never resolves — keeps main() stuck
        });
      }
      if (method === 'PATCH' && url.includes('/tasks')) {
        const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await Promise.resolve();

    process.emit('SIGTERM');

    await waitForPatchWithBody(mockFetch, '/tasks', (b) => b.failure_code === 'worker_terminated');

    const patchCalls = filterFetchCalls(mockFetch, '/tasks', 'PATCH');
    const sigtermPatch = patchCalls.find((args) => {
      const body = JSON.parse((args[1] as RequestInit).body as string) as Record<string, unknown>;
      return body.failure_code === 'worker_terminated';
    });
    expect(sigtermPatch).toBeDefined();
    const body = JSON.parse(
      ((sigtermPatch as unknown[])[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: 'Failed',
      failure_reason: 'Worker terminated',
      failure_code: 'worker_terminated',
    });
  });
});
