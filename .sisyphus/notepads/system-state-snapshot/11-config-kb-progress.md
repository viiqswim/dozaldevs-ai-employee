# Tenant Config, KB, LLM Models & Phase 1 Progress — Verification Notepad

## Source Files Verified

- `prisma/seed.ts` — tenant records, archetype configs, knowledge_base entries
- `src/lib/call-llm.ts` — LLM model enforcement and allowed models
- `src/inngest/interaction-handler.ts` — model usage (claude-haiku-4-5)
- `src/inngest/triggers/feedback-summarizer.ts` — model usage
- `src/inngest/rule-extractor.ts` — model usage
- `docs/2026-04-21-2202-phase1-story-map.md` — Phase 1 progress tracking

## Current State

### Tenant Configuration

Two tenants seeded in `prisma/seed.ts`:

| ID                                     | Name      | Slug      | Slack Workspace                         | notification_channel          |
| -------------------------------------- | --------- | --------- | --------------------------------------- | ----------------------------- |
| `00000000-0000-0000-0000-000000000002` | DozalDevs | dozaldevs | `T0601SMSVEU` (Dozal Inc.)              | `C0AUBMXKVNU` (#victor-tests) |
| `00000000-0000-0000-0000-000000000003` | VLRE      | vlre      | `T06KFDGLHS6` (vlreworkspace.slack.com) | `C0960S2Q8RL`                 |

**DozalDevs channel config** (`tenant.config.summary`):

- `target_channel`: `C0AUBMXKVNU` (#victor-tests) — approval message + buttons
- `publish_channel`: `C092BJ04HUG` (#project-lighthouse) — confirmation after approval
- `channel_ids`: `["C092BJ04HUG"]` — channels to read

**VLRE channel config** (`tenant.config.summary`):

- `target_channel`: `C0960S2Q8RL`
- `publish_channel`: `C0960S2Q8RL`
- `channel_ids`: `["C0AMGJQN05S", "C0ANH9J91NC", "C0960S2Q8RL"]`

### Knowledge Base Entries

10 entries seeded in `prisma/seed.ts` (all scoped to VLRE tenant `...000003`):

| ID suffix | scope  | entity_id           | Description                |
| --------- | ------ | ------------------- | -------------------------- |
| `...100`  | common | —                   | VLRE-wide common knowledge |
| `...101`  | entity | vlre-3505-ban       | Property 3505-BAN specific |
| `...102`  | entity | test-property-alpha | Test property alpha        |
| `...103`  | entity | test-property-beta  | Test property beta         |
| `...104`  | entity | 4d23f49c (3412-SAN) | Property 3412-SAN specific |
| `...105`  | entity | 2c64f880 (3420-HOV) | Property 3420-HOV specific |
| `...106`  | entity | 6e6169bf (3401-BRE) | Property 3401-BRE specific |
| `...107`  | entity | 646ca297 (271-GIN)  | Property 271-GIN specific  |
| `...108`  | entity | 3fa27670 (219-PAU)  | Property 219-PAU specific  |
| `...109`  | entity | dac5a0e0 (1602-BLU) | Property 1602-BLU specific |

### Approved LLM Models

Only two models are approved and in use (verified against `src/lib/call-llm.ts` and all callers):

| Model            | ID                           | Purpose                                                                                   |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| MiniMax M2.7     | `minimax/minimax-m2.7`       | Primary execution — all employee work, code generation, summaries                         |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4-5` | Verification/judge — feedback acknowledgment, interaction classification, rule extraction |

**Zero forbidden models found**: `claude-sonnet-*`, `claude-opus-*`, `gpt-4o`, `gpt-4o-mini` — 0 matches in entire codebase.

Usage breakdown:

- `minimax/minimax-m2.7`: All 3 archetypes (daily-summarizer DozalDevs, daily-summarizer VLRE, guest-messaging), harness defaults
- `anthropic/claude-haiku-4-5`: `interaction-handler.ts` (classification), `feedback-summarizer.ts`, `rule-extractor.ts`, `call-llm.ts` (verification judge)

### Phase 1 Progress

**Release 1.0** (End-to-End Thin Slice) — ✅ **COMPLETE**

- HF-01 through HF-05: all checked ✅
- GM-01 through GM-06: all checked ✅
- PLAT-01 through PLAT-10: all checked ✅ (PLAT-07 has one deferred item, intentional)

**Release 1.1** (Multi-Property + Safety Nets) — majority complete per story map

**Release 1.2** (Smart Locks + Employee Ops) — ❌ **NOT STARTED**

- GM-15 (smart lock diagnosis tool) — 8 items unchecked
- GM-20 (startup/shutdown messages) — 7 items unchecked
- GM-21 (audit_events table) — 8 items unchecked

**Release 1.3** (Metrics + VLRE Validation) — ❌ **NOT STARTED**

- ME-01 through ME-06 — all unchecked (~30 items)
- VP-01, VP-02 — validation not started

**Release 1.4** (Design Partner Readiness) — ❌ **NOT STARTED**

- HF-06 (calendar tool), VP-03/04/05, CLEAN-01/02/03 — all unchecked

**Summary**: Platform foundation solid. Release 1.0 complete. Releases 1.2–1.4 (~60% of total stories) remain.

## Changes from April 24 Doc

- `notification_channel` column added to archetypes (migration 20260427064845) — new per-archetype channel config
- KB entries grew from 2 → 10 (added 8 property-specific entries for VLRE properties)
- Phase 1 Release 1.0 now fully complete (PLAT-10 unified interaction handler done)
- Releases 1.2–1.4 confirmed NOT STARTED

## New Content (not in old doc)

- `notification_channel` per-archetype config (PLAT-07/08 partial implementation)
- 8 new property-specific KB entries (3412-SAN, 3420-HOV, 3401-BRE, 271-GIN, 219-PAU, 1602-BLU, test-alpha, test-beta)
- Phase 1 progress section with release-by-release breakdown

## Unresolved

- None — all items verified against source files
