import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockLoadTenantSlack,
  mockPatchTask,
  mockLogStatusTransition,
  mockMergeTaskMetadata,
  mockGetAdapter,
  mockCreateSlackClient,
  mockSupersedeUpdateMessage,
  mockSlackPostMessage,
  mockSlackUpdateMessage,
} = vi.hoisted(() => ({
  mockLoadTenantSlack: vi.fn(),
  mockPatchTask: vi.fn().mockResolvedValue(undefined),
  mockLogStatusTransition: vi.fn().mockResolvedValue(undefined),
  mockMergeTaskMetadata: vi.fn().mockResolvedValue(undefined),
  mockGetAdapter: vi.fn().mockReturnValue(undefined),
  mockCreateSlackClient: vi.fn(),
  mockSupersedeUpdateMessage: vi.fn().mockResolvedValue(undefined),
  mockSlackPostMessage: vi.fn(),
  mockSlackUpdateMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/inngest/lifecycle/steps/notify-and-track.js', () => ({
  loadTenantSlack: mockLoadTenantSlack,
}));

vi.mock('../../../../src/inngest/lib/lifecycle-helpers.js', () => ({
  patchTask: mockPatchTask,
  logStatusTransition: mockLogStatusTransition,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/lifecycle-helpers.js', () => ({
  mergeTaskMetadata: mockMergeTaskMetadata,
}));

vi.mock('../../../../src/lib/enrichment-adapters/index.js', () => ({
  getAdapter: mockGetAdapter,
}));

vi.mock('../../../../src/lib/enrichment-adapters/all.js', () => ({}));

vi.mock('../../../../src/lib/slack-client.js', () => ({
  createSlackClient: mockCreateSlackClient,
}));

vi.mock('../../../../src/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { runTriageAndReady } from '../../../../src/inngest/lifecycle/steps/triage-and-ready.js';
import type { TriageContext } from '../../../../src/inngest/lifecycle/steps/triage-and-ready.js';

const TASK_ID = 'aaaa1001-0000-0000-0000-000000000000';
const ARCHETYPE_ID = 'arch1001-0000-0000-0000-000000000000';
const TENANT_ID = '00000000-0000-0000-0000-000000000002';
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'test-key';
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

function makeOkFetch(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
}

interface TaskRowOpts {
  tenantId?: string | null;
  rawEvent?: Record<string, unknown>;
  riskModel?: Record<string, unknown>;
  omitRiskModel?: boolean;
  roleName?: string;
  enrichmentAdapter?: string;
  notificationChannel?: string;
}

function buildTaskRow(opts: TaskRowOpts = {}): Record<string, unknown> {
  const {
    tenantId = TENANT_ID,
    rawEvent = {},
    riskModel = { approval_required: true, timeout_hours: 12 },
    omitRiskModel = false,
    roleName = 'Test Employee',
    enrichmentAdapter,
    notificationChannel,
  } = opts;
  const archetypes: Record<string, unknown> = {
    id: ARCHETYPE_ID,
    role_name: roleName,
  };
  if (!omitRiskModel) archetypes.risk_model = riskModel;
  if (enrichmentAdapter) archetypes.enrichment_adapter = enrichmentAdapter;
  if (notificationChannel) archetypes.notification_channel = notificationChannel;
  const row: Record<string, unknown> = {
    id: TASK_ID,
    raw_event: rawEvent,
    archetypes,
  };
  if (tenantId !== null) row.tenant_id = tenantId;
  return row;
}

function buildFetch(taskRow: Record<string, unknown> | null): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (url: string) => {
    if ((url as string).includes('/tasks?id=eq.') && (url as string).includes('archetypes')) {
      return makeOkFetch(taskRow === null ? [] : [taskRow]);
    }
    return makeOkFetch([]);
  });
}

