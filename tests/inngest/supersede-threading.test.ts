import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { hostfullyRoutes } from '../../src/gateway/routes/hostfully.js';

vi.mock('../../src/gateway/services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('../../src/lib/hostfully-precheck.js', () => ({
  checkLastMessageSender: vi.fn().mockResolvedValue({ lastSenderIsHost: false }),
}));

const TENANT_ID = 'tenant-uuid';
const ARCHETYPE_ID = 'archetype-uuid';
const AGENCY_UID = 'test-agency-uid';

function makeApp(
  overrides: {
    tenantFindMany?: ReturnType<typeof vi.fn>;
    archetypeFindFirst?: ReturnType<typeof vi.fn>;
    taskCreate?: ReturnType<typeof vi.fn>;
    taskFindFirst?: ReturnType<typeof vi.fn>;
    taskUpdate?: ReturnType<typeof vi.fn>;
    inngestClient?: { send: ReturnType<typeof vi.fn> };
  } = {},
) {
  const app = express();
  app.use(express.json());
  app.use(
    hostfullyRoutes({
      prisma: {
        tenant: {
          findMany:
            overrides.tenantFindMany ??
            vi.fn().mockResolvedValue([
              {
                id: TENANT_ID,
                config: { guest_messaging: { hostfully_agency_uid: AGENCY_UID } },
              },
            ]),
        },
        archetype: {
          findFirst:
            overrides.archetypeFindFirst ?? vi.fn().mockResolvedValue({ id: ARCHETYPE_ID }),
        },
        task: {
          create: overrides.taskCreate ?? vi.fn().mockResolvedValue({ id: 'new-task-uuid' }),
          findFirst: overrides.taskFindFirst ?? vi.fn().mockResolvedValue(null),
          update: overrides.taskUpdate ?? vi.fn().mockResolvedValue({}),
        },
      } as never,
      inngestClient: overrides.inngestClient,
    }),
  );
  return app;
}

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    agency_uid: AGENCY_UID,
    event_type: 'NEW_INBOX_MESSAGE',
    message_uid: 'msg-001',
    thread_uid: 'thread-001',
    lead_uid: 'lead-001',
    property_uid: 'prop-001',
    ...overrides,
  };
}

describe('supersede threading — webhook handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('supersede: old task with notify_slack_ts → new task raw_event includes superseded_notify_ts', async () => {
    const OLD_TASK_ID = 'old-task-uuid';
    const taskFindFirst = vi.fn().mockResolvedValue({
      id: OLD_TASK_ID,
      status: 'Reviewing',
      metadata: { notify_slack_ts: '1234567890.123456', notify_slack_channel: 'C0123456789' },
    });
    const taskUpdate = vi.fn().mockResolvedValue({});
    const taskCreate = vi.fn().mockResolvedValue({ id: 'new-task-uuid' });
    const app = makeApp({ taskFindFirst, taskUpdate, taskCreate });

    await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload({ message_uid: 'new-msg-001' }));

    expect(taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: OLD_TASK_ID },
        data: { status: 'Cancelled', updated_at: expect.any(Date) },
      }),
    );
    expect(taskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          raw_event: expect.objectContaining({
            superseded_notify_ts: '1234567890.123456',
            superseded_notify_channel: 'C0123456789',
          }),
        }),
      }),
    );
  });

  it('supersede: old task with null metadata → new task raw_event has no superseded_notify_ts', async () => {
    const taskFindFirst = vi.fn().mockResolvedValue({
      id: 'old-task-uuid',
      status: 'Reviewing',
      metadata: null,
    });
    const taskUpdate = vi.fn().mockResolvedValue({});
    const taskCreate = vi.fn().mockResolvedValue({ id: 'new-task-uuid' });
    const app = makeApp({ taskFindFirst, taskUpdate, taskCreate });

    await request(app)
      .post('/webhooks/hostfully')
      .set('Content-Type', 'application/json')
      .send(makeValidPayload({ message_uid: 'new-msg-002' }));

    expect(taskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          raw_event: expect.not.objectContaining({ superseded_notify_ts: expect.anything() }),
        }),
      }),
    );
  });
});

const { MockWebClient } = vi.hoisted(() => {
  const MockWebClient = vi.fn().mockImplementation(() => ({
    chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ts1', channel: 'C1' }) },
  }));
  return { MockWebClient };
});

