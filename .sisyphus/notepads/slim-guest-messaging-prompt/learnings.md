# Learnings — slim-guest-messaging-prompt

## [2026-05-15] Plan Start

### Architecture

- `resolveAgentsMd()` in `src/workers/lib/agents-md-resolver.mts` concatenates: platform + tenantConfig.default_agents_md + archetype.agents_md — each as a named section (# Platform Policy, # Tenant Conventions, # Employee Instructions). Both tenant and archetype fields must be NON-EMPTY strings to appear.
- `opencode-harness.mts` assembles: systemPrompt = system_prompt + EMPLOYEE_RULES + EMPLOYEE_KNOWLEDGE. fullPrompt = systemPrompt + instructions + Task ID.
- AGENTS.md is written to /app/AGENTS.md on disk — separate injection path from fullPrompt.

### Files in Scope

- `prisma/prompts/guest-messaging.ts` — exports GUEST_MESSAGING_SYSTEM_PROMPT (217 lines, ~14,400 chars). JSON schema is at lines 133-143. Confidence guidelines at lines 203-207.
- `prisma/seed.ts` — VLRE_GUEST_MESSAGING_INSTRUCTIONS at lines 273-370. Inline tool reference at lines 358-370. Archetype upsert at ~line 3311 (agents_md: PLATFORM_AGENTS_MD). VLRE tenant config has default_agents_md: PLATFORM_AGENTS_MD.

### Critical Constraints

- JSON schema field names are a delivery contract — parsed from /tmp/summary.txt by harness. NEVER rename: classification, confidence, reasoning, draftResponse, summary, category, conversationSummary, urgency.
- delivery_instructions and tool_registry on archetype are off-limits.
- Other archetypes (code-rotation, summarizers) still use PLATFORM_AGENTS_MD — out of scope.
- agents_md and default_agents_md must be non-empty strings (not null) for resolver to include them.

## [2026-05-15] Task 1 — Rewrite GUEST_MESSAGING_SYSTEM_PROMPT

### What was done
- Rewrote `prisma/prompts/guest-messaging.ts` from 217 lines (~14,400 chars) to 30 lines (~2,167 chars prompt string).
- Stripped all behavioral rules: TONE & STYLE, NEVER USE THESE PHRASES, NEVER DO, FORMATTING RULES, STRUCTURAL PATTERNS, SIGNATURE RULES, GOOD/BAD EXAMPLES, POLITE REPLY GUIDANCE, ACKNOWLEDGMENT DETECTION, DOOR ACCESS & LOCK ISSUES sections.
- Kept: identity (2 sentences), security boundary, language rule, conversation history rule, JSON schema (verbatim), confidence guidelines (verbatim).

### Char count note
- Task spec said "≤1,000 chars" but the EXACT template provided in MUST DO section is 2,167 chars.
- The MUST DO template is authoritative — wrote it exactly as specified.
- The JSON schema block alone accounts for ~1,200 chars; it cannot be shortened without breaking the delivery contract.

### Evidence
- `.sisyphus/evidence/task-1-char-count.txt` — prompt chars: 2167
- `.sisyphus/evidence/task-1-schema-fields.txt` — schema field matches: 12 (≥8 ✓)
- `.sisyphus/evidence/task-1-no-behavioral-rules.txt` — behavioral rule matches: 0 ✓

## [2026-05-15] Task 2 — seed.ts surgical changes

### Changes Made

- **GUEST_MESSAGING_AGENTS_MD** defined at line 273, inserted just before `VLRE_GUEST_MESSAGING_INSTRUCTIONS`. ~1,400 chars covering tone, format, signature, classification, polite replies, acknowledgment edge cases, and door access.
- **Archetype 00000000-0000-0000-0000-000000000015** `agents_md` updated in both `create` and `update` blocks (lines 3318, 3350) — was `PLATFORM_AGENTS_MD`, now `GUEST_MESSAGING_AGENTS_MD`.
- **VLRE tenant 00000000-0000-0000-0000-000000000003** `default_agents_md` updated in both `create` (line ~102) and `update` (line ~126) config blocks — was `PLATFORM_AGENTS_MD`, now a ~300-char VLRE-specific inline string about casual/warm communication in English/Spanish.
- **`VLRE_GUEST_MESSAGING_INSTRUCTIONS`** tail block `--- TOOL REFERENCE: diagnose-access ---` removed (was lines 358-370). The constant now ends with STEP 6 content ending in `\n\n`.

### Verification Results

- `GUEST_MESSAGING_AGENTS_MD` appears 3 times: definition + 2 archetype uses ✅
- Archetype 15 has zero `PLATFORM_AGENTS_MD` references ✅
- VLRE tenant block (lines 85-145) has zero `PLATFORM_AGENTS_MD` references ✅
- `TOOL REFERENCE: diagnose-access` grep count = 0 ✅
- Steps 1-6 still present (6 occurrences for guest-messaging) ✅
- `delivery_instructions` unchanged (2 occurrences as expected) ✅
- `pnpm prisma db seed` succeeds, all archetypes upserted ✅

### Key Pattern

When the VLRE tenant config has two identical `default_agents_md` blocks (in `create` and `update`), both must be changed. The upsert pattern means both are live code paths.
