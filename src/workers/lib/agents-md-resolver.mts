/**
 * Resolves AGENTS.md content by concatenating all levels:
 * 1. tenantConfig.default_agents_md (if non-empty) — who the employee is
 * 2. archetype.agents_md (if non-empty) — the employee's specific job
 * 3. platformRuntimeSections (if provided) — tools and procedures available at runtime
 * 4. employeeRules (if non-empty) — learned behavioral rules from feedback pipeline (override)
 * 5. employeeKnowledge (if non-empty) — employee knowledge base content
 * 6. Platform AGENTS.md (always included) — platform policy last
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
  const tenantDefault = tenantConfig?.default_agents_md;
  if (typeof tenantDefault === 'string' && tenantDefault.trim().length > 0) {
    sections.push(`# Who You Are\n\n${tenantDefault}`);
  }
  const archetypeMd = archetype?.agents_md;
  if (archetypeMd != null && archetypeMd.trim().length > 0) {
    sections.push(`# Your Job\n\n${archetypeMd}`);
  }
  if (platformRuntimeSections && platformRuntimeSections.length > 0) {
    sections.push(`# Your Tools & Procedures\n\n${platformRuntimeSections.join('\n\n')}`);
  }
  if (employeeRules != null && employeeRules.trim().length > 0) {
    sections.push(
      `# Behavioral Rules (Learned)\n\nThese rules override conflicting guidance above.\n\n${employeeRules}`,
    );
  }
  if (employeeKnowledge != null && employeeKnowledge.trim().length > 0) {
    sections.push(`# Knowledge Base\n\n${employeeKnowledge}`);
  }
  sections.push(`# Platform Rules\n\n${platformContent}`);
  if (closingSections && closingSections.length > 0) {
    sections.push(closingSections.join('\n\n'));
  }
  return sections.join('\n\n');
}
