import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSpawn = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockStartOpencodeServer = vi.hoisted(() => vi.fn());
const mockCreateSessionManager = vi.hoisted(() => vi.fn());

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
  };
}

function buildMockFetch(opts: {
  deliveryInstructions?: string | null;
  deliverableContent?: string;
  deliverableRows?: unknown[];
}) {
  const {
    deliveryInstructions = 'Post the approved content to the #announcements Slack channel.',
    deliverableContent = 'The approved daily summary.',
    deliverableRows,
  } = opts;

  const taskRow = {
    id: 'test-task-id',
    status: 'Reviewing',
    tenant_id: null,
    archetypes: {
      id: 'arch-id',
      system_prompt: 'You are a helpful Slack assistant.',
      model: 'minimax/minimax-m2.7',
      delivery_instructions: deliveryInstructions,
    },
  };

  const delRows = deliverableRows ?? [
    { id: 'del-id', content: deliverableContent, delivery_type: 'text' },
  ];

  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'GET' && url.includes('/tasks')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([taskRow]) });
    }
    if (method === 'GET' && url.includes('/deliverables')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(delRows) });
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

async function loadHarness(): Promise<void> {
  await import('../../src/workers/opencode-harness.mts');
}

describe('opencode-harness — delivery phase', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let sessionManagerMock: ReturnType<typeof buildSessionManagerMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.TASK_ID = 'test-task-id';
    process.env.EMPLOYEE_PHASE = 'delivery';
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-key';
    delete process.env.INNGEST_BASE_URL;
    delete process.env.INNGEST_EVENT_KEY;

    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    mockReadFile.mockImplementation((path: string) => {
      if (path === '/tmp/summary.txt') return Promise.resolve(JSON.stringify({ delivered: true }));
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    mockStartOpencodeServer.mockResolvedValue(buildServerHandle());

    sessionManagerMock = buildSessionManagerMock();
    mockCreateSessionManager.mockReturnValue(sessionManagerMock);

    mockSpawn.mockImplementation(() => makeChildProcess(0));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.TASK_ID;
    delete process.env.EMPLOYEE_PHASE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it('happy path: patches task to Done when delivery confirmed', async () => {
    mockFetch = buildMockFetch({});
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForFetch(mockFetch, '/tasks', 'PATCH');

    const patchCalls = filterFetchCalls(mockFetch, '/tasks', 'PATCH');
    expect(patchCalls.length).toBeGreaterThan(0);

    const lastBody = JSON.parse((patchCalls.at(-1)![1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(lastBody).toMatchObject({ status: 'Done' });
  });

  it('null delivery_instructions: patches task to Failed, never calls spawn', async () => {
    mockFetch = buildMockFetch({ deliveryInstructions: null });
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForFetch(mockFetch, '/tasks', 'PATCH');

    const patchCall = findFetchCall(mockFetch, '/tasks', 'PATCH')!;
    const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      status: 'Failed',
      failure_reason: 'Archetype missing delivery_instructions',
    });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('missing deliverable: patches task to Failed, never calls spawn', async () => {
    mockFetch = buildMockFetch({ deliverableRows: [] });
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForFetch(mockFetch, '/tasks', 'PATCH');

    const patchCall = findFetchCall(mockFetch, '/tasks', 'PATCH')!;
    const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      status: 'Failed',
      failure_reason: 'No deliverable found for delivery phase',
    });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('opencode failure: patches task to Failed when OpenCode server fails to start', async () => {
    mockFetch = buildMockFetch({});
    vi.stubGlobal('fetch', mockFetch);
    mockStartOpencodeServer.mockResolvedValue(null);

    await loadHarness();

    await waitForFetch(mockFetch, '/tasks', 'PATCH');

    const patchCall = findFetchCall(mockFetch, '/tasks', 'PATCH')!;
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ status: 'Failed' });
  });

  it('correct instructions: task reaches Done when delivery instructions and content are provided', async () => {
    const approvedContent = 'Top story: new feature shipped today.';
    const deliveryInstr = 'Post the summary to the #daily-digest Slack channel.';
    mockFetch = buildMockFetch({
      deliverableContent: approvedContent,
      deliveryInstructions: deliveryInstr,
    });
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForFetch(mockFetch, '/tasks', 'PATCH');

    const patchCalls = filterFetchCalls(mockFetch, '/tasks', 'PATCH');
    const lastBody = JSON.parse((patchCalls.at(-1)![1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(lastBody).toMatchObject({ status: 'Done' });
  });

  it('delivery phase makes no POST to executions or deliverables tables', async () => {
    mockFetch = buildMockFetch({});
    vi.stubGlobal('fetch', mockFetch);

    await loadHarness();

    await waitForFetch(mockFetch, '/tasks', 'PATCH');

    expect(filterFetchCalls(mockFetch, '/executions', 'POST')).toHaveLength(0);
    expect(filterFetchCalls(mockFetch, '/deliverables', 'POST')).toHaveLength(0);
  });

  it('delivered:false in summary.txt: patches task to Failed', async () => {
    mockFetch = buildMockFetch({});
    vi.stubGlobal('fetch', mockFetch);
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/tmp/summary.txt') return Promise.resolve(JSON.stringify({ delivered: false }));
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    await loadHarness();

    await waitForFetch(mockFetch, '/tasks', 'PATCH');

    const patchCall = findFetchCall(mockFetch, '/tasks', 'PATCH')!;
    const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      status: 'Failed',
      failure_reason: 'Delivery not confirmed — send-message.ts may not have succeeded',
    });
  });

  it('invalid JSON in summary.txt: patches task to Failed', async () => {
    mockFetch = buildMockFetch({});
    vi.stubGlobal('fetch', mockFetch);
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/tmp/summary.txt') return Promise.resolve('not valid json');
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    await loadHarness();

    await waitForFetch(mockFetch, '/tasks', 'PATCH');

    const patchCall = findFetchCall(mockFetch, '/tasks', 'PATCH')!;
    const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      status: 'Failed',
      failure_reason: 'Delivery not confirmed — summary.txt is not valid JSON',
    });
  });

  it('missing summary.txt (ENOENT): patches task to Failed', async () => {
    mockFetch = buildMockFetch({});
    vi.stubGlobal('fetch', mockFetch);
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/tmp/approval-message.json')
        return Promise.resolve(JSON.stringify({ ts: 'mock-ts', channel: 'C123' }));
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    await loadHarness();

    await waitForFetch(mockFetch, '/tasks', 'PATCH');

    const patchCall = findFetchCall(mockFetch, '/tasks', 'PATCH')!;
    const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      status: 'Failed',
      failure_reason: 'Delivery not confirmed — no summary.txt produced',
    });
  });

  it('delivered:true with null messageId: patches task to Done', async () => {
    mockFetch = buildMockFetch({});
    vi.stubGlobal('fetch', mockFetch);
    mockReadFile.mockImplementation((path: string) => {
      if (path === '/tmp/summary.txt')
        return Promise.resolve(JSON.stringify({ delivered: true, messageId: null }));
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });

    await loadHarness();

    await waitForFetch(mockFetch, '/tasks', 'PATCH');

    const patchCalls = filterFetchCalls(mockFetch, '/tasks', 'PATCH');
    const lastBody = JSON.parse((patchCalls.at(-1)![1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(lastBody).toMatchObject({ status: 'Done' });
  });
});
