import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { createEmployeeLifecycleFunction } from '../../src/inngest/employee-lifecycle.js';

// vi.hoisted() is required so these references are available inside vi.mock()
// factories, which Vitest hoists above all import statements at transpile time.
const {
  mockCreateMachine,
  mockDestroyMachine,
  mockGetTunnelUrl,
  mockUpdateMessage,
  mockPostMessage,
  mockCreateSlackClient,
  mockLoadTenantEnv,
} = vi.hoisted(() => {
  const mockCreateMachine = vi.fn();
  const mockDestroyMachine = vi.fn();
  const mockGetTunnelUrl = vi.fn();
  const mockUpdateMessage = vi.fn();
  const mockPostMessage = vi.fn();
  const mockCreateSlackClient = vi.fn();
  const mockLoadTenantEnv = vi.fn();
  return {
    mockCreateMachine,
    mockDestroyMachine,
    mockGetTunnelUrl,
    mockUpdateMessage,
    mockPostMessage,
    mockCreateSlackClient,
    mockLoadTenantEnv,
  };
});

vi.mock('../../src/lib/fly-client.js', () => ({
  createMachine: mockCreateMachine,
  destroyMachine: mockDestroyMachine,
}));

vi.mock('../../src/lib/tunnel-client.js', () => ({
  getTunnelUrl: mockGetTunnelUrl,
}));

vi.mock('../../src/lib/slack-client.js', () => ({
  createSlackClient: mockCreateSlackClient,
}));

vi.mock('../../src/gateway/services/tenant-env-loader.js', () => ({
  loadTenantEnv: mockLoadTenantEnv,
}));

vi.mock('../../src/gateway/services/tenant-repository.js', () => ({
  TenantRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/gateway/services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
  Prisma: { JsonNull: 'JsonNull' },
}));

vi.mock('../../src/lib/platform-settings.js', () => ({
  getPlatformSetting: vi.fn().mockResolvedValue('performance-1x'),
  validateRequiredPlatformSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/config.js', () => ({
  requireEnv: (name: string) => {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required environment variable: ${name}`);
    return val;
  },
  getEnv: (name: string, def: string) => process.env[name] ?? def,
  INNGEST_EVENT_KEY: 'local',
  INNGEST_BASE_URL: 'http://localhost:8288',
  GATEWAY_URL: '',
  WORKER_RUNTIME: 'fly',
  FLY_WORKER_IMAGE: 'registry.fly.io/ai-employee-workers:latest',
}));

const TEST_TASK_ID = '33333333-3333-3333-3333-333333333333';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';

const inngest = new Inngest({ id: 'ai-employee-test-notify-msg-ts' });

function makeMockTaskData() {
  return {
    id: TEST_TASK_ID,
    tenant_id: TEST_TENANT_ID,
    status: 'Ready',
    archetypes: {
      id: TEST_ARCHETYPE_ID,
      risk_model: { approval_required: true, timeout_hours: 24 },
      runtime: 'opencode',
      model: 'minimax/minimax-m2.7',
    },
  };
}

function makeOkFetchResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
}

function buildExecutingFetchMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
    if (method === 'PATCH' || method === 'POST') return makeOkFetchResponse([]);
    return makeOkFetchResponse([]);
  });
}

function makeEngine(notifyMsgRef: { ts: string | null; channel: string | null }) {
  const fetchMock = buildExecutingFetchMock();
  vi.stubGlobal('fetch', fetchMock);

  const stepRunMock = vi.fn().mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
    switch (id) {
      case 'load-task':
        return makeMockTaskData();
      case 'notify-received':
        return notifyMsgRef;
      case 'triaging':
      case 'awaiting-input':
      case 'ready':
        return undefined;
      case 'executing':
        return fn();
      case 'poll-completion':
        return 'Submitting';
      case 'check-classification':
        return { skipApproval: false };
      case 'set-reviewing':
        return undefined;
      default:
        return undefined;
    }
  });

  const waitForEventMock = vi.fn().mockResolvedValue(null);

  const engine = new InngestTestEngine({
    function: createEmployeeLifecycleFunction(inngest),
    transformCtx: (ctx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mocked = mockCtx(ctx as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mocked as any).step.run = stepRunMock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mocked as any).step.waitForEvent = waitForEventMock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mocked as any;
    },
  });

  return { engine, fetchMock, stepRunMock };
}

function triggerEvent(): { events: [{ name: string; data: Record<string, unknown> }] } {
  return {
    events: [
      {
        name: 'employee/task.dispatched',
        data: { taskId: TEST_TASK_ID, archetypeId: TEST_ARCHETYPE_ID },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMachine.mockResolvedValue({ id: 'mock-machine-id' });
  mockDestroyMachine.mockResolvedValue(undefined);
  mockGetTunnelUrl.mockResolvedValue('http://mock-tunnel.trycloudflare.com');
  mockUpdateMessage.mockResolvedValue({});
  mockPostMessage.mockResolvedValue({});
  mockCreateSlackClient.mockReturnValue({
    updateMessage: mockUpdateMessage,
    postMessage: mockPostMessage,
  });
  mockLoadTenantEnv.mockResolvedValue({
    SLACK_BOT_TOKEN: 'xoxb-test-bot-token',
    SUMMARY_TARGET_CHANNEL: 'C-FALLBACK',
  });

  vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });

  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-supabase-key';
  process.env.FLY_WORKER_APP = 'ai-employee-workers';
  process.env.WORKER_RUNTIME = 'fly';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.FLY_WORKER_APP;
  delete process.env.WORKER_RUNTIME;
});

describe('employee-lifecycle — NOTIFY_MSG_TS injection into executing machine env', () => {
  it('Test A: notify-received ts present → NOTIFY_MSG_TS injected with correct value', async () => {
    const { engine } = makeEngine({ ts: '111.222', channel: 'C123' });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(mockCreateMachine).toHaveBeenCalledOnce();

    const firstCall = mockCreateMachine.mock.calls[0] as [string, Record<string, unknown>];
    const machineConfig = firstCall[1] as { env?: Record<string, string> };
    expect(machineConfig.env?.NOTIFY_MSG_TS).toBe('111.222');
  });

  it('Test B: notify-received ts is null → NOTIFY_MSG_TS injected as empty string', async () => {
    const { engine } = makeEngine({ ts: null, channel: null });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(mockCreateMachine).toHaveBeenCalledOnce();

    const firstCall = mockCreateMachine.mock.calls[0] as [string, Record<string, unknown>];
    const machineConfig = firstCall[1] as { env?: Record<string, string> };
    expect(machineConfig.env?.NOTIFY_MSG_TS).toBe('');
  });
});
