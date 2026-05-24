/**
 * Resolves AGENTS.md content by concatenating all levels:
 * 1. Platform AGENTS.md (always included)
 * 2. platformRuntimeSections (if provided) — platform-generated runtime context
 * 3. tenantConfig.default_agents_md (if non-empty)
 * 4. archetype.agents_md (if non-empty)
 * 5. employeeRules (if non-empty) — learned behavioral rules from feedback pipeline
 * 6. employeeKnowledge (if non-empty) — employee knowledge base content
 * 7. closingSections (if provided) — final reminders appended last
 */
export function resolveAgentsMd(
  platformContent: string,
  tenantConfig: Record<string, unknown> | null,
  archetype: { agents_md?: string | null } | null,
  employeeRules?: string,
  employeeKnowledge?: string,
  platformRuntimeSections?: string[],
  closingSections?: string[],
): string {
  const sections: string[] = [];
  sections.push(`# Platform Policy\n\n${platformContent}`);
  if (platformRuntimeSections && platformRuntimeSections.length > 0) {
    sections.push(`# Platform Runtime Context\n\n${platformRuntimeSections.join('\n\n')}`);
  }
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
  if (closingSections && closingSections.length > 0) {
    sections.push(`# Final Reminders\n\n${closingSections.join('\n\n')}`);
  }
  return sections.join('\n\n');
}
