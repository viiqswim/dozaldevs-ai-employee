/**
 * Resolves AGENTS.md content by concatenating all three levels:
 * 1. Platform AGENTS.md (always included)
 * 2. tenantConfig.default_agents_md (if non-empty)
 * 3. archetype.agents_md (if non-empty)
 */
export function resolveAgentsMd(
  platformContent: string,
  tenantConfig: Record<string, unknown> | null,
  archetype: { agents_md?: string | null } | null,
): string {
  const sections: string[] = [];
  sections.push(`# Platform Policy\n\n${platformContent}`);
  const tenantDefault = tenantConfig?.default_agents_md;
  if (typeof tenantDefault === 'string' && tenantDefault.trim().length > 0) {
    sections.push(`# Tenant Conventions\n\n${tenantDefault}`);
  }
  const archetypeMd = archetype?.agents_md;
  if (archetypeMd != null && archetypeMd.trim().length > 0) {
    sections.push(`# Employee Instructions\n\n${archetypeMd}`);
  }
  return sections.join('\n\n');
}
