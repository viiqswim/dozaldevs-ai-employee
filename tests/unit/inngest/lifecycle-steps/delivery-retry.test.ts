import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPatchTask = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockClearPendingApprovalByTaskId = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRunLocalDockerContainer = vi.hoisted(() =>
  vi.fn().mockReturnValue({ id: 'docker_mock-id' }),
);
const mockStopLocalDockerContainer = vi.hoisted(() => vi.fn());
const mockCreateMachine = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'fly-machine-id' }));
const mockDestroyMachine = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetTunnelUrl = vi.hoisted(() =>
  vi.fn().mockResolvedValue('https://mock-tunnel.example.com'),
);
const mockGetPlatformSetting = vi.hoisted(() => vi.fn().mockResolvedValue('shared-cpu-1x'));
const mockUpdateMessage = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockCreateSlackClient = vi.hoisted(() =>
  vi.fn().mockReturnValue({ updateMessage: mockUpdateMessage }),
);

vi.mock('../../../../src/inngest/lib/lifecycle-helpers.js', () => ({
  patchTask: mockPatchTask,
  runLocalDockerContainer: mockRunLocalDockerContainer,
  stopLocalDockerContainer: mockStopLocalDockerContainer,
}));

vi.mock('../../../../src/inngest/lib/pending-approvals.js', () => ({
  clearPendingApprovalByTaskId: mockClearPendingApprovalByTaskId,
}));

vi.mock('../../../../src/lib/fly-client.js', () => ({
  createMachine: mockCreateMachine,
  destroyMachine: mockDestroyMachine,
}));

vi.mock('../../../../src/lib/tunnel-client.js', () => ({
  getTunnelUrl: mockGetTunnelUrl,
}));

vi.mock('../../../../src/lib/platform-settings.js', () => ({
  getPlatformSetting: mockGetPlatformSetting,
}));

vi.mock('../../../../src/lib/slack-client.js', () => ({
  createSlackClient: mockCreateSlackClient,
}));

vi.mock('../../../../src/lib/config.js', () => ({
  WORKER_RUNTIME: 'docker',
  INNGEST_EVENT_KEY: 'test-inngest-key',
  INNGEST_BASE_URL: 'http://localhost:8288',
  GATEWAY_URL: 'http://localhost:7700',
  FLY_WORKER_IMAGE: 'ai-employee-worker:latest',
}));

