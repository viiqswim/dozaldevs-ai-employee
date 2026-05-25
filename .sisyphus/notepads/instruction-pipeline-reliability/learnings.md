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

## [2026-05-25] Recovery Nudge Implementation

### What was built
Added a "recovery nudge" to `runOpencodeSession()` in `src/workers/opencode-harness.mts`:
- After a session completes (monitorResult.completed === true), checks if `/tmp/summary.txt` exists
- If missing: sends a single recovery nudge via `sessionManager.injectTaskPrompt`, re-monitors for up to 5 minutes, then calls `checkOutputFiles()` again
- If output still absent after nudge: throws hard error
- If output found after nudge: returns early with success (server killed in finally block)

### Signature change
`runOpencodeSession(instructions, model)` → `runOpencodeSession(instructions, model, submitOutputCmd)`
- Main call site passes the already-constructed `submitOutputCmd` from main()
- Delivery phase call site (line ~678) passes a hardcoded `NO_ACTION_NEEDED` variant (delivery is always post-approval)

### Pre-existing test flakiness
`tests/gateway/jira-webhook-with-new-project.test.ts` triggers an unhandled rejection from `scripts/trigger-task.ts:703` (process.exit). Not caused by these changes — all 1714 test assertions pass.

### Nudge message format
Short and imperative: `"You forgot the mandatory final step. Run this command NOW:\n${submitOutputCmd}"`
