/**
 * Formats an array of env var entries into a bullet-point manifest string.
 * Used by both the harness (via PLATFORM_ENV_MANIFEST env var) and the
 * brain-preview API to produce an identical env manifest for AGENTS.md injection.
 */
export interface EnvVarSummary {
  name: string;
  source: string;
  category: string;
}

export function buildEnvManifestFromVars(envVars: EnvVarSummary[]): string {
  if (envVars.length === 0) return '';
  return envVars
    .map(({ name, source, category }) => `- $${name} — ${source} (${category})`)
    .join('\n');
}
