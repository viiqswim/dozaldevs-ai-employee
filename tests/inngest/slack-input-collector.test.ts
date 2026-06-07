import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { createSlackInputCollectorFunction } from '../../src/inngest/slack-trigger-handler.js';

const { mockLoadTenantEnv, mockExtractInputsFromText } = vi.hoisted(() => ({
  mockLoadTenantEnv: vi.fn().mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test' }),
  mockExtractInputsFromText: vi.fn().mockResolvedValue({}),
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
  resolveArchetypeFromChannel: vi.fn(),
}));
vi.mock('../../src/lib/extract-inputs.js', () => ({
  extractInputsFromText: mockExtractInputsFromText,
}));

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/rest/v1/tasks')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: 'task-123' }]),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
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
      threadTs: '1234567890.000001',
      text: 'June 15th',
      tenantId: 'tenant-1',
      pending: {
        archetypeId: 'arch-1',
        tenantId: 'tenant-1',
        userId: 'U123',
        channelId: 'C123',
        text: 'run cleaning schedule',
        roleName: 'cleaning-schedule',
        requiredInputs: [{ key: 'date', label: 'Checkout Date' }],
        extractedInputs: undefined,
        ...((overrides.pendingOverrides as Record<string, unknown>) ?? {}),
      },
      ...overrides,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invokeCollector(
  fn: ReturnType<typeof createSlackInputCollectorFunction>,
  event: Record<string, unknown>,
  step: ReturnType<typeof makeStep>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).fn({ event, step });
}

function getTaskCreationBody(fetchMock: ReturnType<typeof vi.fn>) {
  const call = (fetchMock.mock.calls as [string, RequestInit][]).find(([url]) =>
    url.includes('/rest/v1/tasks'),
  );
  if (!call) return null;
  return JSON.parse(call[1].body as string) as {
    raw_event: { inputs: Record<string, string> };
  };
}

describe('createSlackInputCollectorFunction', () => {
  let inngest: Inngest;

  beforeEach(() => {
    inngest = new Inngest({ id: 'test-app' });
  });

  it('single input — assigns text directly without calling extractInputsFromText', async () => {
    const fn = createSlackInputCollectorFunction(inngest);
    const step = makeStep();
    const event = makeEvent({ text: 'June 15th' });

    await invokeCollector(fn, event, step);

    expect(mockExtractInputsFromText).not.toHaveBeenCalled();

    const body = getTaskCreationBody(mockFetch);
    expect(body?.raw_event.inputs['date']).toBe('June 15th');
  });

  it('multi-input — full extraction succeeds, uses all extracted values', async () => {
    mockExtractInputsFromText.mockResolvedValue({ date: '2026-06-05', time: '10:00' });

    const fn = createSlackInputCollectorFunction(inngest);
    const step = makeStep();
    const event = makeEvent({
      text: 'June 5th at 10am',
      pendingOverrides: {
        requiredInputs: [
          { key: 'date', label: 'Checkout Date' },
          { key: 'time', label: 'Checkout Time' },
        ],
      },
    });

    await invokeCollector(fn, event, step);

    expect(mockExtractInputsFromText).toHaveBeenCalledOnce();

    const body = getTaskCreationBody(mockFetch);
    expect(body?.raw_event.inputs['date']).toBe('2026-06-05');
    expect(body?.raw_event.inputs['time']).toBe('10:00');
  });

  it('multi-input — partial extraction merges extracted with text fallback for missing', async () => {
    mockExtractInputsFromText.mockResolvedValue({ date: '2026-06-05' });

    const fn = createSlackInputCollectorFunction(inngest);
    const step = makeStep();
    const event = makeEvent({
      text: 'some user reply',
      pendingOverrides: {
        requiredInputs: [
          { key: 'date', label: 'Checkout Date' },
          { key: 'time', label: 'Checkout Time' },
        ],
      },
    });

    await invokeCollector(fn, event, step);

    const body = getTaskCreationBody(mockFetch);
    expect(body?.raw_event.inputs['date']).toBe('2026-06-05');
    expect(body?.raw_event.inputs['time']).toBe('some user reply');
  });

  it('multi-input — extraction returns nothing, assigns text to all keys', async () => {
    mockExtractInputsFromText.mockResolvedValue({});

    const fn = createSlackInputCollectorFunction(inngest);
    const step = makeStep();
    const event = makeEvent({
      text: 'user fallback reply',
      pendingOverrides: {
        requiredInputs: [
          { key: 'date', label: 'Checkout Date' },
          { key: 'time', label: 'Checkout Time' },
        ],
      },
    });

    await invokeCollector(fn, event, step);

    const body = getTaskCreationBody(mockFetch);
    expect(body?.raw_event.inputs['date']).toBe('user fallback reply');
    expect(body?.raw_event.inputs['time']).toBe('user fallback reply');
  });

  it('merges pre-extracted inputs with newly collected — both appear in task', async () => {
    const fn = createSlackInputCollectorFunction(inngest);
    const step = makeStep();
    const event = makeEvent({
      text: '10am',
      pendingOverrides: {
        requiredInputs: [{ key: 'time', label: 'Checkout Time' }],
        extractedInputs: { date: '2026-06-05' },
      },
    });

    await invokeCollector(fn, event, step);

    const body = getTaskCreationBody(mockFetch);
    expect(body?.raw_event.inputs['date']).toBe('2026-06-05');
    expect(body?.raw_event.inputs['time']).toBe('10am');
  });

  it('user reply overrides pre-extracted value for the same key', async () => {
    const fn = createSlackInputCollectorFunction(inngest);
    const step = makeStep();
    const event = makeEvent({
      text: 'June 20th',
      pendingOverrides: {
        requiredInputs: [{ key: 'date', label: 'Checkout Date' }],
        extractedInputs: { date: '2026-06-05' },
      },
    });

    await invokeCollector(fn, event, step);

    const body = getTaskCreationBody(mockFetch);
    expect(body?.raw_event.inputs['date']).toBe('June 20th');
  });
});
