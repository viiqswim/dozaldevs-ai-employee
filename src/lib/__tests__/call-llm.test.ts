import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform-settings.js', () => ({
  getPlatformSetting: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  createLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../slack-client.js', () => ({
  createSlackClient: vi.fn(() => ({
    postMessage: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../retry.js', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { getPlatformSetting } from '../platform-settings.js';
import { _resetGatewayModelCache, callLLM } from '../call-llm.js';
import { GO_OPENAI_ENDPOINT } from '../go-models.js';

const mockGetPlatformSetting = vi.mocked(getPlatformSetting);

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildMockResponse(
  overrides: Partial<{
    ok: boolean;
    status: number;
    text: string;
    data: unknown;
  }> = {},
) {
  const data = overrides.data ?? {
    choices: [{ message: { content: 'Hello!' } }],
    model: 'deepseek/deepseek-v4-flash',
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    text: vi.fn().mockResolvedValue(overrides.text ?? ''),
    json: vi.fn().mockResolvedValue(data),
  };
}

const baseMessages = [{ role: 'user' as const, content: 'Hello' }];

describe('callLLM', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    _resetGatewayModelCache();
    fetchMock = vi.fn().mockResolvedValue(buildMockResponse());
    vi.stubGlobal('fetch', fetchMock);

    savedEnv.OPENCODE_GO_API_KEY = process.env.OPENCODE_GO_API_KEY;
    savedEnv.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    savedEnv.DATABASE_URL = process.env.DATABASE_URL;

    delete process.env.OPENCODE_GO_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    delete process.env.DATABASE_URL;

    mockGetPlatformSetting.mockImplementation(async (key: string) => {
      if (key === 'gateway_llm_model') return 'deepseek/deepseek-v4-flash';
      if (key === 'cost_limit_usd_per_day') return '50';
      throw new Error(`Unexpected setting: ${key}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();

    if (savedEnv.OPENCODE_GO_API_KEY !== undefined) {
      process.env.OPENCODE_GO_API_KEY = savedEnv.OPENCODE_GO_API_KEY;
    } else {
      delete process.env.OPENCODE_GO_API_KEY;
    }
    if (savedEnv.OPENROUTER_API_KEY !== undefined) {
      process.env.OPENROUTER_API_KEY = savedEnv.OPENROUTER_API_KEY;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
    if (savedEnv.DATABASE_URL !== undefined) {
      process.env.DATABASE_URL = savedEnv.DATABASE_URL;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  describe('default model', () => {
    it('fetches gateway_llm_model from platform settings when model is undefined', async () => {
      await callLLM({ messages: baseMessages, taskType: 'review' });

      expect(mockGetPlatformSetting).toHaveBeenCalledWith('gateway_llm_model');
    });

    it('uses explicit model when provided, skips platform setting for model', async () => {
      await callLLM({
        model: 'anthropic/claude-haiku-4-5',
        messages: baseMessages,
        taskType: 'review',
      });

      const modelCalls = mockGetPlatformSetting.mock.calls.filter(
        ([k]) => k === 'gateway_llm_model',
      );
      expect(modelCalls).toHaveLength(0);
    });

    it('caches the gateway model for 60s (second call does not re-fetch)', async () => {
      await callLLM({ messages: baseMessages, taskType: 'review' });
      await callLLM({ messages: baseMessages, taskType: 'review' });

      const modelCalls = mockGetPlatformSetting.mock.calls.filter(
        ([k]) => k === 'gateway_llm_model',
      );
      expect(modelCalls).toHaveLength(1);
    });

    it('re-fetches gateway model after cache TTL expires', async () => {
      vi.useFakeTimers();

      await callLLM({ messages: baseMessages, taskType: 'review' });

      vi.advanceTimersByTime(61_000);

      await callLLM({ messages: baseMessages, taskType: 'review' });

      const modelCalls = mockGetPlatformSetting.mock.calls.filter(
        ([k]) => k === 'gateway_llm_model',
      );
      expect(modelCalls).toHaveLength(2);

      vi.useRealTimers();
    });
  });

  describe('Go routing — openai endpoint', () => {
    it('routes deepseek model through GO_OPENAI_ENDPOINT when Go key is present', async () => {
      process.env.OPENCODE_GO_API_KEY = 'go-test-key';
      fetchMock.mockResolvedValue(
        buildMockResponse({
          data: {
            choices: [{ message: { content: 'response' } }],
            model: 'deepseek-v4-flash',
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        }),
      );

      await callLLM({
        model: 'deepseek/deepseek-v4-flash',
        messages: baseMessages,
        taskType: 'review',
      });

      const [calledUrl, calledOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(GO_OPENAI_ENDPOINT);
      expect((calledOptions.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer go-test-key',
      );

      const body = JSON.parse(calledOptions.body as string) as { model: string };
      expect(body.model).toBe('deepseek-v4-flash');
    });
  });

  describe('Go routing — Anthropic endpoint fallback', () => {
    it('falls back to OpenRouter for minimax (anthropic format) even when Go key is present', async () => {
      process.env.OPENCODE_GO_API_KEY = 'go-test-key';
      fetchMock.mockResolvedValue(
        buildMockResponse({
          data: {
            choices: [{ message: { content: 'response' } }],
            model: 'minimax/minimax-m2.7',
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        }),
      );

      await callLLM({
        model: 'minimax/minimax-m2.7',
        messages: baseMessages,
        taskType: 'review',
      });

      const [calledUrl, calledOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(OPENROUTER_URL);
      expect((calledOptions.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer test-openrouter-key',
      );

      const body = JSON.parse(calledOptions.body as string) as { model: string };
      expect(body.model).toBe('minimax/minimax-m2.7');
    });
  });

  describe('non-Go model fallback', () => {
    it('routes unknown/non-Go model through OpenRouter even when Go key is present', async () => {
      process.env.OPENCODE_GO_API_KEY = 'go-test-key';
      fetchMock.mockResolvedValue(
        buildMockResponse({
          data: {
            choices: [{ message: { content: 'response' } }],
            model: 'google/gemini-flash',
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        }),
      );

      await callLLM({
        model: 'google/gemini-flash',
        messages: baseMessages,
        taskType: 'review',
      });

      const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(OPENROUTER_URL);
    });
  });

  describe('no Go key', () => {
    it('routes deepseek model through OpenRouter when Go key is absent', async () => {
      fetchMock.mockResolvedValue(
        buildMockResponse({
          data: {
            choices: [{ message: { content: 'response' } }],
            model: 'deepseek/deepseek-v4-flash',
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        }),
      );

      await callLLM({
        model: 'deepseek/deepseek-v4-flash',
        messages: baseMessages,
        taskType: 'review',
      });

      const [calledUrl, calledOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(OPENROUTER_URL);

      const body = JSON.parse(calledOptions.body as string) as { model: string };
      expect(body.model).toBe('deepseek/deepseek-v4-flash');
    });
  });

  describe('Flash pricing', () => {
    it('calculates cost using deepseek-v4-flash pricing (0.14 prompt / 0.28 completion)', async () => {
      fetchMock.mockResolvedValue(
        buildMockResponse({
          data: {
            choices: [{ message: { content: 'response' } }],
            model: 'deepseek/deepseek-v4-flash',
            usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
          },
        }),
      );

      const result = await callLLM({
        model: 'deepseek/deepseek-v4-flash',
        messages: baseMessages,
        taskType: 'review',
      });

      expect(result.estimatedCostUsd).toBeCloseTo(0.14 + 0.28, 5);
    });
  });

  describe('error handling', () => {
    it('throws provider-agnostic error on non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
        json: vi.fn(),
      });

      await expect(
        callLLM({
          model: 'anthropic/claude-haiku-4-5',
          messages: baseMessages,
          taskType: 'review',
        }),
      ).rejects.toThrow('LLM provider returned 500: Internal Server Error');
    });
  });

  describe('_resetGatewayModelCache', () => {
    it('forces re-fetch on next call after reset', async () => {
      await callLLM({ messages: baseMessages, taskType: 'review' });

      _resetGatewayModelCache();

      await callLLM({ messages: baseMessages, taskType: 'review' });

      const modelCalls = mockGetPlatformSetting.mock.calls.filter(
        ([k]) => k === 'gateway_llm_model',
      );
      expect(modelCalls).toHaveLength(2);
    });
  });
});
