import { resolveProvider } from '../../lib/go-models.js';

export interface ResolvedModelProvider {
  cleanModel: string;
  modelID: string;
  providerID: string;
  goKeyPresent: boolean;
}

/**
 * Strip the openrouter/ prefix and resolve the model to the correct LLM provider.
 * Reads OPENCODE_GO_API_KEY from env to determine whether Go routing is available.
 */
export function resolveModelProvider(model: string): ResolvedModelProvider {
  const cleanModel = model.startsWith('openrouter/') ? model.slice('openrouter/'.length) : model;
  const goKeyPresent = Boolean(process.env.OPENCODE_GO_API_KEY);
  const resolved = resolveProvider(cleanModel, goKeyPresent);
  return { ...resolved, cleanModel, goKeyPresent };
}
