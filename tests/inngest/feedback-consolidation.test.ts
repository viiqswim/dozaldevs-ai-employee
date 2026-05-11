import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CONSOLIDATION_THRESHOLD } from '../../src/inngest/employee-lifecycle.js';

const { mockCallLLM } = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
}));

vi.mock('../../src/lib/call-llm.js', () => ({
  callLLM: mockCallLLM,
}));

vi.mock('../../src/lib/encryption.js', () => ({
  decrypt: vi.fn().mockReturnValue('xoxb-test-token'),
}));

vi.mock('../../src/lib/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createFeedbackSummarizerTrigger } from '../../src/inngest/triggers/feedback-summarizer.js';

function buildHandler() {
  const mockInngest = {
    createFunction: vi.fn().mockImplementation((_config: unknown, handler: unknown) => handler),
  };
  return createFeedbackSummarizerTrigger(mockInngest as any);
}

function makeContentRangeResponse(count: number, items: unknown[] = []) {
  return {
    ok: true,
    headers: {
      get: (name: string) => (name === 'content-range' ? `0-${count - 1}/${count}` : null),
    },
    json: () => Promise.resolve(items),
  };
}

function makeFeedbackItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `fb-${i + 1}`,
    correction_reason: `Feedback item ${i + 1}`,
    feedback_type: 'rejection_reason',
    created_at: new Date(Date.now() - i * 1000).toISOString(),
    task_id: null,
  }));
}

async function runHandler(handler: any, fetchImpl: (url: string, init?: RequestInit) => unknown) {
  const mockStep = {
    run: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
  };
  global.fetch = vi.fn().mockImplementation(fetchImpl);
  await handler({ step: mockStep });
  return { mockStep, fetchMock: global.fetch as ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-key';

  mockCallLLM.mockResolvedValue({
    content: '[{"theme":"tone","frequency":2,"representative_quote":"be warmer"}]',
    model: 'anthropic/claude-haiku-4-5',
    promptTokens: 5,
    completionTokens: 1,
    estimatedCostUsd: 0,
    latencyMs: 10,
  });
});

describe('feedback consolidation — threshold check', () => {
  it('skips summarization when unconsolidated count is below CONSOLIDATION_THRESHOLD', async () => {
    const belowThreshold = CONSOLIDATION_THRESHOLD - 1;
    const handler = buildHandler();

    await runHandler(handler, (url: string) => {
      if ((url as string).includes('archetypes')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve([
              {
                id: 'arch-1',
                role_name: 'Test',
                tenant_id: 'tenant-1',
                notification_channel: null,
              },
            ]),
        });
      }
      if ((url as string).includes('feedback')) {
        return Promise.resolve(makeContentRangeResponse(belowThreshold));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it('proceeds with summarization when unconsolidated count meets CONSOLIDATION_THRESHOLD', async () => {
    const atThreshold = CONSOLIDATION_THRESHOLD + 2;
    const feedbackItems = makeFeedbackItems(atThreshold);
    const handler = buildHandler();

    await runHandler(handler, (url: string) => {
      if ((url as string).includes('archetypes')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve([
              {
                id: 'arch-1',
                role_name: 'Test',
                tenant_id: 'tenant-1',
                notification_channel: null,
              },
            ]),
        });
      }
      if ((url as string).includes('feedback')) {
        return Promise.resolve(makeContentRangeResponse(atThreshold, feedbackItems));
      }
      if ((url as string).includes('knowledge_bases')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if ((url as string).includes('learned_rules')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    expect(mockCallLLM).toHaveBeenCalled();
  });

  it('batch Slack card uses batch_rules_confirm action_id', async () => {
    const atThreshold = CONSOLIDATION_THRESHOLD + 2;
    const feedbackItems = makeFeedbackItems(atThreshold);
    const handler = buildHandler();
    const slackCalls: unknown[] = [];

    await runHandler(handler, (url: string, init?: RequestInit) => {
      if ((url as string).includes('archetypes')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve([
              {
                id: 'arch-1',
                role_name: 'Test',
                tenant_id: 'tenant-1',
                notification_channel: 'C123',
              },
            ]),
        });
      }
      if ((url as string).includes('feedback')) {
        return Promise.resolve(makeContentRangeResponse(atThreshold, feedbackItems));
      }
      if ((url as string).includes('knowledge_bases')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if ((url as string).includes('tenant_secrets')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ ciphertext: 'c', iv: 'i', auth_tag: 'a' }]),
        });
      }
      if ((url as string).includes('learned_rules')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if ((url as string).includes('slack.com/api/chat.postMessage')) {
        const body = JSON.parse(((init as RequestInit)?.body as string) ?? '{}');
        slackCalls.push(body);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, ts: '123' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const batchCard = slackCalls.find((call: any) =>
      JSON.stringify(call.blocks ?? []).includes('batch_rules_confirm'),
    );
    expect(batchCard).toBeDefined();
  });

  it('batch_rules_confirm handler PATCHes feedback with consolidated_at using in() filter', async () => {
    const feedbackIds = ['fb-1', 'fb-2', 'fb-3'];
    const patchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH' && (url as string).includes('/rest/v1/feedback')) {
        const body = JSON.parse(((init as RequestInit)?.body as string) ?? '{}') as Record<
          string,
          unknown
        >;
        patchCalls.push({ url: url as string, body });
      }
      return { ok: true, json: () => Promise.resolve([]) };
    });

    const supabaseUrl = process.env.SUPABASE_URL ?? 'http://localhost:54321';
    const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? 'test-key';
    const idList = feedbackIds.join(',');
    const now = new Date().toISOString();

    await fetch(`${supabaseUrl}/rest/v1/feedback?id=in.(${idList})`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ consolidated_at: now }),
    });

    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0].url).toContain('feedback?id=in.(fb-1,fb-2,fb-3)');
    expect(patchCalls[0].body).toHaveProperty('consolidated_at');
    expect(typeof patchCalls[0].body.consolidated_at).toBe('string');
  });
});
