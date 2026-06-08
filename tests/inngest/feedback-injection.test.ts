import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { createEmployeeLifecycleFunction } from '../../src/inngest/employee-lifecycle.js';

const MAX_EMPLOYEE_RULES_CHARS = 8000;

const {
  mockCreateMachine,
  mockDestroyMachine,
  mockGetTunnelUrl,
  mockUpdateMessage,
  mockPostMessage,
  mockCreateSlackClient,
  mockLoadTenantEnv,
  mockCallLLM,
} = vi.hoisted(() => {
  const mockCreateMachine = vi.fn();
  const mockDestroyMachine = vi.fn();
  const mockGetTunnelUrl = vi.fn();
  const mockUpdateMessage = vi.fn();
  const mockPostMessage = vi.fn();
  const mockCreateSlackClient = vi.fn();
  const mockLoadTenantEnv = vi.fn();
  const mockCallLLM = vi.fn();
  return {
    mockCreateMachine,
    mockDestroyMachine,
    mockGetTunnelUrl,
    mockUpdateMessage,
    mockPostMessage,
    mockCreateSlackClient,
    mockLoadTenantEnv,
    mockCallLLM,
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

vi.mock('../../src/lib/call-llm.js', () => ({
  callLLM: mockCallLLM,
}));

vi.mock('../../src/lib/platform-settings.js', () => ({
  getPlatformSetting: vi.fn().mockResolvedValue('8000'),
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

vi.mock('../../src/lib/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const TEST_TASK_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';

const inngest = new Inngest({ id: 'ai-employee-feedback-injection-test' });

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

function makeEngine(fetchImpl: (url: string, init?: RequestInit) => Promise<unknown>) {
  global.fetch = vi.fn().mockImplementation(fetchImpl);

  return new InngestTestEngine({
    function: createEmployeeLifecycleFunction(inngest),
    transformCtx: (ctx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mocked = mockCtx(ctx as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mocked as any).step.waitForEvent = vi.fn().mockResolvedValue({
        name: 'employee/approval.received',
        data: { taskId: TEST_TASK_ID, action: 'approve', userId: 'U123456' },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mocked as any).step.run = vi
        .fn()
        .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
          switch (id) {
            case 'load-task':
              return makeMockTaskData();
            case 'executing':
              return fn();
            case 'poll-completion':
              return 'Submitting';
            case 'check-classification':
              return { skipApproval: false };
            default:
              return undefined;
          }
        });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mocked as any;
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMachine.mockResolvedValue({ id: 'test-machine-id' });
  mockDestroyMachine.mockResolvedValue(undefined);
  mockGetTunnelUrl.mockResolvedValue('http://mock-tunnel.trycloudflare.com');
  mockUpdateMessage.mockResolvedValue({});
  mockPostMessage.mockResolvedValue({});
  mockCreateSlackClient.mockReturnValue({
    updateMessage: mockUpdateMessage,
    postMessage: mockPostMessage,
  });
  mockLoadTenantEnv.mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test-bot-token' });
  mockCallLLM.mockResolvedValue({
    content: '[{"theme":"tone","frequency":1,"representative_quote":"be warmer"}]',
    model: 'deepseek/deepseek-v4-flash',
    promptTokens: 5,
    completionTokens: 1,
    estimatedCostUsd: 0,
    latencyMs: 10,
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

describe('feedback injection — EMPLOYEE_RULES env var', () => {
  it('all confirmed employee_rules are included in EMPLOYEE_RULES', async () => {
    const rulesItems = Array.from({ length: 5 }, (_, i) => ({
      rule_text: `Rule item ${i + 1}`,
      confirmed_at: new Date(Date.now() - i * 1000).toISOString(),
    }));

    const engine = makeEngine(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if ((url as string).includes('knowledge_bases'))
        return { ok: true, json: () => Promise.resolve([]) };
      if ((url as string).includes('/rest/v1/employee_rules')) {
        return { ok: true, json: () => Promise.resolve(rulesItems) };
      }
      if (method === 'PATCH' || method === 'POST')
        return { ok: true, json: () => Promise.resolve([]) };
      return { ok: true, json: () => Promise.resolve([]) };
    });

    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();
    expect(mockCreateMachine).toHaveBeenCalledOnce();

    const machineConfig = mockCreateMachine.mock.calls[0][1] as { env: Record<string, string> };
    expect(machineConfig.env.EMPLOYEE_RULES).toContain('## Behavioral Rules — follow these');
    for (let i = 1; i <= 5; i++) {
      expect(machineConfig.env.EMPLOYEE_RULES).toContain(`Rule item ${i}`);
    }
  });

  it('employee_rules query uses status=eq.confirmed and archetype_id filter', async () => {
    const fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if ((url as string).includes('knowledge_bases'))
        return { ok: true, json: () => Promise.resolve([]) };
      if ((url as string).includes('/rest/v1/employee_rules'))
        return { ok: true, json: () => Promise.resolve([]) };
      if (method === 'PATCH' || method === 'POST')
        return { ok: true, json: () => Promise.resolve([]) };
      return { ok: true, json: () => Promise.resolve([]) };
    });
    global.fetch = fetchSpy;

    const engine = makeEngine(fetchSpy);
    await engine.execute(triggerEvent());

    const rulesCalls = fetchSpy.mock.calls.filter((args: unknown[]) => {
      const url = args[0] as string;
      return url.includes('/rest/v1/employee_rules') && !url.includes('PATCH');
    });
    expect(rulesCalls.length).toBeGreaterThan(0);
    const rulesUrl = rulesCalls[0][0] as string;
    expect(rulesUrl).toContain('status=eq.confirmed');
    expect(rulesUrl).toContain(`archetype_id=eq.${TEST_ARCHETYPE_ID}`);
  });

  it('empty employee_rules results in EMPLOYEE_RULES absent from machine env', async () => {
    const engine = makeEngine(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if ((url as string).includes('knowledge_bases'))
        return { ok: true, json: () => Promise.resolve([]) };
      if ((url as string).includes('/rest/v1/employee_rules'))
        return { ok: true, json: () => Promise.resolve([]) };
      if (method === 'PATCH' || method === 'POST')
        return { ok: true, json: () => Promise.resolve([]) };
      return { ok: true, json: () => Promise.resolve([]) };
    });

    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();
    expect(mockCreateMachine).toHaveBeenCalledOnce();

    const machineConfig = mockCreateMachine.mock.calls[0][1] as { env: Record<string, string> };
    expect(machineConfig.env.EMPLOYEE_RULES ?? '').toBe('');
  });

  it('safety cap truncates EMPLOYEE_RULES when it exceeds MAX_EMPLOYEE_RULES_CHARS', async () => {
    const longText = 'x'.repeat(2000);
    const rulesItems = Array.from({ length: 20 }, (_, i) => ({
      rule_text: longText,
      confirmed_at: new Date(Date.now() - i * 1000).toISOString(),
    }));

    const engine = makeEngine(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if ((url as string).includes('knowledge_bases'))
        return { ok: true, json: () => Promise.resolve([]) };
      if ((url as string).includes('/rest/v1/employee_rules'))
        return { ok: true, json: () => Promise.resolve(rulesItems) };
      if (method === 'PATCH' || method === 'POST')
        return { ok: true, json: () => Promise.resolve([]) };
      return { ok: true, json: () => Promise.resolve([]) };
    });

    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();
    expect(mockCreateMachine).toHaveBeenCalledOnce();

    const machineConfig = mockCreateMachine.mock.calls[0][1] as { env: Record<string, string> };
    const ctx = machineConfig.env.EMPLOYEE_RULES ?? '';
    const header = '## Behavioral Rules — follow these';
    const rulesSection = ctx.slice(header.length + 2);
    expect(rulesSection.length).toBeLessThanOrEqual(MAX_EMPLOYEE_RULES_CHARS);
  });

  it('KB themes are injected into EMPLOYEE_KNOWLEDGE without a slice cap', async () => {
    const kbEntries = Array.from({ length: 10 }, (_, i) => ({
      source_config: {
        themes: [
          {
            theme: `Theme ${i + 1}`,
            representative_quote: `Quote ${i + 1}`,
            frequency: i + 1,
          },
        ],
      },
    }));

    const engine = makeEngine(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if ((url as string).includes('knowledge_bases'))
        return { ok: true, json: () => Promise.resolve(kbEntries) };
      if ((url as string).includes('/rest/v1/employee_rules'))
        return { ok: true, json: () => Promise.resolve([]) };
      if (method === 'PATCH' || method === 'POST')
        return { ok: true, json: () => Promise.resolve([]) };
      return { ok: true, json: () => Promise.resolve([]) };
    });

    const { error } = await engine.execute(triggerEvent());
    expect(error).toBeUndefined();
    expect(mockCreateMachine).toHaveBeenCalledOnce();

    const machineConfig = mockCreateMachine.mock.calls[0][1] as { env: Record<string, string> };
    const ctx = machineConfig.env.EMPLOYEE_KNOWLEDGE ?? '';
    for (let i = 1; i <= 10; i++) {
      expect(ctx).toContain(`Theme ${i}`);
    }
  });
});
