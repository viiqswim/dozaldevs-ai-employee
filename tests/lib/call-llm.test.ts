import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callLLM, _resetAlertState } from '../../src/lib/call-llm.js';
import { createSlackClient } from '../../src/lib/slack-client.js';
import {
  CostCircuitBreakerError,
  LLMTimeoutError,
  RateLimitExceededError,
} from '../../src/lib/errors.js';

const mockQueryRaw = vi.hoisted(() => vi.fn().mockResolvedValue([{ total: 0 }]));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $queryRaw: mockQueryRaw,
  })),
}));

const mockPostMessage = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ts: '1', channel: '#alerts' }),
);

vi.mock('../../src/lib/slack-client.js', () => ({
  createSlackClient: vi.fn().mockReturnValue({ postMessage: mockPostMessage }),
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
    process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY = '999999';
    _resetAlertState();
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([{ total: 0 }]);
    vi.mocked(createSlackClient).mockReturnValue({ postMessage: mockPostMessage });
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
    ).rejects.toThrow('OpenRouter returned 500');

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
    process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY = '50';

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
    process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY = '50';
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
    process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY = '50';
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
