import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { createSlackTriggerHandlerFunction } from '../../../src/inngest/slack-trigger-handler.js';
import { CostCircuitBreakerError } from '../../../src/lib/errors.js';

const { mockLoadTenantEnv, mockExtractInputsFromText, mockResolveArchetypeFromChannel } =
  vi.hoisted(() => ({
    mockLoadTenantEnv: vi.fn().mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test' }),
    mockExtractInputsFromText: vi.fn().mockResolvedValue({}),
    mockResolveArchetypeFromChannel: vi.fn().mockResolvedValue({
      archetype: { id: 'arch-1', role_name: 'test-employee' },
      isExactMatch: true,
    }),
  }));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({ $disconnect: vi.fn().mockResolvedValue(undefined) })),
}));
vi.mock('../../../src/gateway/services/tenant-env-loader.js', () => ({
  loadTenantEnv: mockLoadTenantEnv,
}));
vi.mock('../../../src/gateway/services/tenant-repository.js', () => ({
  TenantRepository: vi.fn(() => ({})),
}));
vi.mock('../../../src/gateway/services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn(() => ({})),
}));
vi.mock('../../../src/gateway/services/interaction-classifier.js', () => ({
  resolveArchetypeFromChannel: mockResolveArchetypeFromChannel,
}));
vi.mock('../../../src/lib/extract-inputs.js', () => ({
  extractInputsFromText: mockExtractInputsFromText,
}));
vi.mock('../../../src/lib/call-llm.js', () => ({
  callLLM: vi.fn(),
}));
vi.mock('../../../src/lib/slack-copy.js', () => ({
  triggerCardPrompt: vi.fn().mockReturnValue('Ready to start?'),
}));

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/rest/v1/archetypes')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              input_schema: [{ key: 'date', label: 'Date', required: true }],
            },
          ]),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, ts: '1234567890.000001' }),
    });
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
      text: 'run the employee for June 10th',
      userId: 'U123',
      channelId: 'C123',
      archetypeId: null,
      threadTs: '1234567890.000000',
      messageTs: undefined,
      taskId: undefined,
      ...overrides,
    },
  };
}

async function invokeTriggerHandler(
  fn: ReturnType<typeof createSlackTriggerHandlerFunction>,
  event: Record<string, unknown>,
  step: ReturnType<typeof makeStep>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).fn({ event, step });
}

function getPostedCardValue(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> | null {
  const slackCall = (fetchMock.mock.calls as [string, RequestInit][]).find(([url]) =>
    url.includes('slack.com/api/chat.postMessage'),
  );
  if (!slackCall) return null;
  const body = JSON.parse(slackCall[1].body as string) as {
    blocks?: Array<{
      type: string;
      elements?: Array<{ value?: string }>;
    }>;
  };
  const actionsBlock = body.blocks?.find((b) => b.type === 'actions');
  const confirmButton = actionsBlock?.elements?.[0];
  if (!confirmButton?.value) return null;
  return JSON.parse(confirmButton.value) as Record<string, unknown>;
}

describe('createSlackTriggerHandlerFunction — pre-extract-inputs step', () => {
  let inngest: Inngest;

  beforeEach(() => {
    inngest = new Inngest({ id: 'test-app' });
  });

  it('a. happy path embedding — extracted inputs appear in card button value', async () => {
    mockExtractInputsFromText.mockResolvedValue({ date: '2026-06-10' });

    const fn = createSlackTriggerHandlerFunction(inngest);
    const step = makeStep();
    const event = makeEvent({ text: 'run the employee for June 10th' });

    await invokeTriggerHandler(fn, event, step);

    const cardValue = getPostedCardValue(mockFetch);
    expect(cardValue).not.toBeNull();
    expect(cardValue?.extractedInputs).toEqual({ date: '2026-06-10' });
  });

  it('b. no required inputs — extractInputsFromText not called, no extractedInputs in value', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/rest/v1/archetypes')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ input_schema: [] }]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: '1234567890.000001' }),
      });
    });

    const fn = createSlackTriggerHandlerFunction(inngest);
    const step = makeStep();
    const event = makeEvent();

    await invokeTriggerHandler(fn, event, step);

    expect(mockExtractInputsFromText).not.toHaveBeenCalled();

    const cardValue = getPostedCardValue(mockFetch);
    expect(cardValue).not.toBeNull();
    expect(cardValue?.extractedInputs).toBeUndefined();
  });

  it('c. size-guard — oversized extractedInputs omitted from card value', async () => {
    const largeInputs: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      largeInputs[`field_${i}`] = 'x'.repeat(100);
    }
    mockExtractInputsFromText.mockResolvedValue(largeInputs);

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/rest/v1/archetypes')) {
        const manyInputs = Array.from({ length: 20 }, (_, i) => ({
          key: `field_${i}`,
          label: `Field ${i}`,
          required: true,
        }));
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ input_schema: manyInputs }]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: '1234567890.000001' }),
      });
    });

    const fn = createSlackTriggerHandlerFunction(inngest);
    const step = makeStep();
    const event = makeEvent();

    await invokeTriggerHandler(fn, event, step);

    const cardValue = getPostedCardValue(mockFetch);
    expect(cardValue).not.toBeNull();

    const slackCall = (mockFetch.mock.calls as [string, RequestInit][]).find(([url]) =>
      url.includes('slack.com/api/chat.postMessage'),
    );
    const body = JSON.parse(slackCall![1].body as string) as {
      blocks?: Array<{ type: string; elements?: Array<{ value?: string }> }>;
    };
    const actionsBlock = body.blocks?.find((b) => b.type === 'actions');
    const confirmButtonValue = actionsBlock?.elements?.[0]?.value ?? '';
    expect(Buffer.byteLength(confirmButtonValue, 'utf8')).toBeLessThanOrEqual(1800);
    expect(cardValue?.extractedInputs).toBeUndefined();
  });

  it('d. failure-isolation — CostCircuitBreakerError does not throw; card still posts', async () => {
    mockExtractInputsFromText.mockRejectedValue(
      new CostCircuitBreakerError('Daily limit exceeded', {
        department: 'test',
        currentSpendUsd: 50,
        limitUsd: 50,
      }),
    );

    const fn = createSlackTriggerHandlerFunction(inngest);
    const step = makeStep();
    const event = makeEvent();

    await expect(invokeTriggerHandler(fn, event, step)).resolves.not.toThrow();

    const slackCall = (mockFetch.mock.calls as [string, RequestInit][]).find(([url]) =>
      url.includes('slack.com/api/chat.postMessage'),
    );
    expect(slackCall).toBeDefined();

    const cardValue = getPostedCardValue(mockFetch);
    expect(cardValue?.extractedInputs).toBeUndefined();
  });

  it('e. separate fetch — pre-extract-inputs makes its own archetypes fetch separate from resolveArchetypeFromChannel', async () => {
    mockExtractInputsFromText.mockResolvedValue({ date: '2026-06-10' });

    const fn = createSlackTriggerHandlerFunction(inngest);
    const step = makeStep();
    const event = makeEvent();

    await invokeTriggerHandler(fn, event, step);

    expect(mockResolveArchetypeFromChannel).toHaveBeenCalledOnce();

    const archetypeFetches = (mockFetch.mock.calls as [string, RequestInit][]).filter(([url]) =>
      url.includes('/rest/v1/archetypes'),
    );
    expect(archetypeFetches.length).toBeGreaterThanOrEqual(1);

    const archetypeFetchUrl = archetypeFetches[0][0];
    expect(archetypeFetchUrl).toContain('select=input_schema');
  });
});