function makeCtx(overrides: Partial<TriageContext> = {}): TriageContext {
  return {
    taskId: TASK_ID,
    archetypeId: ARCHETYPE_ID,
    runId: 'run-triage-001',
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    headers: HEADERS,
    ...overrides,
  };
}

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_id: string, fn: () => Promise<unknown>) => fn()),
    waitForEvent: vi.fn().mockResolvedValue(null),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdapter.mockReturnValue(undefined);
  mockSlackPostMessage.mockResolvedValue({ ts: 'ts-posted-001', channel: 'C-NOTIFY' });
  mockSlackUpdateMessage.mockResolvedValue(undefined);
  mockSupersedeUpdateMessage.mockResolvedValue(undefined);
  mockLoadTenantSlack.mockResolvedValue({
    botToken: 'xoxb-test',
    channel: 'C-NOTIFY',
    tenantEnv: { SLACK_BOT_TOKEN: 'xoxb-test', NOTIFICATION_CHANNEL: 'C-NOTIFY' },
    slackClient: {
      postMessage: mockSlackPostMessage,
      updateMessage: mockSlackUpdateMessage,
    },
  });
  mockCreateSlackClient.mockReturnValue({
    updateMessage: mockSupersedeUpdateMessage,
    postMessage: vi.fn().mockResolvedValue({ ts: 'ts-x', channel: 'C-x' }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runTriageAndReady — load-task guard', () => {
  it('throws NonRetriableError when the task is not found', async () => {
    vi.stubGlobal('fetch', buildFetch(null));
    const notifyBlocks = vi.fn().mockReturnValue([]);

    await expect(runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks)).rejects.toThrow(
      `Task not found: ${TASK_ID}`,
    );
  });

  it('throws when the task is missing tenant_id', async () => {
    vi.stubGlobal('fetch', buildFetch(buildTaskRow({ tenantId: null })));
    const notifyBlocks = vi.fn().mockReturnValue([]);

    await expect(runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks)).rejects.toThrow(
      /missing tenant_id/,
    );
  });
});

describe('runTriageAndReady — approval + timeout derivation', () => {
  it('returns approvalRequired=true and custom timeoutHours from risk_model', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetch(buildTaskRow({ riskModel: { approval_required: true, timeout_hours: 12 } })),
    );
    const notifyBlocks = vi.fn().mockReturnValue([]);

    const result = await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(result.approvalRequired).toBe(true);
    expect(result.timeoutHours).toBe(12);
    expect(result.tenantId).toBe(TENANT_ID);
    expect((result.archetype as Record<string, unknown>).id).toBe(ARCHETYPE_ID);
  });

  it('returns approvalRequired=false and default 24h timeout when approval_required is false', async () => {
    vi.stubGlobal('fetch', buildFetch(buildTaskRow({ riskModel: { approval_required: false } })));
    const notifyBlocks = vi.fn().mockReturnValue([]);

    const result = await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(result.approvalRequired).toBe(false);
    expect(result.timeoutHours).toBe(24);
  });

  it('defaults approvalRequired=false and 24h when risk_model is absent entirely', async () => {
    vi.stubGlobal('fetch', buildFetch(buildTaskRow({ omitRiskModel: true })));
    const notifyBlocks = vi.fn().mockReturnValue([]);

    const result = await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(result.approvalRequired).toBe(false);
    expect(result.timeoutHours).toBe(24);
  });
});

describe('runTriageAndReady — state transitions', () => {
  it('patches Triaging → AwaitingInput → Ready with matching status-log entries', async () => {
    vi.stubGlobal('fetch', buildFetch(buildTaskRow()));
    const notifyBlocks = vi.fn().mockReturnValue([]);

    await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(mockPatchTask).toHaveBeenCalledWith(SUPABASE_URL, HEADERS, TASK_ID, {
      status: 'Triaging',
    });
    expect(mockPatchTask).toHaveBeenCalledWith(SUPABASE_URL, HEADERS, TASK_ID, {
      status: 'AwaitingInput',
    });
    expect(mockPatchTask).toHaveBeenCalledWith(SUPABASE_URL, HEADERS, TASK_ID, { status: 'Ready' });

    expect(mockLogStatusTransition).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      'Triaging',
      'Received',
    );
    expect(mockLogStatusTransition).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      'AwaitingInput',
      'Triaging',
    );
    expect(mockLogStatusTransition).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      'Ready',
      'AwaitingInput',
    );
  });
});

