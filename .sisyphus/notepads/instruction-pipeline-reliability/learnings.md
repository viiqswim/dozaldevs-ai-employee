# Learnings — instruction-pipeline-reliability

## [2026-05-24] Session Start

### Key File Locations

- `src/workers/config/agents.md` — 180 lines, 9 sections. §5=lines 45-56, §6=lines 59-73, §9=lines 156-166
- `src/workers/lib/agents-md-resolver.mts` — 38 lines, pure concatenation, 6 layers
- `src/workers/lib/platform-procedures.mts` — 38 lines, 2 branches (approvalRequired true/false)
- `src/workers/opencode-harness.mts` — resolveAgentsMd() call at lines 851-858, approvalRequired extracted at lines 831-832

### Current resolveAgentsMd() signature

```typescript
export function resolveAgentsMd(
  platformContent: string,
  tenantConfig: Record<string, unknown> | null,
  archetype: { agents_md?: string | null } | null,
  employeeRules?: string,
  employeeKnowledge?: string,
  platformRuntimeSections?: string[],
): string;
```

Need to add `closingSections?: string[]` as 7th parameter, appended after layer 6.

### Harness call site (lines 851-858)

```typescript
const agentsMdContent = resolveAgentsMd(
  platformContent,
  tenantConfig,
  archetype,
  employeeRules,
  employeeKnowledge,
  platformRuntimeSections,
);
```

`approvalRequired` is already extracted at line 831-832 — reuse for closing section classification.

### agents.md sections to KEEP (verbatim)

- §5 (Platform Code Is Off-Limits) — lines 45-56
- §6 (Database Access Only Via Tools) — lines 59-73
- §9 (Tool Discovery) — lines 156-166

### agents.md sections to REMOVE

- §1 Source Access Permission
- §2 Patch Permission
- §3 Smoke Test After Any Patch
- §4 Mandatory Issue Reporting
- §7 Output Format (moved to platform-procedures)
- §8 Error Handling (moved to platform-procedures)
- Summary section at bottom
