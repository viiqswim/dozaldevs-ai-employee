# Learnings — plat-06-agents-md-merging

## 2026-04-27 Session Start

### Current Implementation (verified by reading source)

`src/workers/lib/agents-md-resolver.mts` — 21 lines:

```ts
export function resolveAgentsMd(
  archetype: { agents_md?: string | null } | null,
  tenantConfig: Record<string, unknown> | null,
): string | null;
```

- Signature: `(archetype, tenantConfig)` — archetype FIRST, tenantConfig SECOND (NOTE: plan says to swap to platformContent first)
- Returns `string | null` — returns null when no content found
- No imports — pure function already ✓

`tests/workers/lib/agents-md-resolver.test.ts` — 49 lines:

- 9 tests using `describe/it` pattern
- Import: `from '../../../src/workers/lib/agents-md-resolver.mjs'` (NOTE: `.mjs` extension in import, not `.mts`)

### Key Import Convention

The test imports from `.mjs` (compiled extension), NOT `.mts` (source extension). Must maintain this in rewritten tests.

### New Signature Target

```ts
resolveAgentsMd(platformContent: string, tenantConfig: Record<string, unknown> | null, archetype: { agents_md?: string | null } | null): string
```

NOTE: argument ORDER changes — platformContent first (added), tenantConfig second (unchanged), archetype THIRD (was first).
Return type changes: `string | null` → `string` (always returns content).

### Section Headers

- `# Platform Policy`
- `# Tenant Conventions`
- `# Employee Instructions`

### Separator: `\n\n` between all parts (header and content, between sections)

### Sections format:

```
# Platform Policy\n\n{platformContent}\n\n# Tenant Conventions\n\n{tenantContent}\n\n# Employee Instructions\n\n{archetypeContent}
```

Null/empty/whitespace sections are fully omitted (no header).