describe('runTriageAndReady — notify-received', () => {
  it('returns null ref when tenant has no Slack context', async () => {
    mockLoadTenantSlack.mockResolvedValue(null);
    vi.stubGlobal('fetch', buildFetch(buildTaskRow()));
    const notifyBlocks = vi.fn().mockReturnValue([]);

    const result = await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(result.notifyMsgRef).toEqual({ ts: null, channel: null, enrichment: null });
    expect(mockSlackPostMessage).not.toHaveBeenCalled();
  });

  it('posts a top-level message and stores notify_slack_ts on the happy path', async () => {
    vi.stubGlobal('fetch', buildFetch(buildTaskRow()));
    const notifyBlocks = vi.fn().mockReturnValue([]);

    const result = await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(mockSlackPostMessage).toHaveBeenCalledOnce();
    expect(result.notifyMsgRef?.ts).toBe('ts-posted-001');
    expect(result.notifyMsgRef?.channel).toBe('C-NOTIFY');
    expect(mockMergeTaskMetadata).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({
        notify_slack_ts: 'ts-posted-001',
        notify_slack_channel: 'C-NOTIFY',
      }),
    );
  });

  it('stores the resolved channel ID from postMessage, not the input channel name', async () => {
    vi.stubGlobal('fetch', buildFetch(buildTaskRow()));
    const notifyBlocks = vi.fn().mockReturnValue([]);
    mockLoadTenantSlack.mockResolvedValueOnce({
      botToken: 'xoxb-test',
      channel: 'victor-tests',
      tenantEnv: { SLACK_BOT_TOKEN: 'xoxb-test', NOTIFICATION_CHANNEL: 'victor-tests' },
      slackClient: {
        postMessage: mockSlackPostMessage,
        updateMessage: mockSlackUpdateMessage,
      },
    });
    mockSlackPostMessage.mockResolvedValueOnce({ ts: 'ts-posted-002', channel: 'C0AUBMXKVNU' });

    const result = await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(result.notifyMsgRef?.channel).toBe('C0AUBMXKVNU');
    expect(mockMergeTaskMetadata).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({
        notify_slack_ts: 'ts-posted-002',
        notify_slack_channel: 'C0AUBMXKVNU',
      }),
    );
  });

  it('updates the superseded message in place and skips a fresh postMessage', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetch(
        buildTaskRow({
          rawEvent: {
            superseded_notify_ts: 'ts-old-001',
            superseded_notify_channel: 'C-OLD',
          },
        }),
      ),
    );
    const notifyBlocks = vi.fn().mockReturnValue([]);

    const result = await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(mockCreateSlackClient).toHaveBeenCalledOnce();
    expect(mockSupersedeUpdateMessage).toHaveBeenCalledWith(
      'C-OLD',
      'ts-old-001',
      expect.any(String),
      expect.any(Array),
    );
    expect(mockSlackPostMessage).not.toHaveBeenCalled();
    expect(result.notifyMsgRef?.ts).toBe('ts-old-001');
    expect(result.notifyMsgRef?.channel).toBe('C-OLD');
  });

  it('falls back to a fresh postMessage when the superseded chat.update fails', async () => {
    mockSupersedeUpdateMessage.mockRejectedValue(new Error('update failed'));
    vi.stubGlobal(
      'fetch',
      buildFetch(
        buildTaskRow({
          rawEvent: {
            superseded_notify_ts: 'ts-old-001',
            superseded_notify_channel: 'C-OLD',
          },
        }),
      ),
    );
    const notifyBlocks = vi.fn().mockReturnValue([]);

    const result = await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(mockSlackPostMessage).toHaveBeenCalledOnce();
    expect(result.notifyMsgRef?.ts).toBe('ts-posted-001');
  });

  it('invokes the enrichment adapter when archetype.enrichment_adapter is set', async () => {
    const adapter = vi.fn().mockResolvedValue({ displayName: 'Recipient: Olivia' });
    mockGetAdapter.mockReturnValue(adapter);
    vi.stubGlobal('fetch', buildFetch(buildTaskRow({ enrichmentAdapter: 'hostfully' })));
    const notifyBlocks = vi.fn().mockReturnValue([]);

    await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(mockGetAdapter).toHaveBeenCalledWith('hostfully');
    expect(adapter).toHaveBeenCalledOnce();
    expect(notifyBlocks).toHaveBeenCalledWith(
      expect.objectContaining({ enrichment: { displayName: 'Recipient: Olivia' } }),
    );
  });

  it('swallows notify failures and returns a null ref (non-fatal)', async () => {
    mockLoadTenantSlack.mockRejectedValue(new Error('tenant lookup blew up'));
    vi.stubGlobal('fetch', buildFetch(buildTaskRow()));
    const notifyBlocks = vi.fn().mockReturnValue([]);

    const result = await runTriageAndReady(makeCtx(), makeStep() as never, notifyBlocks);

    expect(result.notifyMsgRef).toEqual({ ts: null, channel: null });
  });
});
