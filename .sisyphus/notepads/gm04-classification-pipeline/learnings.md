# Learnings — gm04-classification-pipeline

## [2026-04-27] Session start

### Architecture

- Classification logic lives in the system prompt (GM-02), NOT in code
- Worker writes classification JSON to `/tmp/summary.txt`, harness stores as `deliverables.content`
- Lifecycle reads `deliverables.content` via PostgREST to detect NO_ACTION_NEEDED
- `NOTIFICATION_CHANNEL` env var available to both worker and lifecycle

### File Locations

- MVP parseClassifyResponse: `/Users/victordozal/repos/real-estate/vlre-employee/skills/pipeline/processor.ts` lines 330-370
- MVP ClassifyResult interface: lines 50-59
- Lifecycle insertion point: `src/inngest/employee-lifecycle.ts` between line 294 and line 296
- Existing deliverable fetch pattern: lines 325-330 in lifecycle `handle-approval-result`
- Existing !approvalRequired shortcircuit: lines 277-293 (DO NOT MODIFY — new check is additive)
- Archetype instructions: `prisma/seed.ts` VLRE_GUEST_MESSAGING_INSTRUCTIONS lines 413-438
- STEP 4 to update: line 427

### Key Edge Cases

- EC4: Worker STEP 1 writes non-JSON `"NO_ACTION_NEEDED: No unresponded..."` — parser must handle this BEFORE JSON.parse
- EC1: LLM may wrap JSON in markdown code fences — strip before parsing
- EC3: LLM may return non-null draftResponse for NO_ACTION_NEEDED — normalize to null
- EC2: Race condition on deliverable read — add retry (3 attempts, 1s apart)

### Test Infrastructure

- Framework: Vitest v2
- Pattern: vi.hoisted() for mocks, vi.stubGlobal('fetch') for PostgREST
- Lifecycle test template: `tests/inngest/employee-lifecycle-delivery.test.ts`
- Classifier test template: `tests/gateway/services/interaction-classifier.test.ts`

### Decisions

- Parse failure → default to NEEDS_APPROVAL (no false negatives)
- NO_ACTION_NEEDED Slack post: WORKER posts (already has context) — lifecycle just detects and short-circuits
- Benchmark model: `minimax/minimax-m2.7` only (per AGENTS.md)
- Benchmark: 25-30 synthetic messages, pass threshold ≥90%