vi.mock('../../../../src/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { runDeliveryWithRetry } from '../../../../src/inngest/lifecycle/steps/delivery-retry.js';
import type { DeliveryRetryContext } from '../../../../src/inngest/lifecycle/steps/delivery-retry.js';

const TASK_ID = 'dddd0001-0000-0000-0000-000000000000';
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'test-key';
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

function makeCtx(overrides: Partial<DeliveryRetryContext> = {}): DeliveryRetryContext {
  return {
    taskId: TASK_ID,
    tenantId: '00000000-0000-0000-0000-000000000002',
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    headers: HEADERS,
    archetype: { role_name: 'Test Employee', vm_size: null },
    approvalRequired: true,
    notifyMsgRef: { ts: 'ts-notify-001', channel: 'C-NOTIFY' },
    tenantEnv: { SLACK_BOT_TOKEN: 'xoxb-test', NOTIFICATION_CHANNEL: 'C-NOTIFY' },
    taskRawEvent: {},
    slackClient: { updateMessage: mockUpdateMessage } as unknown as ReturnType<
      typeof import('../../../../src/lib/slack-client.js').createSlackClient
    >,
    approvalMsgTs: 'ts-approval-001',
    targetChannel: 'C-APPROVAL',
    ...overrides,
  };
}

function makeFetchWithDeliveryStatus(statusAfterPoll: string) {
  return vi.fn().mockImplementation(async (url: string) => {
    if ((url as string).includes('select=archetypes(delivery_instructions)')) {
      return {
        json: async () => [{ archetypes: { delivery_instructions: 'Deliver this.' } }],
      };
    }
    if ((url as string).includes('select=status')) {
      return {
        json: async () => [{ status: statusAfterPoll }],
      };
    }
    return { json: async () => [] };
  });
}

async function runWithFakeTimers<T>(fn: () => Promise<T>): Promise<T> {
  const promise = fn();
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('runDeliveryWithRetry — config-fail path', () => {
  it('returns config-fail and patches task to Failed when delivery_instructions is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if ((url as string).includes('select=archetypes(delivery_instructions)')) {
          return { json: async () => [{ archetypes: { delivery_instructions: null } }] };
        }
        if ((init as RequestInit | undefined)?.method === 'PATCH') {
          return { ok: true };
        }
        return { json: async () => [] };
      }),
    );

    const result = await runDeliveryWithRetry(makeCtx());

    expect(result.status).toBe('config-fail');
    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({
        status: 'Failed',
        failure_reason: 'Archetype missing delivery_instructions',
      }),
    );
  });

  it('returns config-fail when archetypes row is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if ((url as string).includes('select=archetypes(delivery_instructions)')) {
          return { json: async () => [] };
        }
        return { json: async () => [] };
      }),
    );

    const result = await runDeliveryWithRetry(makeCtx());
    expect(result.status).toBe('config-fail');
  });

  it('sends Slack update when config-fail and notifyMsgRef is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if ((url as string).includes('select=archetypes(delivery_instructions)')) {
          return { json: async () => [{ archetypes: { delivery_instructions: null } }] };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    await runDeliveryWithRetry(makeCtx());

    expect(mockCreateSlackClient).toHaveBeenCalledWith(
      expect.objectContaining({ botToken: 'xoxb-test' }),
    );
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      'C-NOTIFY',
      'ts-notify-001',
      expect.stringContaining('❌'),
      expect.any(Array),
    );
  });

  it('does NOT send Slack update when notifyMsgRef has no ts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if ((url as string).includes('select=archetypes(delivery_instructions)')) {
          return { json: async () => [{ archetypes: { delivery_instructions: null } }] };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    await runDeliveryWithRetry(makeCtx({ notifyMsgRef: { ts: null, channel: null } }));

    expect(mockUpdateMessage).not.toHaveBeenCalled();
  });
});

describe('runDeliveryWithRetry — happy path (docker mode)', () => {
  it('returns done when delivery container transitions to Done on first attempt', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Done'));

    const result = await runWithFakeTimers(() => runDeliveryWithRetry(makeCtx()));

    expect(result.status).toBe('done');
    expect(mockRunLocalDockerContainer).toHaveBeenCalledOnce();
    expect(mockPatchTask).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: 'Failed' }),
    );
  });

  it('spawns container with expected environment variables', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Done'));

    await runWithFakeTimers(() =>
      runDeliveryWithRetry(
        makeCtx({
          taskRawEvent: { lead_uid: 'lead-aaa', thread_uid: 'thread-bbb' },
        }),
      ),
    );

    const callArgs = mockRunLocalDockerContainer.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.env).toMatchObject({
      TASK_ID: TASK_ID,
      EMPLOYEE_PHASE: 'delivery',
      LEAD_UID: 'lead-aaa',
      THREAD_UID: 'thread-bbb',
    });
  });

  it('calls stopLocalDockerContainer after delivery loop completes', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Done'));

    await runWithFakeTimers(() => runDeliveryWithRetry(makeCtx()));

    expect(mockStopLocalDockerContainer).toHaveBeenCalledWith(
      `employee-delivery-${TASK_ID.slice(0, 8)}`,
    );
  });

  it('uses platform setting for vm_size when archetype vm_size is null', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Done'));

    await runWithFakeTimers(() =>
      runDeliveryWithRetry(makeCtx({ archetype: { role_name: 'Test', vm_size: null } })),
    );

    expect(mockGetPlatformSetting).toHaveBeenCalledWith('default_worker_vm_size');
  });
});