vi.mock('@slack/web-api', () => ({ WebClient: MockWebClient }));
vi.mock('../../src/worker-tools/node_modules/@slack/web-api', () => ({ WebClient: MockWebClient }));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { existsSync } from 'node:fs';
import { WebClient } from '@slack/web-api';

const baseArgv = [
  'node',
  'post-guest-approval.ts',
  '--task-id',
  'test-task-id',
  '--guest-name',
  'Test Guest',
  '--property-name',
  'Test Property',
  '--check-in',
  '2026-01-01',
  '--check-out',
  '2026-01-05',
  '--booking-channel',
  'AIRBNB',
  '--original-message',
  'Test message',
  '--draft-response',
  'Test response',
  '--confidence',
  '0.9',
  '--category',
  'test',
  '--lead-uid',
  'lead-test',
  '--thread-uid',
  'thread-test',
  '--message-uid',
  'msg-test',
];

describe('post-guest-approval.ts — empty thread-ts guard', () => {
  let origWrite: typeof process.stdout.write;
  let origEnv: string | undefined;
  let origChannel: string | undefined;
  let mockPostMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    origEnv = process.env.SLACK_BOT_TOKEN;
    origChannel = process.env.NOTIFICATION_CHANNEL;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    process.env.NOTIFICATION_CHANNEL = 'C-TEST';
    vi.mocked(existsSync).mockImplementation((p) => String(p) === '/tmp/summary.txt');
    origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;

    mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts-test', channel: 'C-test' });
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({ chat: { postMessage: mockPostMessage } }) as unknown as InstanceType<typeof WebClient>,
    );
  });

  afterEach(() => {
    process.env.SLACK_BOT_TOKEN = origEnv;
    if (origChannel !== undefined) {
      process.env.NOTIFICATION_CHANNEL = origChannel;
    } else {
      delete process.env.NOTIFICATION_CHANNEL;
    }
    process.stdout.write = origWrite;
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({
          chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ts1', channel: 'C1' }) },
        }) as unknown as InstanceType<typeof WebClient>,
    );
  });

  it('--thread-ts "" treated as absent — no thread_ts in postMessage call', async () => {
    const savedArgv = [...process.argv];
    process.argv = [...baseArgv, '--thread-ts', ''];

    const { main } = await import('../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;

    expect(mockPostMessage).toHaveBeenCalled();
    const lastCall = mockPostMessage.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(lastCall).not.toHaveProperty('thread_ts');
  });
});

describe('post-guest-approval.ts — reply-broadcast flag', () => {
  let origWrite: typeof process.stdout.write;
  let origEnv: string | undefined;
  let origChannel: string | undefined;
  let mockPostMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    origEnv = process.env.SLACK_BOT_TOKEN;
    origChannel = process.env.NOTIFICATION_CHANNEL;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    process.env.NOTIFICATION_CHANNEL = 'C-TEST';
    vi.mocked(existsSync).mockImplementation((p) => String(p) === '/tmp/summary.txt');
    origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;

    mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts-test', channel: 'C-test' });
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({ chat: { postMessage: mockPostMessage } }) as unknown as InstanceType<typeof WebClient>,
    );
  });

  afterEach(() => {
    process.env.SLACK_BOT_TOKEN = origEnv;
    if (origChannel !== undefined) {
      process.env.NOTIFICATION_CHANNEL = origChannel;
    } else {
      delete process.env.NOTIFICATION_CHANNEL;
    }
    process.stdout.write = origWrite;
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({
          chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ts1', channel: 'C1' }) },
        }) as unknown as InstanceType<typeof WebClient>,
    );
  });

  it('--thread-ts "valid.ts" --reply-broadcast → reply_broadcast: true in postMessage call', async () => {
    const savedArgv = [...process.argv];
    process.argv = [...baseArgv, '--thread-ts', '1234567890.123456', '--reply-broadcast'];

    const { main } = await import('../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;

    expect(mockPostMessage).toHaveBeenCalled();
    const lastCall = mockPostMessage.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(lastCall).toMatchObject({
      thread_ts: '1234567890.123456',
      reply_broadcast: true,
    });
  });
});
