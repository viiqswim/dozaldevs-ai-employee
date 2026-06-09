import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callLLM,
  _resetAlertState,
  _resetCostCache,
  _resetGatewayModelCache,
  _resetPrisma,
} from '../../../src/lib/call-llm.js';
import { createSlackClient } from '../../../src/lib/slack-client.js';
import { getPlatformSetting } from '../../../src/lib/platform-settings.js';
import { GO_OPENAI_ENDPOINT } from '../../../src/lib/go-models.js';
import {
  CostCircuitBreakerError,
  LLMTimeoutError,
  RateLimitExceededError,
} from '../../../src/lib/errors.js';

const mockQueryRaw = vi.hoisted(() => vi.fn().mockResolvedValue([{ total: 0 }]));

const CATALOG_PRICING: Record<
  string,
  { input_cost_per_million: number; output_cost_per_million: number }
> = {
  'minimax/minimax-m2.7': { input_cost_per_million: 0.3, output_cost_per_million: 1.1 },
};

const mockModelCatalogFindFirst = vi.hoisted(() =>
  vi.fn().mockImplementation(({ where }: { where: { model_id: string } }) => {
    const entry = CATALOG_PRICING[where.model_id] ?? null;
    return Promise.resolve(entry);
  }),
);

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $queryRaw: mockQueryRaw,
    modelCatalog: {
      findFirst: mockModelCatalogFindFirst,
    },
  })),
}));

const mockPostMessage = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ts: '1', channel: '#alerts' }),
);

vi.mock('../../../src/lib/slack-client.js', () => ({
  createSlackClient: vi.fn().mockReturnValue({ postMessage: mockPostMessage }),
}));

vi.mock('../../../src/lib/platform-settings.js', () => ({
  getPlatformSetting: vi.fn(async (key: string) => {
    const defaults: Record<string, string> = {
      cost_limit_usd_per_day: '999999',
      cost_alert_slack_channel: '#test-alerts',
    };
    if (key in defaults) return defaults[key];
    throw new Error(`Unknown key in mock: ${key}`);
  }),
}));

