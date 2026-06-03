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

export interface ResolvedProvider {
  providerID: string;
  modelID: string;
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
      return { providerID: 'opencode-go', modelID: goModelId };
    }
  }

  return { providerID: 'openrouter', modelID: cleanedId };
}
