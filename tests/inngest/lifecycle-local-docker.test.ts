import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { createEmployeeLifecycleFunction } from '../../src/inngest/employee-lifecycle.js';

// vi.hoisted() is required so these references are available inside vi.mock()
// factories, which Vitest hoists above all import statements at transpile time.
const mockExecSync = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() => vi.fn());

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

// employee-lifecycle.ts imports from 'node:child_process' — mock specifier must match
vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
  spawn: mockSpawn,
}));

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

const TEST_TASK_ID = '44444444-4444-4444-4444-444444444444';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';
const EXPECTED_CONTAINER_NAME = `employee-${TEST_TASK_ID.slice(0, 8)}`;

const inngest = new Inngest({ id: 'ai-employee-test-local-docker' });

function makeMockTaskData(overrides?: { approval_required?: boolean }) {
  return {
    id: TEST_TASK_ID,
    tenant_id: TEST_TENANT_ID,
    status: 'Ready',
    archetypes: {
      id: TEST_ARCHETYPE_ID,
      risk_model: {
        approval_required: overrides?.approval_required ?? true,
        timeout_hours: 24,
      },
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

function buildFetchMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
    if (method === 'PATCH' || method === 'POST') return makeOkFetchResponse([]);
    return makeOkFetchResponse([]);
  });
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

function makeEngine(stepOverrides: Record<string, 'fn' | unknown> = {}) {
  const fetchMock = buildFetchMock();
  vi.stubGlobal('fetch', fetchMock);

  const waitForEventMock = vi.fn().mockResolvedValue(null);

  const stepRunMock = vi.fn().mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
    if (id in stepOverrides) {
      const override = stepOverrides[id];
      if (override === 'fn') return fn();
      return override;
    }
    switch (id) {
      case 'load-task':
        return makeMockTaskData();
      case 'notify-received':
        return { ts: null, channel: null };
      case 'triaging':
      case 'awaiting-input':
      case 'ready':
      case 'validating':
      case 'submitting':
      case 'mark-failed':
      case 'set-reviewing':
      case 'track-pending-approval':
      case 'check-supersede':
      case 'handle-approval-result':
        return undefined;
      case 'executing':
        return 'mock-fly-machine-id';
      case 'poll-completion':
        return 'Submitting';
      case 'check-classification':
        return { skipApproval: false };
      case 'cleanup':
      case 'cleanup-on-failure':
      case 'cleanup-no-approval':
      case 'cleanup-no-action':
        return undefined;
      default:
        return undefined;
    }
  });

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

  return { engine, fetchMock, stepRunMock, waitForEventMock };
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

  mockSpawn.mockReturnValue({ unref: vi.fn() });
  mockExecSync.mockReturnValue('abc123def456\n');

  vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });

  process.env.USE_LOCAL_DOCKER = '1';
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-supabase-key';
  process.env.FLY_WORKER_APP = 'ai-employee-workers';
});

afterEach(() => {
  delete process.env.USE_LOCAL_DOCKER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.FLY_WORKER_APP;
  vi.unstubAllGlobals();
});

