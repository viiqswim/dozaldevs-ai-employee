/**
 * Resolves AGENTS.md content using three-level fallback:
 * 1. archetype.agents_md (per-employee override)
 * 2. tenantConfig.default_agents_md (tenant-level default)
 * 3. null → caller leaves static /app/AGENTS.md untouched (platform default from PLAT-02)
 */
export function resolveAgentsMd(
  archetype: { agents_md?: string | null } | null,
  tenantConfig: Record<string, unknown> | null,
): string | null {
  if (archetype?.agents_md != null && archetype.agents_md.trim().length > 0) {
    return archetype.agents_md;
  }

  const tenantDefault = tenantConfig?.default_agents_md;
  if (typeof tenantDefault === 'string' && tenantDefault.trim().length > 0) {
    return tenantDefault;
  }

  return null;
}
