import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import {
  prettifyRoleName,
  createSlackTriggerHandlerFunction,
} from '../../src/inngest/slack-trigger-handler.js';

const { mockLoadTenantEnv, mockResolveArchetypeFromChannel } = vi.hoisted(() => ({
  mockLoadTenantEnv: vi.fn().mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test' }),
  mockResolveArchetypeFromChannel: vi.fn().mockResolvedValue({
    archetype: { id: 'arch-1', role_name: 'guest-messaging', notification_channel: 'C123' },
    isExactMatch: true,
  }),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({ $disconnect: vi.fn().mockResolvedValue(undefined) })),
}));
vi.mock('../../src/gateway/services/tenant-env-loader.js', () => ({
  loadTenantEnv: mockLoadTenantEnv,
}));
vi.mock('../../src/gateway/services/tenant-repository.js', () => ({
  TenantRepository: vi.fn(() => ({})),
}));
vi.mock('../../src/gateway/services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn(() => ({})),
}));
vi.mock('../../src/gateway/services/interaction-classifier.js', () => ({
  resolveArchetypeFromChannel: mockResolveArchetypeFromChannel,
}));

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, ts: '1234567890.000001' }),
  });
  vi.stubGlobal('fetch', mockFetch);
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-key';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_ANON_KEY;
});

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      tenantId: 'tenant-1',
      text: 'trigger something',
      userId: 'U123',
      channelId: 'C123',
      archetypeId: 'arch-1',
      ts: '1234567890.000000',
      ...overrides,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invokeHandler(
  fn: ReturnType<typeof createSlackTriggerHandlerFunction>,
  event: ReturnType<typeof makeEvent>,
  step: ReturnType<typeof makeStep>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).fn({ event, step });
}

describe('prettifyRoleName', () => {
  it('converts guest-messaging to Guest Messaging', () => {
    expect(prettifyRoleName('guest-messaging')).toBe('Guest Messaging');
  });

  it('converts real-estate-motivation-bot to Real Estate Motivation Bot', () => {
    expect(prettifyRoleName('real-estate-motivation-bot')).toBe('Real Estate Motivation Bot');
  });

  it('capitalizes a single word like summarizer', () => {
    expect(prettifyRoleName('summarizer')).toBe('Summarizer');
  });

  it('converts code-rotation to Code Rotation', () => {
    expect(prettifyRoleName('code-rotation')).toBe('Code Rotation');
  });

  it('handles words that already start with uppercase', () => {
    expect(prettifyRoleName('Daily-Summary')).toBe('Daily Summary');
  });
});

describe('createSlackTriggerHandlerFunction', () => {
  let inngest: Inngest;

  beforeEach(() => {
    inngest = new Inngest({ id: 'test-app' });
  });

  it('creates an Inngest function without throwing', () => {
    expect(() => createSlackTriggerHandlerFunction(inngest)).not.toThrow();
  });

  it('skips all fetch calls when tenantId is null', async () => {
    const fn = createSlackTriggerHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ tenantId: null }), step);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('posts decline message when no archetype is found for channel', async () => {
    mockResolveArchetypeFromChannel.mockResolvedValueOnce({
      archetype: null,
      isExactMatch: false,
    });

    const fn = createSlackTriggerHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ channelId: 'C999' }), step);

    const slackCalls = (mockFetch.mock.calls as Array<[string, RequestInit]>).filter(
      ([url]) => typeof url === 'string' && url.includes('slack.com'),
    );
    expect(slackCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(slackCalls[0][1].body as string);
    expect(body.text).toContain("I don't have any employees assigned to this channel");
  });

  it('posts confirmation card with prettified employee name when archetype found', async () => {
    mockResolveArchetypeFromChannel.mockResolvedValueOnce({
      archetype: { id: 'arch-1', role_name: 'guest-messaging', notification_channel: 'C123' },
      isExactMatch: true,
    });

    const fn = createSlackTriggerHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent(), step);

    const slackCalls = (mockFetch.mock.calls as Array<[string, RequestInit]>).filter(
      ([url]) => typeof url === 'string' && url.includes('slack.com'),
    );
    expect(slackCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(slackCalls[0][1].body as string);
    expect(body.text).toBe('Trigger Guest Messaging?');
  });

  it('makes no fetch calls when no bot token is available for the tenant', async () => {
    mockLoadTenantEnv.mockResolvedValueOnce({ SLACK_BOT_TOKEN: null });

    const fn = createSlackTriggerHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent(), step);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
