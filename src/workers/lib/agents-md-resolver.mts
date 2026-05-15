/**
 * Resolves AGENTS.md content by concatenating all levels:
 * 1. Platform AGENTS.md (always included)
 * 2. tenantConfig.default_agents_md (if non-empty)
 * 3. archetype.agents_md (if non-empty)
 * 4. employeeRules (if non-empty) — learned behavioral rules from feedback pipeline
 * 5. employeeKnowledge (if non-empty) — employee knowledge base content
 */
export function resolveAgentsMd(
  platformContent: string,
  tenantConfig: Record<string, unknown> | null,
  archetype: { agents_md?: string | null } | null,
  employeeRules?: string,
  employeeKnowledge?: string,
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
  if (employeeRules != null && employeeRules.trim().length > 0) {
    sections.push(`# Behavioral Rules (Learned)\n\n${employeeRules}`);
  }
  if (employeeKnowledge != null && employeeKnowledge.trim().length > 0) {
    sections.push(`# Employee Knowledge\n\n${employeeKnowledge}`);
  }
  return sections.join('\n\n');
}
