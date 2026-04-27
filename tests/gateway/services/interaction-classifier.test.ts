import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { callLLM } from '../../../src/lib/call-llm.js';
import {
  InteractionClassifier,
  resolveArchetypeFromChannel,
  resolveArchetypeFromTask,
} from '../../../src/gateway/services/interaction-classifier.js';

type MockCallLLM = ReturnType<typeof vi.fn>;

function makeCallLLM(content: string): MockCallLLM {
  return vi.fn().mockResolvedValue({
    content,
    model: 'anthropic/claude-haiku-4-5',
    promptTokens: 5,
    completionTokens: 1,
    estimatedCostUsd: 0,
    latencyMs: 10,
  });
}

function makeJsonResponse(data: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => data };
}

describe('InteractionClassifier', () => {
  let mockCallLLM: MockCallLLM;
  let classifier: InteractionClassifier;

  beforeEach(() => {
    mockCallLLM = makeCallLLM('question');
    classifier = new InteractionClassifier(mockCallLLM as typeof callLLM);
  });

  describe('classifyIntent', () => {
    it('returns feedback when LLM responds with feedback', async () => {
      mockCallLLM = makeCallLLM('feedback');
      classifier = new InteractionClassifier(mockCallLLM as typeof callLLM);
      const intent = await classifier.classifyIntent('Great work!');
      expect(intent).toBe('feedback');
    });

    it('returns teaching when LLM responds with teaching', async () => {
      mockCallLLM = makeCallLLM('teaching');
      classifier = new InteractionClassifier(mockCallLLM as typeof callLLM);
      const intent = await classifier.classifyIntent('Next time use bullet points');
      expect(intent).toBe('teaching');
    });

    it('returns question when LLM responds with question', async () => {
      mockCallLLM = makeCallLLM('question');
      classifier = new InteractionClassifier(mockCallLLM as typeof callLLM);
      const intent = await classifier.classifyIntent('What channels do you read?');
      expect(intent).toBe('question');
    });

    it('returns task when LLM responds with task', async () => {
      mockCallLLM = makeCallLLM('task');
      classifier = new InteractionClassifier(mockCallLLM as typeof callLLM);
      const intent = await classifier.classifyIntent('Please generate a summary now');
      expect(intent).toBe('task');
    });

    it('falls back to question for unrecognized LLM response', async () => {
      mockCallLLM = makeCallLLM('unknown_intent');
      classifier = new InteractionClassifier(mockCallLLM as typeof callLLM);
      const intent = await classifier.classifyIntent('some text');
      expect(intent).toBe('question');
    });

    it('trims and lowercases LLM response', async () => {
      mockCallLLM = makeCallLLM('  FEEDBACK  ');
      classifier = new InteractionClassifier(mockCallLLM as typeof callLLM);
      const intent = await classifier.classifyIntent('some text');
      expect(intent).toBe('feedback');
    });

    it('uses anthropic/claude-haiku-4-5 model for classification', async () => {
      await classifier.classifyIntent('some text');
      expect(mockCallLLM).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'anthropic/claude-haiku-4-5' }),
      );
    });

    it('uses generic system prompt when no archetype context provided', async () => {
      await classifier.classifyIntent('some text');
      expect(mockCallLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content:
                'Classify this interaction into exactly one category: feedback, teaching, question, task. Respond with one word only.',
            }),
          ]),
        }),
      );
    });

    it('includes role_name in system prompt when archetype context provided', async () => {
      await classifier.classifyIntent('some text', { role_name: 'Papi Chulo' });
      expect(mockCallLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content:
                'You are Papi Chulo. Classify this interaction into exactly one category: feedback, teaching, question, task. Respond with one word only.',
            }),
          ]),
        }),
      );
    });

    it('uses maxTokens: 10 and temperature: 0', async () => {
      await classifier.classifyIntent('some text');
      expect(mockCallLLM).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 10, temperature: 0 }),
      );
    });

    it('uses taskType: review', async () => {
      await classifier.classifyIntent('some text');
      expect(mockCallLLM).toHaveBeenCalledWith(expect.objectContaining({ taskType: 'review' }));
    });
  });
});

describe('resolveArchetypeFromChannel', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SECRET_KEY = 'secret-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it('returns archetype when notification_channel matches', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse([{ id: 'arch-1', role_name: 'Papi Chulo', notification_channel: 'C123' }]),
    );

    const result = await resolveArchetypeFromChannel('C123', 'tenant-1');

    expect(result).toEqual({
      id: 'arch-1',
      role_name: 'Papi Chulo',
      notification_channel: 'C123',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to first tenant archetype when no channel match', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse([]));
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse([{ id: 'arch-2', role_name: 'Summarizer', notification_channel: null }]),
    );

    const result = await resolveArchetypeFromChannel('C999', 'tenant-1');

    expect(result).toEqual({
      id: 'arch-2',
      role_name: 'Summarizer',
      notification_channel: null,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns null when no archetype found even on fallback', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse([]));
    mockFetch.mockResolvedValueOnce(makeJsonResponse([]));

    const result = await resolveArchetypeFromChannel('C999', 'tenant-1');

    expect(result).toBeNull();
  });

  it('uses correct PostgREST URL with channel and tenant filters', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse([{ id: 'arch-1', role_name: 'Papi Chulo', notification_channel: 'C123' }]),
    );

    await resolveArchetypeFromChannel('C123', 'tenant-abc');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('notification_channel=eq.C123');
    expect(url).toContain('tenant_id=eq.tenant-abc');
  });
});

describe('resolveArchetypeFromTask', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SECRET_KEY = 'secret-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it('returns archetype data with tenantId from task', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse([{ tenant_id: 'tenant-1', archetype_id: 'arch-1' }]),
    );
    mockFetch.mockResolvedValueOnce(makeJsonResponse([{ id: 'arch-1', role_name: 'Papi Chulo' }]));

    const result = await resolveArchetypeFromTask('task-uuid-123');

    expect(result).toEqual({
      id: 'arch-1',
      role_name: 'Papi Chulo',
      tenantId: 'tenant-1',
    });
  });

  it('returns null when task not found', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse([]));

    const result = await resolveArchetypeFromTask('nonexistent-task');

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when task has no archetype_id', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse([{ tenant_id: 'tenant-1', archetype_id: null }]),
    );

    const result = await resolveArchetypeFromTask('task-uuid-123');

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when archetype row not found', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse([{ tenant_id: 'tenant-1', archetype_id: 'arch-missing' }]),
    );
    mockFetch.mockResolvedValueOnce(makeJsonResponse([]));

    const result = await resolveArchetypeFromTask('task-uuid-123');

    expect(result).toBeNull();
  });

  it('queries tasks with correct task id filter', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse([{ tenant_id: 'tenant-1', archetype_id: 'arch-1' }]),
    );
    mockFetch.mockResolvedValueOnce(makeJsonResponse([{ id: 'arch-1', role_name: 'Papi Chulo' }]));

    await resolveArchetypeFromTask('my-task-id');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('tasks');
    expect(url).toContain('id=eq.my-task-id');
  });
});
