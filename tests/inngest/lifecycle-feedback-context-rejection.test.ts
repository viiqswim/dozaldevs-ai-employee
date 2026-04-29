import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { createEmployeeLifecycleFunction } from '../../src/inngest/employee-lifecycle.js';
import { createFeedbackSummarizerTrigger } from '../../src/inngest/triggers/feedback-summarizer.js';

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

vi.mock('../../src/lib/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const TEST_TASK_ID = '22222222-2222-2222-2222-222222222222';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';

const inngest = new Inngest({ id: 'ai-employee-rejection-feedback-test' });

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
  mockLoadTenantEnv.mockResolvedValue({
    SLACK_BOT_TOKEN: 'xoxb-test-bot-token',
  });
  mockCallLLM.mockResolvedValue({
    content: '[{"theme":"rejection","frequency":1,"representative_quote":"formal tone"}]',
    model: 'anthropic/claude-haiku-4-5',
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
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.FLY_WORKER_APP;
});

describe('rejection_reason feedback — FEEDBACK_CONTEXT and summarizer integration', () => {
  it('FEEDBACK_CONTEXT string includes rejection_reason feedback text when dispatch-machine runs', async () => {
    const rejectionText = 'The tone was too formal';

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

      if ((url as string).includes('knowledge_bases')) {
        return { ok: true, json: () => Promise.resolve([]) };
      }
      if ((url as string).includes('/rest/v1/feedback')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve([
              {
                correction_reason: rejectionText,
                feedback_type: 'rejection_reason',
                created_at: '2026-04-29T00:00:00Z',
              },
            ]),
        };
      }
      if (method === 'PATCH' || method === 'POST') {
        return { ok: true, json: () => Promise.resolve([]) };
      }
      return { ok: true, json: () => Promise.resolve([]) };
    });

    const engine = new InngestTestEngine({
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

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(mockCreateMachine).toHaveBeenCalledOnce();

    const machineConfig = mockCreateMachine.mock.calls[0][1] as {
      env: Record<string, string>;
    };

    expect(machineConfig.env).toHaveProperty('FEEDBACK_CONTEXT');
    expect(machineConfig.env.FEEDBACK_CONTEXT).toContain('Recent specific feedback:');
    expect(machineConfig.env.FEEDBACK_CONTEXT).toContain('[rejection_reason]');
    expect(machineConfig.env.FEEDBACK_CONTEXT).toContain(rejectionText);
  });

  it('feedback summarizer LLM prompt includes rejection_reason feedback text', async () => {
    const rejectionText = 'Do not sound so stiff';

    const mockInngest = {
      createFunction: vi.fn().mockImplementation((_config: unknown, handler: unknown) => handler),
    };
    const handler = createFeedbackSummarizerTrigger(mockInngest as any);

    const mockStep = {
      run: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('archetypes')) {
        return Promise.resolve({
          json: () => Promise.resolve([{ id: 'arch-1', role_name: 'Test Employee' }]),
        });
      }
      if ((url as string).includes('/rest/v1/feedback')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve([
              {
                id: 'fb-rejection-1',
                correction_reason: rejectionText,
                feedback_type: 'rejection_reason',
                created_at: new Date().toISOString(),
                task_id: null,
              },
            ]),
        });
      }
      if ((url as string).includes('knowledge_bases')) {
        return Promise.resolve({ json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ json: () => Promise.resolve([]) });
    });

    await (handler as unknown as (ctx: unknown) => Promise<unknown>)({ step: mockStep });

    expect(mockCallLLM).toHaveBeenCalledOnce();

    const messages = mockCallLLM.mock.calls[0][0].messages as Array<{
      role: string;
      content: string;
    }>;
    const userContent = messages[1].content;

    expect(userContent).toContain('[rejection_reason]');
    expect(userContent).toContain(rejectionText);
  });
});