const mockOpenRouterResponse = {
  choices: [{ message: { content: 'Hello!' } }],
  model: 'minimax/minimax-m2.7',
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

function makeFetchResponse(body: object, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

function makeAbortAwareFetch(): typeof fetch {
  return (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
}

describe('callLLM', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    _resetAlertState();
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([{ total: 0 }]);
    mockModelCatalogFindFirst.mockImplementation(({ where }: { where: { model_id: string } }) => {
      const entry = CATALOG_PRICING[where.model_id] ?? null;
      return Promise.resolve(entry);
    });
    vi.mocked(getPlatformSetting).mockImplementation(async (key: string) => {
      const defaults: Record<string, string> = {
        cost_limit_usd_per_day: '999999',
        cost_alert_slack_channel: '#test-alerts',
      };
      if (key in defaults) return defaults[key];
      throw new Error(`Unknown key in mock: ${key}`);
    });
    vi.mocked(createSlackClient).mockReturnValue({
      postMessage: mockPostMessage,
      updateMessage: vi.fn(),
    });
    mockPostMessage.mockResolvedValue({ ts: '1', channel: '#alerts' });
  });

  afterEach(() => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_DEFAULT_CHANNEL;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns content, model, tokens, estimatedCostUsd and latencyMs on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    const result = await callLLM({
      model: 'minimax/minimax-m2.7',
      messages: [{ role: 'user', content: 'Hello' }],
      taskType: 'execution',
    });

    expect(result.content).toBe('Hello!');
    expect(result.model).toBe('minimax/minimax-m2.7');
    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(50);
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
    expect(typeof result.latencyMs).toBe('number');
  });

  it('result.model reflects the model returned in the API response', async () => {
    const resp = { ...mockOpenRouterResponse, model: 'openai/gpt-4o' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(resp));

    const result = await callLLM({
      model: 'minimax/minimax-m2.7',
      messages: [],
      taskType: 'execution',
    });

    expect(result.model).toBe('openai/gpt-4o');
  });

  it('sends temperature: 0 in request body by default', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    await callLLM({ model: 'minimax/minimax-m2.7', messages: [], taskType: 'execution' });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.temperature).toBe(0);
  });

  it('includes max_tokens in request body when maxTokens is specified', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    await callLLM({
      model: 'minimax/minimax-m2.7',
      messages: [],
      taskType: 'execution',
      maxTokens: 512,
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(512);
  });

  it('omits max_tokens from request body when maxTokens is not specified', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    await callLLM({ model: 'minimax/minimax-m2.7', messages: [], taskType: 'execution' });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('sends Authorization: Bearer <api-key> header', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    await callLLM({ model: 'minimax/minimax-m2.7', messages: [], taskType: 'execution' });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key');
  });

  it('sends HTTP-Referer: https://ai-employee-platform header', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    await callLLM({ model: 'minimax/minimax-m2.7', messages: [], taskType: 'execution' });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['HTTP-Referer']).toBe('https://ai-employee-platform');
  });

  it('retries on 429 and returns result when 3rd attempt succeeds', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeFetchResponse({}, 429))
      .mockResolvedValueOnce(makeFetchResponse({}, 429))
      .mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    const promise = callLLM({
      model: 'minimax/minimax-m2.7',
      messages: [],
      taskType: 'execution',
    });
    await vi.advanceTimersByTimeAsync(3500);
    const result = await promise;

    expect(result.content).toBe('Hello!');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('throws RateLimitExceededError after exhausting all retry attempts on 429', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse({}, 429));

    const promise = callLLM({
      model: 'minimax/minimax-m2.7',
      messages: [],
      taskType: 'execution',
    });
    const assertion = expect(promise).rejects.toThrow(RateLimitExceededError);
    await vi.advanceTimersByTimeAsync(3500);
    await assertion;
  });

  it('throws LLMTimeoutError when the request times out', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(makeAbortAwareFetch());

    const promise = callLLM({
      model: 'minimax/minimax-m2.7',
      messages: [],
      taskType: 'execution',
      timeoutMs: 100,
    });
    const assertion = expect(promise).rejects.toThrow(LLMTimeoutError);
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
  });

  it('throws an error on 500 response', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeFetchResponse({ error: 'server error' }, 500));

    await expect(
      callLLM({ model: 'minimax/minimax-m2.7', messages: [], taskType: 'execution' }),
    ).rejects.toThrow('LLM provider returned 500');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sends Authorization: Bearer (empty string) when OPENROUTER_API_KEY is unset', async () => {
    delete process.env.OPENROUTER_API_KEY;

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    await callLLM({ model: 'minimax/minimax-m2.7', messages: [], taskType: 'execution' });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer ');
  });

  it('calculates estimatedCostUsd correctly for minimax-m2.7', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    const result = await callLLM({
      model: 'minimax/minimax-m2.7',
      messages: [],
      taskType: 'execution',
    });

    // 100 prompt tokens × $0.30/M + 50 completion tokens × $1.10/M = $0.000085
    expect(result.estimatedCostUsd).toBeCloseTo(0.000085, 8);
  });

  it('throws CostCircuitBreakerError when daily spend exceeds the configured limit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 6 * 60 * 1_000));

    mockQueryRaw.mockResolvedValueOnce([{ total: 100 }]);
    vi.mocked(getPlatformSetting).mockImplementation(async (key: string) => {
      if (key === 'cost_limit_usd_per_day') return '50';
      if (key === 'cost_alert_slack_channel') return '#test-alerts';
      throw new Error(`Unknown key in mock: ${key}`);
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    await expect(
      callLLM({ model: 'minimax/minimax-m2.7', messages: [], taskType: 'execution' }),
    ).rejects.toThrow(CostCircuitBreakerError);
  });

  it('returns estimatedCostUsd of 0 for a model not in the pricing map', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeFetchResponse({ ...mockOpenRouterResponse, model: 'unknown/future-model' }),
    );

    const result = await callLLM({
      model: 'unknown/future-model',
      messages: [],
      taskType: 'execution',
    });

    expect(result.estimatedCostUsd).toBe(0);
  });

  it('returns a non-negative numeric latencyMs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(mockOpenRouterResponse));

    const result = await callLLM({
      model: 'minimax/minimax-m2.7',
      messages: [],
      taskType: 'execution',
    });

    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('sends Slack alert with spend/threshold info when cost exceeds limit and SLACK_BOT_TOKEN is set', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2099-01-01T08:00:00Z'));

    mockQueryRaw.mockResolvedValue([{ total: 75 }]);
    vi.mocked(getPlatformSetting).mockImplementation(async (key: string) => {
      if (key === 'cost_limit_usd_per_day') return '50';
      if (key === 'cost_alert_slack_channel') return '#test-alerts';
      throw new Error(`Unknown key in mock: ${key}`);
    });
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';

    await expect(
      callLLM({ model: 'minimax/minimax-m2.7', messages: [], taskType: 'execution' }),
    ).rejects.toThrow(CostCircuitBreakerError);

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Cost Circuit Breaker'),
      }),
    );
    expect(mockPostMessage.mock.calls[0][0].text).toContain('$75.00');
    expect(mockPostMessage.mock.calls[0][0].text).toContain('$50.00');
    expect(mockPostMessage.mock.calls[0][0].text).toContain('default');
  });

  it('sends Slack alert only once per cooldown — second call within cooldown skips alert', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2099-01-01T09:00:00Z'));

    mockQueryRaw.mockResolvedValue([{ total: 75 }]);
    vi.mocked(getPlatformSetting).mockImplementation(async (key: string) => {
      if (key === 'cost_limit_usd_per_day') return '50';
      if (key === 'cost_alert_slack_channel') return '#test-alerts';
      throw new Error(`Unknown key in mock: ${key}`);
    });
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';

    await expect(
      callLLM({ model: 'minimax/minimax-m2.7', messages: [], taskType: 'execution' }),
    ).rejects.toThrow(CostCircuitBreakerError);

    vi.setSystemTime(new Date('2099-01-01T09:30:00Z'));

    await expect(
      callLLM({ model: 'minimax/minimax-m2.7', messages: [], taskType: 'execution' }),
    ).rejects.toThrow(CostCircuitBreakerError);

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
  });
});

