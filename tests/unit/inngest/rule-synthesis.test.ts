import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { createRuleSynthesizerFunction } from '../../../src/inngest/rule-synthesizer.js';

const { mockCallLLM, mockDecrypt } = vi.hoisted(() => ({
  mockCallLLM: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      merges: [
        {
          original_ids: ['rule-1', 'rule-2'],
          merged_text: 'Always greet guests warmly and mention checkout time',
          rationale: 'Both rules address guest interaction',
        },
      ],
      contradictions: [],
    }),
    model: 'deepseek/deepseek-v4-flash',
    estimatedCostUsd: 0.001,
  }),
  mockDecrypt: vi.fn().mockReturnValue('xoxb-fake-token'),
}));

vi.mock('../../../src/lib/call-llm.js', () => ({ callLLM: mockCallLLM }));
vi.mock('../../../src/lib/encryption.js', () => ({ decrypt: mockDecrypt }));
vi.mock('../../../src/lib/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

let mockFetch: ReturnType<typeof vi.fn>;

const CONFIRMED_RULES_3 = [
  { id: 'rule-1', rule_text: 'Always greet guests by name', confirmed_at: '2026-01-01T00:00:00Z' },
  {
    id: 'rule-2',
    rule_text: 'Mention checkout time in first message',
    confirmed_at: '2026-01-02T00:00:00Z',
  },
  { id: 'rule-3', rule_text: 'Use formal language', confirmed_at: '2026-01-03T00:00:00Z' },
];

const ARCHETYPE_WITH_CHANNEL = {
  id: 'arch-1',
  notification_channel: 'C123',
};

const ARCHETYPE_NO_CHANNEL = {
  id: 'arch-1',
  notification_channel: null,
};

type ConfirmedRule = { id: string; rule_text: string; confirmed_at: string };

function makeFetchMock({
  confirmedRules = CONFIRMED_RULES_3 as ConfirmedRule[],
  archetypeRow = ARCHETYPE_WITH_CHANNEL as { id: string; notification_channel: string | null },
  mergedRuleId = 'merged-rule-id',
  slackTs = 'ts-123.456',
} = {}) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();

    // employee_rules GET (confirmed rules query for synthesis)
    if (url.includes('/rest/v1/employee_rules') && method === 'GET') {
      return { json: () => Promise.resolve(confirmedRules) };
    }
    // archetypes GET for notification_channel
    if (url.includes('/rest/v1/archetypes') && method === 'GET') {
      return { json: () => Promise.resolve([archetypeRow]) };
    }
    // Tenant secrets GET
    if (url.includes('/rest/v1/tenant_secrets') && method === 'GET') {
      return {
        json: () => Promise.resolve([{ ciphertext: 'cipher', iv: 'ivvalue', auth_tag: 'authtag' }]),
      };
    }
    // employee_rules POST (insert merged rule — return=representation)
    if (url.includes('/rest/v1/employee_rules') && method === 'POST') {
      return { json: () => Promise.resolve([{ id: mergedRuleId }]) };
    }
    // employee_rules PATCH (slack_ts storage)
    if (url.includes('/rest/v1/employee_rules') && method === 'PATCH') {
      return { json: () => Promise.resolve([]) };
    }
    // Slack postMessage
    if (url.includes('slack.com/api/chat.postMessage') && method === 'POST') {
      return {
        json: () => Promise.resolve({ ok: true, ts: slackTs, channel: 'C123' }),
      };
    }

    return { json: () => Promise.resolve([]) };
  });
}

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
      archetypeId: 'arch-1',
      ...overrides,
    },
  };
}

async function invokeSynthesizer(
  fn: ReturnType<typeof createRuleSynthesizerFunction>,
  step: ReturnType<typeof makeStep>,
  event = makeEvent(),
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).fn({ event, step });
}

