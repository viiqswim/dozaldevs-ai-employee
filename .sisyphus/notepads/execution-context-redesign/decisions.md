# Decisions — execution-context-redesign

## [2026-05-15] Architecture Decisions

- **Delivery-phase guard**: AUTOMATIC — delivery phase exits at line 535 before resolveAgentsMd at line 607. No conditional guard code needed in T1.
- **resolveAgentsMd signature**: Add optional `employeeRules?: string` and `employeeKnowledge?: string` as 4th and 5th params. Sections: `# Behavioral Rules (Learned)` and `# Employee Knowledge`.
- **fullPrompt after T1**: Will be `system_prompt (~150 chars) + "\n\n" + instructions (~300 chars) + "\n\nTask ID: ..."` — no rules/knowledge in the prompt.
- **admin-brain-preview.ts fix**: Remove ruleBlock concatenation from systemPrompt (lines 274-277). executionPrompt = `archetype.system_prompt + "\n\n" + instructions + "\n\nTask ID: <dynamic>"`. deliveryPrompt = `delivery_instructions + "\n\nTask ID: <dynamic>"` (no system_prompt prefix). Add rules/knowledge to agents_md.layers.