// Separate block: stubs fetch globally (vs spyOn above) and resets module-level
// caches each test, so provider-routing assertions stay isolated from the
// fake-time circuit-breaker tests in the block above.
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

describe('callLLM — Go routing & gateway model', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const savedEnv: Record<string, string | undefined> = {};
  const mockGetPlatformSetting = vi.mocked(getPlatformSetting);

  beforeEach(() => {
    _resetGatewayModelCache();
    _resetCostCache();
    _resetAlertState();
    _resetPrisma();
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
        model: 'deepseek/deepseek-v4-flash',
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
    it('calculates cost using deepseek-v4-flash pricing from model_catalog (0.14 prompt / 0.28 completion)', async () => {
      const { PrismaClient } = await import('@prisma/client');
      vi.mocked(PrismaClient).mockImplementation(
        () =>
          ({
            modelCatalog: {
              findFirst: vi.fn().mockResolvedValue({
                input_cost_per_million: 0.14,
                output_cost_per_million: 0.28,
              }),
            },
          }) as unknown as InstanceType<typeof PrismaClient>,
      );

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

  describe('cost computation from model_catalog', () => {
    it('returns cost > 0 for a non-minimax/non-deepseek model when pricing is found in DB', async () => {
      const { PrismaClient } = await import('@prisma/client');
      vi.mocked(PrismaClient).mockImplementation(
        () =>
          ({
            modelCatalog: {
              findFirst: vi.fn().mockResolvedValue({
                input_cost_per_million: 0.5,
                output_cost_per_million: 1.5,
              }),
            },
          }) as unknown as InstanceType<typeof PrismaClient>,
      );

      fetchMock.mockResolvedValue(
        buildMockResponse({
          data: {
            choices: [{ message: { content: 'response' } }],
            model: 'alibaba/qwen3.7-max',
            usage: { prompt_tokens: 100_000, completion_tokens: 50_000 },
          },
        }),
      );

      const result = await callLLM({
        model: 'alibaba/qwen3.7-max',
        messages: baseMessages,
        taskType: 'review',
      });

      expect(result.estimatedCostUsd).toBeGreaterThan(0);
      expect(result.estimatedCostUsd).toBeCloseTo(0.125, 5);
    });

    it('returns 0 when model is not found in catalog', async () => {
      const { PrismaClient } = await import('@prisma/client');
      vi.mocked(PrismaClient).mockImplementation(
        () =>
          ({
            modelCatalog: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          }) as unknown as InstanceType<typeof PrismaClient>,
      );

      fetchMock.mockResolvedValue(buildMockResponse());

      const result = await callLLM({
        model: 'unknown/model-xyz',
        messages: baseMessages,
        taskType: 'review',
      });

      expect(result.estimatedCostUsd).toBe(0);
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
          model: 'deepseek/deepseek-v4-flash',
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

  describe('cost circuit breaker — decimal limit', () => {
    it('parses "50.5" as 50.5, not 50 — spend of 50.1 does not trip the breaker', async () => {
      process.env.DATABASE_URL = 'postgresql://test';

      mockGetPlatformSetting.mockImplementation(async (key: string) => {
        if (key === 'gateway_llm_model') return 'deepseek/deepseek-v4-flash';
        if (key === 'cost_limit_usd_per_day') return '50.5';
        if (key === 'cost_alert_slack_channel') return '#alerts';
        throw new Error(`Unexpected setting: ${key}`);
      });

      const { PrismaClient } = await import('@prisma/client');
      vi.mocked(PrismaClient).mockImplementation(
        () =>
          ({
            $queryRaw: vi.fn().mockResolvedValue([{ total: '50.1' }]),
          }) as unknown as InstanceType<typeof PrismaClient>,
      );

      await expect(callLLM({ messages: baseMessages, taskType: 'review' })).resolves.toBeDefined();
    });
  });
});