describe('createRuleSynthesizerFunction — synthesize-rules step', () => {
  let inngest: Inngest;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-key';

    mockCallLLM.mockResolvedValue({
      content: JSON.stringify({
        merges: [
          {
            original_ids: ['rule-1', 'rule-2'],
            merged_text: 'Always greet guests warmly and mention checkout time',
            rationale: 'Both rules address guest interaction',
          },
        ],
        contradictions: [],
      }),
      model: 'deepseek/deepseek-v4-flash',
      estimatedCostUsd: 0.001,
    });
    mockDecrypt.mockReturnValue('xoxb-fake-token');

    mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    inngest = new Inngest({ id: 'test-app' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Test 1: Merge detection ──
  it('3 confirmed rules → LLM returns merge → employee_rules POSTed with source=synthesis + status=proposed → Slack posted with rule_confirm/rule_reject/rule_rephrase action_ids', async () => {
    const fn = createRuleSynthesizerFunction(inngest);
    const step = makeStep();

    await invokeSynthesizer(fn, step);

    // callLLM should be called for the synthesis step
    expect(mockCallLLM).toHaveBeenCalled();

    // Assert POST to employee_rules with required fields
    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/employee_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeDefined();
    const insertBody = JSON.parse((insertCall![1] as RequestInit).body as string);
    expect(insertBody.status).toBe('proposed');
    expect(insertBody.source).toBe('synthesis');
    expect(insertBody.rule_text).toBe('Always greet guests warmly and mention checkout time');

    // Assert Slack message posted with 3 action buttons
    const slackCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' && args[0].includes('slack.com/api/chat.postMessage'),
    );
    expect(slackCall).toBeDefined();
    const slackBody = JSON.parse((slackCall![1] as RequestInit).body as string);
    const actionsBlock = slackBody.blocks.find((b: { type: string }) => b.type === 'actions') as {
      elements: Array<{ action_id: string }>;
    };
    expect(actionsBlock).toBeDefined();
    expect(actionsBlock.elements.map((e) => e.action_id)).toEqual(
      expect.arrayContaining(['rule_confirm', 'rule_reject', 'rule_rephrase']),
    );

    // Assert PATCH stores slack_ts
    const patchCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/employee_rules?id=eq.merged-rule-id') &&
        (args[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(patchBody.slack_ts).toBe('ts-123.456');
  });

  // ── Test 2: Skip <2 rules ──
  it('1 confirmed rule → callLLM NOT called → no new employee_rules row created', async () => {
    mockFetch = makeFetchMock({
      confirmedRules: [
        {
          id: 'rule-1',
          rule_text: 'Always greet guests by name',
          confirmed_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    vi.stubGlobal('fetch', mockFetch);

    const fn = createRuleSynthesizerFunction(inngest);
    const step = makeStep();

    await invokeSynthesizer(fn, step);

    // callLLM must NOT be called — synthesis was skipped (<2 rules)
    expect(mockCallLLM).not.toHaveBeenCalled();

    // No POST to employee_rules
    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/employee_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeUndefined();
  });

  // ── Test 3: Skip 0 rules ──
  it('0 confirmed rules → callLLM NOT called → completes without error', async () => {
    mockFetch = makeFetchMock({ confirmedRules: [] });
    vi.stubGlobal('fetch', mockFetch);

    const fn = createRuleSynthesizerFunction(inngest);
    const step = makeStep();

    await expect(invokeSynthesizer(fn, step)).resolves.not.toThrow();

    expect(mockCallLLM).not.toHaveBeenCalled();

    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/employee_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeUndefined();
  });

  // ── Test 4: Null notification_channel → skips (synthesizer returns early when no channel) ──
  it('null notification_channel → skipped: true returned, Slack NOT called', async () => {
    mockFetch = makeFetchMock({ archetypeRow: ARCHETYPE_NO_CHANNEL });
    vi.stubGlobal('fetch', mockFetch);

    const fn = createRuleSynthesizerFunction(inngest);
    const step = makeStep();

    const result = await invokeSynthesizer(fn, step);

    // Synthesizer returns skipped when no channel
    expect(result).toMatchObject({ skipped: true });

    // Slack must NOT be called
    const slackCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' && args[0].includes('slack.com/api/chat.postMessage'),
    );
    expect(slackCall).toBeUndefined();

    // tenant_secrets must NOT be queried (no channel = no token lookup)
    const secretsCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' && args[0].includes('/rest/v1/tenant_secrets'),
    );
    expect(secretsCall).toBeUndefined();
  });

  // ── Test 5: LLM returns no merges ──
  it('LLM returns { merges: [], contradictions: [] } → no new rows created, no Slack posted', async () => {
    mockCallLLM.mockResolvedValue({
      content: JSON.stringify({ merges: [], contradictions: [] }),
      model: 'deepseek/deepseek-v4-flash',
      estimatedCostUsd: 0.001,
    });

    const fn = createRuleSynthesizerFunction(inngest);
    const step = makeStep();

    await invokeSynthesizer(fn, step);

    // callLLM WAS called (3 confirmed rules triggered synthesis)
    expect(mockCallLLM).toHaveBeenCalled();

    // But no POST to employee_rules (nothing to merge)
    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/employee_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeUndefined();

    // And no Slack
    const slackCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' && args[0].includes('slack.com/api/chat.postMessage'),
    );
    expect(slackCall).toBeUndefined();
  });

  // ── Test 6: archetypes fetch URL contains notification_channel in select param ──
  it('archetypes fetch URL contains notification_channel in select param', async () => {
    const fn = createRuleSynthesizerFunction(inngest);
    const step = makeStep();

    await invokeSynthesizer(fn, step);

    const archetypesFetch = mockFetch.mock.calls.find(
      (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('/rest/v1/archetypes'),
    );
    expect(archetypesFetch).toBeDefined();
    const url = archetypesFetch![0] as string;
    expect(url).toContain('notification_channel');
  });
});
