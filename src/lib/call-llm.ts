import { PrismaClient } from '@prisma/client';
import { CostCircuitBreakerError, LLMTimeoutError, RateLimitExceededError } from './errors.js';
import { createLogger } from './logger.js';
import { withRetry } from './retry.js';
import { createSlackClient } from './slack-client.js';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CallLLMOptions {
  model: string; // OpenRouter model ID — ONLY approved models: "minimax/minimax-m2.7" or "anthropic/claude-haiku-4-5"
  messages: Message[];
  taskType: 'triage' | 'execution' | 'review';
  taskId?: string;
  temperature?: number; // default: 0
  maxTokens?: number;
  timeoutMs?: number; // default: 120_000
}

export interface CallLLMResult {
  content: string;
  model: string; // actual model used (may differ from requested)
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

const PRICING_PER_1M_TOKENS: Record<string, { prompt: number; completion: number }> = {
  'minimax/minimax-m2.7': { prompt: 0.3, completion: 1.1 },
  'anthropic/claude-haiku-4-5': { prompt: 0.8, completion: 4.0 },
};

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

const COST_CACHE: { value: number; refreshedAt: Date | null } = {
  value: 0,
  refreshedAt: null,
};
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_COST_LIMIT_USD = 50;

let alertSentAt: Date | null = null;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export function _resetAlertState(): void {
  alertSentAt = null;
}

type CostRow = { total: number | string | null };

async function checkCostCircuitBreaker(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const limitUsd =
    parseFloat(process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY ?? '') || DEFAULT_COST_LIMIT_USD;

  const now = new Date();
  const cacheExpired =
    COST_CACHE.refreshedAt === null ||
    now.getTime() - COST_CACHE.refreshedAt.getTime() > CACHE_TTL_MS;

  if (cacheExpired) {
    const rows = await getPrisma().$queryRaw<CostRow[]>`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) as total
      FROM executions
      WHERE created_at > NOW() - INTERVAL '1 day'
    `;
    const rawTotal = rows[0]?.total;
    COST_CACHE.value =
      rawTotal === null || rawTotal === undefined ? 0 : parseFloat(String(rawTotal));
    COST_CACHE.refreshedAt = now;
  }

  if (COST_CACHE.value > limitUsd) {
    if (!alertSentAt || now.getTime() - alertSentAt.getTime() > ALERT_COOLDOWN_MS) {
      alertSentAt = now;
      const slackBotToken = process.env.SLACK_BOT_TOKEN;
      if (slackBotToken) {
        const slack = createSlackClient({
          botToken: slackBotToken,
          defaultChannel: process.env.SLACK_DEFAULT_CHANNEL ?? '#alerts',
        });
        await slack
          .postMessage({
            text: `🚨 *Cost Circuit Breaker Triggered*\nDepartment: default\nCurrent spend: $${COST_CACHE.value.toFixed(2)}\nLimit: $${limitUsd.toFixed(2)}\nTimestamp: ${now.toISOString()}\nNew LLM calls are paused until the daily limit resets or the limit is increased.`,
          })
          .catch(() => {});
      }
    }
    throw new CostCircuitBreakerError(
      `Daily LLM spend $${COST_CACHE.value.toFixed(2)} exceeds limit $${limitUsd.toFixed(2)}`,
      {
        department: 'default',
        currentSpendUsd: COST_CACHE.value,
        limitUsd,
      },
    );
  }
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function fetchWithRateLimitCheck(url: string, options: RequestInit): Promise<Response> {
  const response = await fetch(url, options);
  if (response.status === 429) {
    throw new RateLimitExceededError('OpenRouter rate limit hit', {
      service: 'openrouter',
      attempts: 1,
    });
  }
  return response;
}

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export async function callLLM(options: CallLLMOptions): Promise<CallLLMResult> {
  const { model, messages, temperature, maxTokens, timeoutMs = 120_000 } = options;

  try {
    await checkCostCircuitBreaker();
  } catch (err) {
    if (err instanceof CostCircuitBreakerError) {
      throw err;
    }
    createLogger('call-llm').warn(
      { err },
      'Cost circuit breaker DB check skipped — DB unreachable',
    );
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature: temperature ?? 0,
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
  };

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
      'HTTP-Referer': 'https://ai-employee-platform',
      'X-Title': 'AI Employee Platform',
    },
    body: JSON.stringify(requestBody),
    signal: controller.signal,
  };

  const startMs = Date.now();
  let response: Response;

  try {
    response = await withRetry(() => fetchWithRateLimitCheck(OPENROUTER_URL, fetchOptions), {
      retryOn: (e) => e instanceof RateLimitExceededError,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LLMTimeoutError(`LLM call timed out after ${timeoutMs}ms`, {
        timeoutMs,
        model,
      });
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    throw new Error(`OpenRouter returned ${response.status}: ${await response.text()}`);
  }

  const latencyMs = Date.now() - startMs;
  const data = (await response.json()) as OpenRouterResponse;

  const content = data.choices[0]?.message.content ?? '';
  const actualModel = data.model;
  const promptTokens = data.usage.prompt_tokens;
  const completionTokens = data.usage.completion_tokens;

  const pricing = PRICING_PER_1M_TOKENS[model];
  const estimatedCostUsd = pricing
    ? (promptTokens * pricing.prompt + completionTokens * pricing.completion) / 1_000_000
    : 0;

  return {
    content,
    model: actualModel,
    promptTokens,
    completionTokens,
    estimatedCostUsd,
    latencyMs,
  };
}
