import { PrismaClient } from '@prisma/client';
import {
  DATABASE_URL,
  OPENCODE_GO_API_KEY,
  OPENROUTER_API_KEY,
  SLACK_BOT_TOKEN,
} from './config.js';
import { CostCircuitBreakerError, LLMTimeoutError, RateLimitExceededError } from './errors.js';
import { GO_OPENAI_ENDPOINT, resolveProvider } from './go-models.js';
import { createLogger } from './logger.js';
import { getPlatformSetting } from './platform-settings.js';
import { withRetry } from './retry.js';
import { createSlackClient } from './slack-client.js';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CallLLMOptions {
  model?: string; // Optional — defaults to gateway_llm_model platform setting
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

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export function _resetPrisma(): void {
  _prisma = null;
}

async function getCostForModel(
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<number> {
  try {
    const entry = await getPrisma().modelCatalog.findFirst({
      where: { model_id: model, deleted_at: null },
    });
    if (entry) {
      return (
        (promptTokens * entry.input_cost_per_million +
          completionTokens * entry.output_cost_per_million) /
        1_000_000
      );
    }
    createLogger('call-llm').warn({ model }, 'Model not found in catalog, recording $0 cost');
    return 0;
  } catch {
    createLogger('call-llm').warn({ model }, 'Model not found in catalog, recording $0 cost');
    return 0;
  }
}

const COST_CACHE: { value: number; refreshedAt: Date | null } = {
  value: 0,
  refreshedAt: null,
};
const CACHE_TTL_MS = 5 * 60 * 1000;

const GATEWAY_MODEL_CACHE: { value: string | null; refreshedAt: Date | null } = {
  value: null,
  refreshedAt: null,
};
const GATEWAY_MODEL_CACHE_TTL_MS = 60 * 1000;

export function _resetGatewayModelCache(): void {
  GATEWAY_MODEL_CACHE.value = null;
  GATEWAY_MODEL_CACHE.refreshedAt = null;
}

async function getGatewayModel(): Promise<string> {
  const now = new Date();
  const cacheExpired =
    GATEWAY_MODEL_CACHE.refreshedAt === null ||
    now.getTime() - GATEWAY_MODEL_CACHE.refreshedAt.getTime() > GATEWAY_MODEL_CACHE_TTL_MS;

  if (cacheExpired || GATEWAY_MODEL_CACHE.value === null) {
    GATEWAY_MODEL_CACHE.value = await getPlatformSetting('gateway_llm_model');
    GATEWAY_MODEL_CACHE.refreshedAt = now;
  }

  return GATEWAY_MODEL_CACHE.value;
}

let alertSentAt: Date | null = null;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export function _resetAlertState(): void {
  alertSentAt = null;
}

type CostRow = { total: number | string | null };

async function checkCostCircuitBreaker(): Promise<void> {
  if (!DATABASE_URL()) return;

  const costLimitStr = await getPlatformSetting('cost_limit_usd_per_day');
  const parsedLimit = parseFloat(costLimitStr);
  const limitUsd = isNaN(parsedLimit) ? 50 : parsedLimit;
  if (isNaN(parsedLimit)) {
    createLogger('call-llm').warn(
      { costLimitStr },
      'cost_limit_usd_per_day is not a valid number, defaulting to 50',
    );
  }

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
      const slackBotToken = SLACK_BOT_TOKEN();
      if (slackBotToken) {
        const slack = createSlackClient({
          botToken: slackBotToken,
          defaultChannel: await getPlatformSetting('cost_alert_slack_channel'),
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
    throw new RateLimitExceededError('LLM rate limit hit', {
      service: 'llm-provider',
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
  const { messages, temperature, maxTokens, timeoutMs = 120_000 } = options;

  const effectiveModel = options.model ?? (await getGatewayModel());

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

  const resolved = resolveProvider(effectiveModel, !!OPENCODE_GO_API_KEY());

  let apiUrl: string;
  let authKey: string;
  let requestModelId: string;

  if (resolved.providerID === 'opencode-go') {
    if (resolved.goEndpointType === 'openai') {
      apiUrl = GO_OPENAI_ENDPOINT;
      authKey = OPENCODE_GO_API_KEY();
      requestModelId = resolved.modelID; // Go model ID (no vendor prefix)
    } else {
      // Anthropic-format model — fall back to OpenRouter
      createLogger('call-llm').warn(
        { model: effectiveModel },
        'Model uses Anthropic format on Go — falling back to OpenRouter for gateway call',
      );
      apiUrl = OPENROUTER_URL;
      authKey = OPENROUTER_API_KEY();
      requestModelId = effectiveModel; // Full OpenRouter model ID
    }
  } else {
    apiUrl = OPENROUTER_URL;
    authKey = OPENROUTER_API_KEY();
    requestModelId = effectiveModel; // Full OpenRouter model ID
  }

  createLogger('call-llm').info(
    { provider: resolved.providerID, model: effectiveModel },
    'Gateway LLM call',
  );

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody: Record<string, unknown> = {
    model: requestModelId,
    messages,
    temperature: temperature ?? 0,
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
  };

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authKey}`,
      'HTTP-Referer': 'https://ai-employee-platform',
      'X-Title': 'AI Employee Platform',
    },
    body: JSON.stringify(requestBody),
    signal: controller.signal,
  };

  const startMs = Date.now();
  let response: Response;

  try {
    response = await withRetry(() => fetchWithRateLimitCheck(apiUrl, fetchOptions), {
      retryOn: (e) => e instanceof RateLimitExceededError,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LLMTimeoutError(`LLM call timed out after ${timeoutMs}ms`, {
        timeoutMs,
        model: effectiveModel,
      });
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    throw new Error(`LLM provider returned ${response.status}: ${await response.text()}`);
  }

  const latencyMs = Date.now() - startMs;
  const data = (await response.json()) as OpenRouterResponse;

  const content = data.choices[0]?.message.content ?? '';
  const actualModel = data.model;
  const promptTokens = data.usage.prompt_tokens;
  const completionTokens = data.usage.completion_tokens;

  const estimatedCostUsd = await getCostForModel(effectiveModel, promptTokens, completionTokens);

  return {
    content,
    model: actualModel,
    promptTokens,
    completionTokens,
    estimatedCostUsd,
    latencyMs,
  };
}