describe('runDeliveryWithRetry — retry loop', () => {
  it('retries up to 3 times and returns failed when delivery never succeeds', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Failed'));

    const result = await runWithFakeTimers(() => runDeliveryWithRetry(makeCtx()));

    expect(result.status).toBe('failed');
    expect(mockRunLocalDockerContainer).toHaveBeenCalledTimes(3);
  });

  it('patches task back to Delivering before each retry attempt', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Failed'));

    await runWithFakeTimers(() => runDeliveryWithRetry(makeCtx()));

    const deliveringCalls = (
      mockPatchTask.mock.calls as Array<
        [string, Record<string, string>, string, Record<string, unknown>]
      >
    ).filter(([, , , fields]) => fields.status === 'Delivering');
    expect(deliveringCalls).toHaveLength(2);
  });

  it('patches task to Failed with correct reason after 3 failed attempts', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Failed'));

    await runWithFakeTimers(() => runDeliveryWithRetry(makeCtx()));

    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({
        status: 'Failed',
        failure_reason: 'Delivery failed after 3 attempts',
      }),
    );
  });

  it('clears pending approval after 3 failed attempts', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Failed'));

    await runWithFakeTimers(() => runDeliveryWithRetry(makeCtx()));

    expect(mockClearPendingApprovalByTaskId).toHaveBeenCalledWith(
      SUPABASE_URL,
      SUPABASE_KEY,
      TASK_ID,
    );
  });

  it('updates approval message via slackClient after 3 failed attempts when approvalMsgTs set', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Failed'));

    await runWithFakeTimers(() =>
      runDeliveryWithRetry(
        makeCtx({ approvalMsgTs: 'ts-approval-001', targetChannel: 'C-APPROVAL' }),
      ),
    );

    expect(mockUpdateMessage).toHaveBeenCalledWith(
      'C-APPROVAL',
      'ts-approval-001',
      expect.stringContaining('❌'),
      expect.any(Array),
    );
  });

  it('does NOT update approval message when approvalMsgTs is missing', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Failed'));

    const ctx = makeCtx({ approvalMsgTs: undefined, targetChannel: undefined });
    await runWithFakeTimers(() => runDeliveryWithRetry(ctx));

    const approvalCalls = mockUpdateMessage.mock.calls.filter(
      ([chan]: [string]) => chan === 'C-APPROVAL',
    );
    expect(approvalCalls).toHaveLength(0);
  });

  it('succeeds on second attempt if first returns Failed but second returns Done', async () => {
    let pollCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if ((url as string).includes('select=archetypes(delivery_instructions)')) {
          return { json: async () => [{ archetypes: { delivery_instructions: 'Deliver.' } }] };
        }
        if ((url as string).includes('select=status')) {
          pollCount++;
          const status = pollCount <= 1 ? 'Failed' : 'Done';
          return { json: async () => [{ status }] };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    const result = await runWithFakeTimers(() => runDeliveryWithRetry(makeCtx()));

    expect(result.status).toBe('done');
    expect(mockRunLocalDockerContainer).toHaveBeenCalledTimes(2);
  });
});

describe('runDeliveryWithRetry — notify-received Slack update on failure', () => {
  it('calls notifyMsgRef update when delivery fails after 3 attempts and SLACK_BOT_TOKEN set', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Failed'));

    await runWithFakeTimers(() =>
      runDeliveryWithRetry(
        makeCtx({
          notifyMsgRef: { ts: 'ts-notify-001', channel: 'C-NOTIFY' },
          tenantEnv: { SLACK_BOT_TOKEN: 'xoxb-test', NOTIFICATION_CHANNEL: 'C-NOTIFY' },
          slackClient: undefined,
        }),
      ),
    );

    expect(mockCreateSlackClient).toHaveBeenCalled();
  });

  it('does NOT attempt notify update when notifyMsgRef is null', async () => {
    vi.stubGlobal('fetch', makeFetchWithDeliveryStatus('Failed'));

    await runWithFakeTimers(() =>
      runDeliveryWithRetry(makeCtx({ notifyMsgRef: null, slackClient: undefined })),
    );

    expect(mockCreateSlackClient).not.toHaveBeenCalled();
  });
});
