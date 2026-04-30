import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { createRuleExtractorFunction } from '../../src/inngest/rule-extractor.js';

const { mockCallLLM, mockDecrypt } = vi.hoisted(() => ({
  mockCallLLM: vi.fn().mockResolvedValue({
    content: '{"extractable":true,"rule":"Always mention checkout time"}',
    model: 'anthropic/claude-haiku-4-5',
    estimatedCostUsd: 0.001,
  }),
  mockDecrypt: vi.fn().mockReturnValue('xoxb-test-token'),
}));

vi.mock('../../src/lib/call-llm.js', () => ({ callLLM: mockCallLLM }));
vi.mock('../../src/lib/encryption.js', () => ({ decrypt: mockDecrypt }));

let mockFetch: ReturnType<typeof vi.fn>;

function makeFetchMock({
  notificationChannel = 'C-TEST',
  feedbackContent = 'The tone was too casual' as string | null,
  ruleInsertId = 'rule-123',
  slackTs = 'ts-slack-123',
} = {}) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();

    // Feedback table GET (for feedback/teaching feedbackId path)
    if (url.includes('/rest/v1/feedback') && method === 'GET') {
      return { json: () => Promise.resolve([{ correction_reason: feedbackContent }]) };
    }
    // Archetypes GET for notification_channel
    if (url.includes('/rest/v1/archetypes') && method === 'GET') {
      return { json: () => Promise.resolve([{ notification_channel: notificationChannel }]) };
    }
    // Tenant secrets GET
    if (url.includes('/rest/v1/tenant_secrets') && method === 'GET') {
      return {
        json: () => Promise.resolve([{ ciphertext: 'cipher', iv: 'ivvalue', auth_tag: 'authtag' }]),
      };
    }
    // Tasks GET (for thread_ts in fallback path)
    if (url.includes('/rest/v1/tasks') && method === 'GET') {
      return { json: () => Promise.resolve([{ metadata: {} }]) };
    }
    // Learned rules POST (insert)
    if (url.includes('/rest/v1/learned_rules') && method === 'POST') {
      return { json: () => Promise.resolve([{ id: ruleInsertId }]) };
    }
    // Learned rules PATCH (slack_ts store or awaiting_input update)
    if (url.includes('/rest/v1/learned_rules') && method === 'PATCH') {
      return { json: () => Promise.resolve([]) };
    }
    // Slack postMessage
    if (url.includes('slack.com/api/chat.postMessage') && method === 'POST') {
      return {
        json: () => Promise.resolve({ ok: true, ts: slackTs, channel: notificationChannel }),
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

const defaultPayload = {
  tenantId: 'tenant-1',
  feedbackId: null as string | null,
  feedbackType: 'rejection_reason' as 'rejection_reason' | 'edit_diff' | 'feedback' | 'teaching',
  taskId: 'task-abc-123' as string | null,
  archetypeId: 'arch-1' as string | null,
  content: 'The tone was too casual' as string | null,
  originalContent: undefined as string | undefined,
  editedContent: undefined as string | undefined,
};

function makeEvent(overrides: Partial<typeof defaultPayload> = {}) {
  return { data: { ...defaultPayload, ...overrides } };
}

async function invokeExtractor(
  fn: ReturnType<typeof createRuleExtractorFunction>,
  event: ReturnType<typeof makeEvent>,
  step: ReturnType<typeof makeStep>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).fn({ event, step });
}

describe('createRuleExtractorFunction', () => {
  let inngest: Inngest;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-key';

    mockCallLLM.mockResolvedValue({
      content: '{"extractable":true,"rule":"Always mention checkout time"}',
      model: 'anthropic/claude-haiku-4-5',
      estimatedCostUsd: 0.001,
    });
    mockDecrypt.mockReturnValue('xoxb-test-token');

    mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    inngest = new Inngest({ id: 'test-app' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Test 1: Happy path edit_diff ──
  it('edit_diff — LLM returns extractable rule → INSERT proposed → Slack posted with 3 buttons → slack_ts stored', async () => {
    const fn = createRuleExtractorFunction(inngest);
    const step = makeStep();

    await invokeExtractor(
      fn,
      makeEvent({
        feedbackType: 'edit_diff',
        content: null,
        originalContent: 'Original draft text',
        editedContent: 'Edited draft text with changes',
      }),
      step,
    );

    // Should INSERT to learned_rules with status 'proposed'
    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeDefined();
    const insertBody = JSON.parse((insertCall![1] as RequestInit).body as string);
    expect(insertBody.status).toBe('proposed');
    expect(insertBody.rule_text).toBe('Always mention checkout time');

    // Should POST to Slack with 3 action buttons
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

    // Should PATCH to store slack_ts
    const patchCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules?id=eq.') &&
        (args[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(patchBody.slack_ts).toBe('ts-slack-123');
  });

  // ── Test 2: Happy path rejection_reason ──
  it('rejection_reason — content from event payload → extraction and DB insert', async () => {
    const fn = createRuleExtractorFunction(inngest);
    const step = makeStep();

    await invokeExtractor(
      fn,
      makeEvent({
        feedbackType: 'rejection_reason',
        content: 'The tone was too casual',
      }),
      step,
    );

    expect(mockCallLLM).toHaveBeenCalledOnce();

    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeDefined();
    const body = JSON.parse((insertCall![1] as RequestInit).body as string);
    expect(body.status).toBe('proposed');
    expect(body.source).toBe('rejection');
  });

  // ── Test 3: Happy path feedback with feedbackId (fetches content from feedback table) ──
  it('feedback + feedbackId — fetches correction_reason from feedback table → extraction', async () => {
    const fn = createRuleExtractorFunction(inngest);
    const step = makeStep();

    await invokeExtractor(
      fn,
      makeEvent({
        feedbackType: 'feedback',
        content: null,
        feedbackId: 'fb-uuid-999',
      }),
      step,
    );

    // Should have fetched from feedback table
    const feedbackFetch = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/feedback') &&
        args[0].includes('fb-uuid-999'),
    );
    expect(feedbackFetch).toBeDefined();

    // Should still call LLM
    expect(mockCallLLM).toHaveBeenCalledOnce();

    // Should INSERT proposed rule
    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeDefined();
  });

  // ── Test 4: Fallback — LLM returns non-extractable ──
  it('fallback — LLM returns extractable:false → no DB proposed insert → "What should I learn?" posted → awaiting_input row inserted', async () => {
    mockCallLLM.mockResolvedValue({
      content: '{"extractable":false}',
      model: 'anthropic/claude-haiku-4-5',
      estimatedCostUsd: 0.001,
    });

    const fn = createRuleExtractorFunction(inngest);
    const step = makeStep();

    await invokeExtractor(fn, makeEvent(), step);

    // Should NOT insert proposed rule (no POST with status 'proposed')
    const proposedInsert = mockFetch.mock.calls.find((args: unknown[]) => {
      if (
        typeof args[0] !== 'string' ||
        !args[0].includes('/rest/v1/learned_rules') ||
        (args[1] as RequestInit)?.method !== 'POST'
      )
        return false;
      try {
        const body = JSON.parse((args[1] as RequestInit).body as string);
        return body.status === 'proposed';
      } catch {
        return false;
      }
    });
    expect(proposedInsert).toBeUndefined();

    // Should post "What should I learn?" Slack message
    const slackCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' && args[0].includes('slack.com/api/chat.postMessage'),
    );
    expect(slackCall).toBeDefined();
    const slackBody = JSON.parse((slackCall![1] as RequestInit).body as string);
    expect(slackBody.text).toContain('What should I learn');

    // Should INSERT awaiting_input row
    const awaitingInsert = mockFetch.mock.calls.find((args: unknown[]) => {
      if (
        typeof args[0] !== 'string' ||
        !args[0].includes('/rest/v1/learned_rules') ||
        (args[1] as RequestInit)?.method !== 'POST'
      )
        return false;
      try {
        const body = JSON.parse((args[1] as RequestInit).body as string);
        return body.status === 'awaiting_input';
      } catch {
        return false;
      }
    });
    expect(awaitingInsert).toBeDefined();
    const awaitingBody = JSON.parse((awaitingInsert![1] as RequestInit).body as string);
    expect(awaitingBody.rule_text).toBe('');
  });

  // ── Test 5: Guard — empty content ──
  it('empty content → returns early, no LLM call', async () => {
    const fn = createRuleExtractorFunction(inngest);
    const step = makeStep();

    await invokeExtractor(
      fn,
      makeEvent({
        feedbackType: 'rejection_reason',
        content: '   ',
      }),
      step,
    );

    expect(mockCallLLM).not.toHaveBeenCalled();

    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeUndefined();
  });

  // ── Test 6: Guard — identical edit ──
  it('edit_diff with identical originalContent and editedContent → returns early', async () => {
    const fn = createRuleExtractorFunction(inngest);
    const step = makeStep();

    await invokeExtractor(
      fn,
      makeEvent({
        feedbackType: 'edit_diff',
        content: null,
        originalContent: 'Exactly the same text',
        editedContent: 'Exactly the same text',
      }),
      step,
    );

    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  // ── Test 7: Guard — null archetypeId ──
  it('null archetypeId → returns early, no LLM call', async () => {
    const fn = createRuleExtractorFunction(inngest);
    const step = makeStep();

    await invokeExtractor(
      fn,
      makeEvent({
        feedbackType: 'rejection_reason',
        content: 'The tone was too casual',
        archetypeId: null,
      }),
      step,
    );

    expect(mockCallLLM).not.toHaveBeenCalled();

    const insertCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method === 'POST',
    );
    expect(insertCall).toBeUndefined();
  });

  // ── Test 8: LLM returns invalid JSON → fallback path ──
  it('LLM returns invalid JSON → treated as non-extractable → fallback path (awaiting_input)', async () => {
    mockCallLLM.mockResolvedValue({
      content: 'not valid json at all',
      model: 'anthropic/claude-haiku-4-5',
      estimatedCostUsd: 0.001,
    });

    const fn = createRuleExtractorFunction(inngest);
    const step = makeStep();

    await invokeExtractor(fn, makeEvent(), step);

    // LLM was called
    expect(mockCallLLM).toHaveBeenCalledOnce();

    // Should insert awaiting_input (fallback path)
    const awaitingInsert = mockFetch.mock.calls.find((args: unknown[]) => {
      if (
        typeof args[0] !== 'string' ||
        !args[0].includes('/rest/v1/learned_rules') ||
        (args[1] as RequestInit)?.method !== 'POST'
      )
        return false;
      try {
        const body = JSON.parse((args[1] as RequestInit).body as string);
        return body.status === 'awaiting_input';
      } catch {
        return false;
      }
    });
    expect(awaitingInsert).toBeDefined();
  });

  // ── Test 9: Model enforcement ──
  it('model enforcement — callLLM always called with model: anthropic/claude-haiku-4-5', async () => {
    const fn = createRuleExtractorFunction(inngest);
    const step = makeStep();

    await invokeExtractor(fn, makeEvent(), step);

    expect(mockCallLLM).toHaveBeenCalledOnce();
    const callArgs = mockCallLLM.mock.calls[0][0] as { model: string };
    expect(callArgs.model).toBe('anthropic/claude-haiku-4-5');
  });

  // ── Test 10 (bonus): edit_diff with no content at all → returns early ──
  it('edit_diff with no originalContent and no editedContent → returns early', async () => {
    const fn = createRuleExtractorFunction(inngest);
    const step = makeStep();

    await invokeExtractor(
      fn,
      makeEvent({
        feedbackType: 'edit_diff',
        content: null,
        originalContent: undefined,
        editedContent: undefined,
      }),
      step,
    );

    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});
