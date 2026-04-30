import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createFeedbackSummarizerTrigger } from '../../src/inngest/triggers/feedback-summarizer.js';

const { mockCallLLM, mockDecrypt } = vi.hoisted(() => ({
  mockCallLLM: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      merges: [
        {
          original_rule_ids: ['rule-1', 'rule-2'],
          merged_rule_text: 'Always greet guests warmly and mention checkout time',
          rationale: 'Both rules address guest interaction',
        },
      ],
      contradictions: [],
    }),
    model: 'anthropic/claude-haiku-4-5',
    estimatedCostUsd: 0.001,
  }),
  mockDecrypt: vi.fn().mockReturnValue('xoxb-fake-token'),
}));

vi.mock('../../src/lib/call-llm.js', () => ({ callLLM: mockCallLLM }));
vi.mock('../../src/lib/encryption.js', () => ({ decrypt: mockDecrypt }));

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
  role_name: 'Test Employee',
  tenant_id: 'tenant-1',
  notification_channel: 'C123',
};

const ARCHETYPE_NO_CHANNEL = {
  id: 'arch-1',
  role_name: 'Test Employee',
  tenant_id: 'tenant-1',
  notification_channel: null,
};

type ArchetypeFixture = typeof ARCHETYPE_WITH_CHANNEL | typeof ARCHETYPE_NO_CHANNEL;
type ConfirmedRule = { id: string; rule_text: string; confirmed_at: string };

function makeFetchMock({
  archetypes = [ARCHETYPE_WITH_CHANNEL] as ArchetypeFixture[],
  confirmedRules = CONFIRMED_RULES_3 as ConfirmedRule[],
  mergedRuleId = 'merged-rule-id',
  slackTs = 'ts-123.456',
} = {}) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();

    // Archetypes GET
    if (url.includes('/rest/v1/archetypes') && method === 'GET') {
      return { json: () => Promise.resolve(archetypes) };
    }
    // Feedback GET — return empty to short-circuit the summarize-feedback step
    if (url.includes('/rest/v1/feedback') && method === 'GET') {
      return { json: () => Promise.resolve([]) };
    }
    // Learned rules GET (confirmed rules query for synthesis)
    if (url.includes('/rest/v1/learned_rules') && method === 'GET') {
      return { json: () => Promise.resolve(confirmedRules) };
    }
    // Tenant secrets GET
    if (url.includes('/rest/v1/tenant_secrets') && method === 'GET') {
      return {
        json: () => Promise.resolve([{ ciphertext: 'cipher', iv: 'ivvalue', auth_tag: 'authtag' }]),
      };
    }
    // Learned rules POST (insert merged rule — return=representation)
    if (url.includes('/rest/v1/learned_rules') && method === 'POST') {
      return { json: () => Promise.resolve([{ id: mergedRuleId }]) };
    }
    // Learned rules PATCH (slack_ts storage)
    if (url.includes('/rest/v1/learned_rules') && method === 'PATCH') {
      return { json: () => Promise.resolve([]) };
    }
    // Slack postMessage
    if (url.includes('slack.com/api/chat.postMessage') && method === 'POST') {
      return {
        json: () => Promise.resolve({ ok: true, ts: slackTs, channel: 'C123' }),
      };
    }
    // Knowledge bases POST (used by summarize step — won't be hit with empty feedback, but fallback)
    if (url.includes('/rest/v1/knowledge_bases') && method === 'POST') {
      return { json: () => Promise.resolve([]) };
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

async function invokeSummarizer(
  fn: ReturnType<typeof createFeedbackSummarizerTrigger>,
  step: ReturnType<typeof makeStep>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).fn({ step });
}