describe('employee-lifecycle — local Docker container management', () => {
  describe('runLocalDockerContainer', () => {
    it('Test 1: calls docker stop then docker rm -f before docker run -d', async () => {
      const { engine } = makeEngine({
        executing: 'fn',
        'poll-completion': 'Submitting',
      });

      const { error } = await engine.execute(triggerEvent());

      expect(error).toBeUndefined();

      const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
      const stopIdx = calls.findIndex((cmd) => cmd.includes('docker stop'));
      const rmIdx = calls.findIndex((cmd) => cmd.includes('docker rm -f'));
      const runIdx = calls.findIndex((cmd) => cmd.includes('docker run -d'));

      expect(stopIdx).toBeGreaterThanOrEqual(0);
      expect(rmIdx).toBeGreaterThan(stopIdx);
      expect(runIdx).toBeGreaterThan(rmIdx);

      expect(calls[stopIdx]).toContain(EXPECTED_CONTAINER_NAME);
      expect(calls[rmIdx]).toContain(EXPECTED_CONTAINER_NAME);

      expect(mockCreateMachine).not.toHaveBeenCalled();
    });

    it('Test 2: stopLocalDockerContainer handles non-existent container gracefully — no error thrown', async () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('docker: Error response from daemon: No such container');
        })
        .mockReturnValueOnce('abc123def456\n');

      const { engine } = makeEngine({
        executing: 'fn',
        'poll-completion': 'Submitting',
      });

      const { error } = await engine.execute(triggerEvent());

      expect(error).toBeUndefined();

      const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
      const runIdx = calls.findIndex((cmd) => cmd.includes('docker run -d'));
      expect(runIdx).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanup-on-failure step', () => {
    it('Test 3: docker_ machineId → calls docker stop, NOT destroyMachine', async () => {
      const { engine } = makeEngine({
        executing: 'docker_abc123def456',
        'poll-completion': 'Failed',
        'cleanup-on-failure': 'fn',
      });

      const { error } = await engine.execute(triggerEvent());

      expect(error).toBeUndefined();

      const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
      const stopCall = calls.find((cmd) => cmd.includes('docker stop'));
      expect(stopCall).toBeDefined();
      expect(stopCall).toContain(EXPECTED_CONTAINER_NAME);

      expect(mockDestroyMachine).not.toHaveBeenCalled();
    });

    it('Test 4: fly machineId → calls destroyMachine, NOT docker stop', async () => {
      delete process.env.USE_LOCAL_DOCKER;

      const { engine } = makeEngine({
        executing: 'machine-fly-123',
        'poll-completion': 'Failed',
        'cleanup-on-failure': 'fn',
      });

      const { error } = await engine.execute(triggerEvent());

      expect(error).toBeUndefined();

      expect(mockDestroyMachine).toHaveBeenCalledWith(expect.any(String), 'machine-fly-123');

      const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
      expect(calls.find((cmd) => cmd.includes('docker stop'))).toBeUndefined();
    });
  });

  describe('cleanup step (success path)', () => {
    it('Test 8: docker_ machineId → calls docker stop, NOT destroyMachine', async () => {
      const { engine, waitForEventMock } = makeEngine({
        executing: 'docker_abc123def456',
        'poll-completion': 'Submitting',
        'check-classification': { skipApproval: false },
        cleanup: 'fn',
      });

      waitForEventMock.mockResolvedValue({
        name: 'employee/approval.received',
        data: { taskId: TEST_TASK_ID, action: 'approve', userId: 'U123', userName: 'Test User' },
      });

      const { error } = await engine.execute(triggerEvent());

      expect(error).toBeUndefined();

      const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
      const stopCall = calls.find((cmd) => cmd.includes('docker stop'));
      expect(stopCall).toBeDefined();
      expect(stopCall).toContain(EXPECTED_CONTAINER_NAME);

      expect(mockDestroyMachine).not.toHaveBeenCalled();
    });
  });

  describe('cleanup-no-approval step', () => {
    it('docker_ machineId → calls docker stop, NOT destroyMachine (no-approval path)', async () => {
      const { engine } = makeEngine({
        'load-task': {
          id: TEST_TASK_ID,
          tenant_id: TEST_TENANT_ID,
          status: 'Ready',
          archetypes: {
            id: TEST_ARCHETYPE_ID,
            risk_model: { approval_required: false, timeout_hours: 24 },
            runtime: 'opencode',
            model: 'minimax/minimax-m2.7',
          },
        },
        executing: 'docker_abc123def456',
        'poll-completion': 'Submitting',
        'cleanup-no-approval': 'fn',
      });

      const { error } = await engine.execute(triggerEvent());

      expect(error).toBeUndefined();

      const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
      const stopCall = calls.find((cmd) => cmd.includes('docker stop'));
      expect(stopCall).toBeDefined();
      expect(stopCall).toContain(EXPECTED_CONTAINER_NAME);
      expect(mockDestroyMachine).not.toHaveBeenCalled();
    });
  });

  describe('cleanup-no-action step', () => {
    it('docker_ machineId → calls docker stop, NOT destroyMachine (no-action path)', async () => {
      const { engine } = makeEngine({
        executing: 'docker_abc123def456',
        'poll-completion': 'Submitting',
        'check-classification': { skipApproval: true },
        'cleanup-no-action': 'fn',
      });

      const { error } = await engine.execute(triggerEvent());

      expect(error).toBeUndefined();

      const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
      const stopCall = calls.find((cmd) => cmd.includes('docker stop'));
      expect(stopCall).toBeDefined();
      expect(stopCall).toContain(EXPECTED_CONTAINER_NAME);
      expect(mockDestroyMachine).not.toHaveBeenCalled();
    });
  });
});

// Tests 5-7: delivery retry and reply-anyway paths involve complex multi-step flows
// (Slack clients, approval events, delivery polling). These verify the implementation
// patterns exist in source rather than exercising the full lifecycle flow.
describe('employee-lifecycle — local Docker cleanup patterns in source (code inspection)', () => {
  let sourceCode: string;

  beforeEach(() => {
    sourceCode = readFileSync(join(process.cwd(), 'src/inngest/employee-lifecycle.ts'), 'utf8');
  });

  it('Test 5: delivery retry loop — stopLocalDockerContainer called at inter-attempt and post-poll', () => {
    expect(sourceCode).toContain(
      'stopLocalDockerContainer(`employee-delivery-${taskId.slice(0, 8)}`)',
    );
    expect(sourceCode).toContain("if (attempt > 0 && process.env.USE_LOCAL_DOCKER === '1')");

    const stopDeliveryOccurrences = (
      sourceCode.match(/stopLocalDockerContainer\(`employee-delivery-/g) ?? []
    ).length;
    expect(stopDeliveryOccurrences).toBeGreaterThanOrEqual(2);
  });

  it('Test 6: reply-anyway failure path — stopLocalDockerContainer called with employee-reply- prefix', () => {
    expect(sourceCode).toContain(
      'stopLocalDockerContainer(`employee-reply-${taskId.slice(0, 8)}`)',
    );
    expect(sourceCode).toContain("if (process.env.USE_LOCAL_DOCKER === '1')");
  });

  it('Test 7: reply-anyway success path — stopLocalDockerContainer also called on success (≥2 occurrences)', () => {
    const replyStopOccurrences = (
      sourceCode.match(/stopLocalDockerContainer\(`employee-reply-/g) ?? []
    ).length;
    expect(replyStopOccurrences).toBeGreaterThanOrEqual(2);
  });
});
