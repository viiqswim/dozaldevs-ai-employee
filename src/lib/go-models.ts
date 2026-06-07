export const GO_MODEL_MAP: Map<string, string> = new Map([
  ['minimax/minimax-m2.7', 'minimax-m2.7'],
  ['minimax/minimax-m2.5', 'minimax-m2.5'],
  ['minimax/minimax-m3', 'minimax-m3'],
  ['deepseek/deepseek-v4-flash', 'deepseek-v4-flash'],
  ['deepseek/deepseek-v4-pro', 'deepseek-v4-pro'],
  ['xiaomi/mimo-v2.5', 'mimo-v2.5'],
  ['xiaomi/mimo-v2.5-pro', 'mimo-v2.5-pro'],
  ['alibaba/qwen3.7-max', 'qwen3.7-max'],
  ['alibaba/qwen3.7-plus', 'qwen3.7-plus'],
  ['alibaba/qwen3.6-plus', 'qwen3.6-plus'],
  ['zhipu/glm-5.1', 'glm-5.1'],
  ['zhipu/glm-5', 'glm-5'],
  ['moonshot/kimi-k2.5', 'kimi-k2.5'],
  ['moonshot/kimi-k2.6', 'kimi-k2.6'],
]);

// OpenAI-compatible models use /chat/completions endpoint
// Anthropic-compatible models use /messages endpoint (NOT supported by call-llm.ts)
export type GoEndpointType = 'openai' | 'anthropic';

export const GO_ENDPOINT_TYPE: Map<string, GoEndpointType> = new Map([
  // OpenAI-compatible — can be used by both worker harness AND gateway (call-llm.ts)
  ['deepseek-v4-flash', 'openai'],
  ['deepseek-v4-pro', 'openai'],
  ['glm-5.1', 'openai'],
  ['glm-5', 'openai'],
  ['kimi-k2.5', 'openai'],
  ['kimi-k2.6', 'openai'],
  ['mimo-v2.5', 'openai'],
  ['mimo-v2.5-pro', 'openai'],
  // Anthropic-compatible — worker harness only (OpenCode handles routing internally)
  // call-llm.ts CANNOT use these through Go (uses OpenAI chat format)
  ['minimax-m3', 'anthropic'],
  ['minimax-m2.7', 'anthropic'],
  ['minimax-m2.5', 'anthropic'],
  ['qwen3.7-max', 'anthropic'],
  ['qwen3.7-plus', 'anthropic'],
  ['qwen3.6-plus', 'anthropic'],
]);

export const GO_OPENAI_ENDPOINT = 'https://opencode.ai/zen/go/v1/chat/completions';

export interface ResolvedProvider {
  providerID: string;
  modelID: string;
  goEndpointType?: GoEndpointType;
}

export function resolveProvider(
  openRouterModelId: string,
  goApiKeyPresent: boolean,
): ResolvedProvider {
  const cleanedId = openRouterModelId.startsWith('openrouter/')
    ? openRouterModelId.slice('openrouter/'.length)
    : openRouterModelId;

  if (goApiKeyPresent) {
    const goModelId = GO_MODEL_MAP.get(cleanedId);
    if (goModelId !== undefined) {
      return {
        providerID: 'opencode-go',
        modelID: goModelId,
        goEndpointType: GO_ENDPOINT_TYPE.get(goModelId),
      };
    }
  }

  return { providerID: 'openrouter', modelID: cleanedId };
}