describe('createFeedbackSummarizerTrigger — synthesize-rules step', () => {
  let inngest: Inngest;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-key';

    mockCallLLM.mockResolvedValue({
      content: JSON.stringify({
        merges: [
          {
            original_rule_ids: ['rule-1', 'rule-2'],
            merged_rule_text: 'Always greet guests warmly and mention checkout time',
            rationale: 'Both rules address guest interaction',
          },
        ],
        contradictions: [],
      }),
      model: 'anthropic/claude-haiku-4-5',
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
  it('3 confirmed rules → LLM returns merge → learned_rules POSTed with source=weekly_synthesis + status=proposed → Slack posted with rule_confirm/rule_reject/rule_rephrase action_ids', async () => {
    const fn = createFeedbackSummarizerTrigger(inngest);
    const step = makeStep();

    await invokeSummarizer(fn, step);

    // callLLM should be called for the synthesis step
    expect(mockCallLLM).toHaveBeenCalled();

    // Assert POST to learned_rules with required fields
    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeDefined();
    const insertBody = JSON.parse((insertCall![1] as RequestInit).body as string);
    expect(insertBody.status).toBe('proposed');
    expect(insertBody.source).toBe('weekly_synthesis');
    expect(insertBody.entity_type).toBe('archetype');
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
        args[0].includes('/rest/v1/learned_rules?id=eq.merged-rule-id') &&
        (args[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(patchBody.slack_ts).toBe('ts-123.456');
  });

  // ── Test 2: Skip <2 rules ──
  it('1 confirmed rule → callLLM NOT called → no new learned_rules row created', async () => {
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

    const fn = createFeedbackSummarizerTrigger(inngest);
    const step = makeStep();

    await invokeSummarizer(fn, step);

    // callLLM must NOT be called — synthesis was skipped (<2 rules)
    expect(mockCallLLM).not.toHaveBeenCalled();

    // No POST to learned_rules
    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeUndefined();
  });

  // ── Test 3: Skip 0 rules ──
  it('0 confirmed rules → callLLM NOT called → completes without error', async () => {
    mockFetch = makeFetchMock({ confirmedRules: [] });
    vi.stubGlobal('fetch', mockFetch);

    const fn = createFeedbackSummarizerTrigger(inngest);
    const step = makeStep();

    await expect(invokeSummarizer(fn, step)).resolves.not.toThrow();

    expect(mockCallLLM).not.toHaveBeenCalled();

    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeUndefined();
  });

  // ── Test 4: Null notification_channel ──
  it('null notification_channel → merged rule IS created, Slack NOT called, tenant_secrets NOT queried', async () => {
    mockFetch = makeFetchMock({ archetypes: [ARCHETYPE_NO_CHANNEL] });
    vi.stubGlobal('fetch', mockFetch);

    const fn = createFeedbackSummarizerTrigger(inngest);
    const step = makeStep();

    await invokeSummarizer(fn, step);

    // Rule should still be created (POST to learned_rules)
    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeDefined();
    const insertBody = JSON.parse((insertCall![1] as RequestInit).body as string);
    expect(insertBody.status).toBe('proposed');

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
      model: 'anthropic/claude-haiku-4-5',
      estimatedCostUsd: 0.001,
    });

    const fn = createFeedbackSummarizerTrigger(inngest);
    const step = makeStep();

    await invokeSummarizer(fn, step);

    // callLLM WAS called (3 confirmed rules triggered synthesis)
    expect(mockCallLLM).toHaveBeenCalled();

    // But no POST to learned_rules (nothing to merge)
    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
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

  // ── Test 6: archetype select includes tenant_id and notification_channel ──
  it('archetypes fetch URL contains tenant_id and notification_channel in select param', async () => {
    const fn = createFeedbackSummarizerTrigger(inngest);
    const step = makeStep();

    await invokeSummarizer(fn, step);

    const archetypesFetch = mockFetch.mock.calls.find(
      (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('/rest/v1/archetypes'),
    );
    expect(archetypesFetch).toBeDefined();
    const url = archetypesFetch![0] as string;
    expect(url).toContain('tenant_id');
    expect(url).toContain('notification_channel');
  });

  // ── Test 7: TODO(GM-19) comment present in source file ──
  it('feedback-summarizer.ts contains TODO(GM-19) comment', () => {
    const filePath = join(process.cwd(), 'src/inngest/triggers/feedback-summarizer.ts');
    const contents = readFileSync(filePath, 'utf-8');
    expect(contents).toContain('TODO(GM-19)');
  });
});
