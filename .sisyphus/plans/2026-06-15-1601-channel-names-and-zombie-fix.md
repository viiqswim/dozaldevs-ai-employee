# Plan: Plain-Channel-Names + Silent-Zombie Fix

> **Status**: READY — all open questions resolved, code surface mapped. Awaiting user go-ahead to execute.
> **Created**: 2026-06-15 16:01
> **Origin**: Debugging session on task `1ef9ddae-1ca4-46a9-86af-4e0c772d4768` (slack-channel-summarizer zombie in Reviewing).

---

## Background & Motivation

A `slack-channel-summarizer` employee was triggered and got stuck in `Reviewing` with no approval card. Root-cause analysis surfaced three issues. One (the `submit-output` env-var doc drift) is already fixed in the working tree (see "Pre-work already done" below). This plan covers the remaining two:

- **#2 — Channel-names-in-instructions redesign**: Today, channels are configured as Slack channel IDs in `tenant.config.source_channels`, injected as the `SOURCE_CHANNELS` env var, and referenced as a `$SOURCE_CHANNELS` placeholder in generated prose. This exposes a technical concept (env vars, channel IDs) the platform's non-technical users should never see. The product goal: **a user writes plain channel names in the employee's instructions (e.g. "summarize #general and #ops") and the employee resolves them at runtime.** No env var, no channel IDs, no hidden tenant-config requirement.

- **#3 — Silent-zombie fix**: When a worker produces a degraded/error output that is NOT a valid `NEEDS_APPROVAL` StandardOutput, but `risk_model.approval_required = true`, the lifecycle still forces `Submitting → Reviewing` and then finds no approval-card metadata. It logs a warning, posts no card, creates no `pending_approvals` row, and the task rots in `Reviewing` until the watchdog kills it 30 min later. This should instead route to `Failed` with a visible, user-friendly reason.

### Product constraints (verbatim from user)

- "I'm trying to make this platform so that it doesn't require any technology expertise whatsoever from the user's perspective."
- AI Employee is **single-tenant** (one archetype = one tenant). The multi-tenant-reuse justification for env-var indirection does NOT apply.
- Channel renames → the human updates the employee's instructions. Acceptable. No auto-resync required.
- The extra `conversations.list` API call to resolve names→IDs at runtime is acceptable.

---

## Pre-work already done (in working tree, NOT yet committed)

Fix #4 from the debugging session — `submit-output` env-var documentation drift:

- `src/lib/tool-registry.ts`: `submit-output` descriptor `envVars` changed from `['SUPABASE_URL','SUPABASE_SECRET_KEY','TASK_ID']` → `[]` (matches the real tool, which is a pure local file writer).
- `src/workers/skills/tool-usage-reference/SKILL.md` + `src/workers/skills/platform/actions/submit-output.md`: regenerated (now show "Environment variables: None").
- `tests/unit/env-enforcement.test.ts`: removed now-stale `TASK_ID` exemption from `TASK_SCOPED_VARS` (no descriptor references it anymore).
- Verified: full unit suite 2067 passed, 9 skipped, 0 failed.

> **Decision needed**: commit this as a standalone commit before starting this plan, OR fold into Wave 1. Recommend a standalone commit since it's an independent, verified fix.

---

## Investigation Findings (code-verified)

### Channel plumbing (current, 5 stages)

1. **Storage**: `tenant.config` JSON blob holds `source_channels: string[]` (channel IDs) + `notification_channel`. Also `archetype.notification_channel` (first-class column).
2. **Assembly**: `src/repositories/tenant-env-loader.ts` reads `tenant.config.source_channels` → joins → `env['SOURCE_CHANNELS']`. Also sets `NOTIFICATION_CHANNEL`, `PUBLISH_CHANNEL`.
3. **Injection**: `src/inngest/lifecycle/lib/machine-provisioner.ts` spreads `tenantEnv` into container env.
4. **Runtime substitution**: `src/workers/lib/template-vars.ts` — `buildTemplateVars()` lowercases env keys; `substituteTemplateVars()` replaces `{{source_channels}}` in the initial prompt. NOTE: the `$SOURCE_CHANNELS` prose form is documentation convention only; actual substitution uses `{{source_channels}}` double-brace.
5. **Tool consumption**: `src/worker-tools/slack/read-channels.ts` takes `--channels "C123,C456"` (IDs only).

### Generator convention

- `src/gateway/services/prompts/archetype-generator-prompts.ts` instructs the LLM to emit `$SOURCE_CHANNELS`/`$NOTIFICATION_CHANNEL`/`$PUBLISH_CHANNEL` literal placeholders in `execution_steps`. AGENTS.md documents this as the "intent-level steps convention".

### Silent-zombie chain (code-verified)

- `src/inngest/lifecycle/steps/validate-and-submit.ts` → for `approvalRequired=true`, calls `runOverrideCardPath` then `runReviewingPath`.
- `src/inngest/lifecycle/steps/reviewing-path.ts`:
  - `trackPendingApprovalStep()` (lines ~196–232) reads `approval_message_ts` / `target_channel` from the deliverable metadata. If **missing**, it logs the warning seen in the incident and **returns without creating a `pending_approvals` row or posting a card** — but `set-reviewing` (line 365) has already flipped status to `Reviewing` and `wait-for-approval` (line 410) still waits the full `timeoutHours`.
  - This is the zombie. The `reviewing-watchdog` cron (30-min threshold) eventually marks it `Failed`.
- Auto-post fallback: `src/workers/lib/harness-helpers.mts` `tryAutoPostApprovalCard()` + `src/workers/lib/output-contract.mts` `checkOutputFiles()` only fire when the summary is a valid `StandardOutput` with `NEEDS_APPROVAL`. A plain-text error summary (as in the incident) parses to nothing → no card → metadata empty.

---

## Scope Boundaries

### MUST do

- **#2**: Make plain channel names in instructions the supported path; resolve names→IDs at runtime; stop exposing `SOURCE_CHANNELS`/channel IDs to users. The `#` prefix MUST be OPTIONAL — `general` and `#general` must behave identically; detection is by ID-shape (`^[CGD][A-Z0-9]+$`), not by a marker the user has to type.
- **#3**: Detect the "approval required but no valid approval-card metadata" condition in the reviewing path and route to `Failed` with a clear, non-technical reason — BEFORE flipping to `Reviewing` (or immediately after, but never enter the 24h wait).
- E2E validation for both, per AGENTS.md mandatory E2E rules.

### MUST NOT do

- MUST NOT break the legitimate approval path (valid `NEEDS_APPROVAL` → card posted → `pending_approvals` row → wait).
- MUST NOT require a `#` prefix on channel names — `#` is optional/tolerated, never mandatory. A user typing `general` (no `#`) must work identically to `#general`.
- MUST NOT introduce fuzzy channel-name matching — exact case-insensitive name match against `conversations.list` only (one deterministic resolve).
- MUST NOT change `isToolAllowed` / `enforce_tool_registry` semantics.
- MUST NOT hardcode channel IDs into generated `execution_steps` prose.
- MUST NOT alter the `reviewing-watchdog` 30-min threshold.

---

## RESOLVED DECISIONS (user-confirmed 2026-06-15)

- **Q1 (architecture for #2) → (A)**: Resolution lives **inside `read-channels.ts`**. Accept `--channels "#general,#ops"`, detect `#`-prefixed names, call `conversations.list` to resolve to IDs, then proceed. Self-contained, single tool change.
- **Q2 (migration for #2) → Hard-migrate, NO backward compat**: Platform has not officially launched. Remove `SOURCE_CHANNELS` env-var injection entirely. Rewrite existing `slack-channel-summarizer` `execution_steps` to plain channel names. No fallback.
- **Q3 (UX for #2) → Graceful Slack post**: When the bot lacks access to a named channel, the employee posts a plain-English Slack message saying it couldn't complete because it lacks access to that channel. Worker-side capability.
- **Q4 (behavior for #3) → Failed + Slack explanation + ❌**: Degraded-output + approval-required → route to `Failed` with a user-facing reason. MUST post a Slack explanation to the notify channel AND flip the existing notification to ❌. Copy: Atlas chooses (plain, non-technical, empathetic per Slack voice rules).

## Extras (user-confirmed)

- Fold the #4 pre-work fix into **Wave 0** of this plan.
- Apply the **full F1–F4 review wave** to these changes, **in addition to** the standard live E2E validation.

---

## Code Surface Map (agent-verified file:line anchors)

### #2 — SOURCE_CHANNELS removal + name resolution

| File                                                          | Lines                                                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/worker-tools/slack/read-channels.ts`                     | 41–65 (parseArgs), 150–175 (main)                                                              | Add name→ID resolution via `conversations.list({ types: 'public_channel,private_channel', limit: 1000 })`. **Shape-based detection (NOT a required `#` prefix)**: an entry matching the channel-ID shape (`^[CGD][A-Z0-9]+$`) is used directly; anything else is treated as a name — strip an OPTIONAL leading `#`, then resolve. So `#general`, `general`, and `general,C123` all work. Bot already has `channels:read`+`groups:read` (proven by admin-slack-channels.ts:51). Unresolved name → graceful no-access path (Task 3). |
| `src/gateway/services/prompts/archetype-generator-prompts.ts` | 118–130 (SYSTEM_PROMPT_PRE), 295 (REFINE), 338 (buildConverseSystemPromptPre)                  | Replace `$SOURCE_CHANNELS` instruction with "write channel names directly in steps (e.g. `general` or `#general` — both accepted)". Leave `$NOTIFICATION_CHANNEL`/`$PUBLISH_CHANNEL` UNTOUCHED.                                                                                                                                                                                                                                                                                                                                    |
| `src/repositories/tenant-env-loader.ts`                       | 73–83                                                                                          | Delete the `SOURCE_CHANNELS` block (incl. legacy `summary.channel_ids` fallback). Leave NOTIFICATION_CHANNEL (63–71) + PUBLISH_CHANNEL (85–88).                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/gateway/routes/admin-brain-preview.ts`                   | 208–218                                                                                        | Remove SOURCE_CHANNELS env-var catalog entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/gateway/validation/schemas.ts`                           | 242                                                                                            | Remove `source_channels` from TenantConfigBodySchema.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `prisma/seed.ts`                                              | 39,53,74,98 (tenant configs); 237,254 (SUMMARIZER_INSTRUCTIONS); 3127–3214 (archetype upserts) | Remove `source_channels` from both tenant configs; rewrite both SUMMARIZER_INSTRUCTIONS to name channels in prose (plain names, `#` optional). NOTE: tool_registry uses stale `.js` ext — fix to `.ts` while here.                                                                                                                                                                                                                                                                                                                 |
| `AGENTS.md`                                                   | "Intent-level steps convention" paragraph                                                      | Remove `$SOURCE_CHANNELS` mention; document the plain-name + runtime-resolve convention.                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**Tests to flip** (#2): `tests/unit/gateway/services/tenant-env-loader.test.ts` (201–230, 249), `tests/integration/multi-tenancy.test.ts` (293), `tests/unit/gateway/services/archetype-generator-prompts.test.ts` (31–33, 118–122, 481), `tests/unit/golden-prompts.test.ts` (54). **Golden fixtures to regenerate**: `tests/fixtures/golden/{system-prompt,refine-prompt,compiled-agents-md}.txt` via `GENERATE_GOLDEN=true pnpm test:unit`.

### #3 — Zombie-to-Failed + graceful failure

| File                                                 | Lines                                                       | Change                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/inngest/lifecycle/steps/reviewing-path.ts`      | 226–232 (zombie early-return in `trackPendingApprovalStep`) | Replace `return` with Failed routing: `patchTask({status:'Failed', failure_reason})` + `logStatusTransition` + update notify msg to ❌ via `loadTenantSlack` + `slackClient.updateMessage(...)` + skip `wait-for-approval`. |
| `src/inngest/lifecycle/steps/validate-and-submit.ts` | 66–128 (routing gate)                                       | OPTIONAL pre-check: read deliverable classification; if `NO_ACTION_NEEDED`/unparseable AND `approvalRequired=true`, route to Failed BEFORE entering reviewing path.                                                         |
| `src/lib/slack-copy.ts`                              | new function                                                | Add `approvalCardMissingFailureMessage()` — employee-agnostic, plain, empathetic.                                                                                                                                           |
| `src/worker-tools/slack/post-message.ts`             | existing                                                    | (A) graceful "can't complete" post — no new tool needed. Worker calls `post-message --channel "$NOTIFICATION_CHANNEL" --text "..." --thread-ts "$NOTIFY_MSG_TS"` then `submit-output --classification NO_ACTION_NEEDED`.    |

**Canonical Failed+notify pattern to copy**: `src/inngest/lifecycle/steps/execute.ts:144–202` (`mark-failed` step). Uses `notifyBlocks({ state:'Failed', emoji:'❌', extraText: failureReason })` from `src/lib/slack-blocks.ts:122–131`.

**Failure-reason copy (Atlas-chosen, plain/non-technical):**

- Lifecycle (#3): `failure_reason` = `"I finished working but couldn't post the result for your review."` ; notify ❌ text adds the empathetic framing.
- Worker (A): Slack text = `"I wasn't able to finish — I don't have access to one of the channels you asked me to read. Please add me to that channel and try again."`

---

## Waves & Tasks

### Wave 0 — Fold-in pre-work (#4) — sequential, first

- [x] 0. Stage and commit the already-verified `submit-output` env-var doc fix (`src/lib/tool-registry.ts`, the two regenerated skill files, `tests/unit/env-enforcement.test.ts`). Commit msg: `fix(tools): correct submit-output env-var docs (no env vars required)`. Verify `git status` clean of unrelated Composio churn first.

### Wave 1 — #3 Silent-zombie fix + graceful failure (smaller, isolated)

- [x] 1. RED test — zombie→Failed. New test asserting: when `trackPendingApprovalStep` runs with deliverable metadata missing `approval_message_ts`/`target_channel` and `approval_required=true`, the task transitions `Reviewing → Failed` with populated `failure_reason`, NO `pending_approvals` row, and `wait-for-approval` is NOT entered. Ref pattern: `execute.ts:144–202`.
- [x] 2. Implement zombie→Failed in `reviewing-path.ts:226–232`. Replace early-return with Failed routing + notify ❌ flip + Slack explanation post. Use new `slack-copy.ts` constant. Keep employee-agnostic (shared file rule).
- [x] 3. RED+impl — worker graceful "can't complete" (A). Verify `post-message.ts` supports the plain-text post to `$NOTIFICATION_CHANNEL`; add `slack-copy`/skill guidance so an employee lacking channel access posts the message then submits `NO_ACTION_NEEDED`. (Worker-tool path is bind-mounted — no rebuild for tool change locally; skill/prompt change needs regen.)
- [x] 4. Regression — legitimate approval path intact: valid `NEEDS_APPROVAL` → card posted → `pending_approvals` row → `wait-for-approval`. Existing tests must stay green.
- [x] 5. `pnpm test:unit` green; lint clean; build clean.

### Wave 2 — #2 Channel-names redesign

- [x] 6. RED test — `read-channels.ts` resolves names → IDs by SHAPE, `#` optional. Assert all of: `--channels "#general"`, `--channels "general"`, `--channels "general,C123"`, `--channels "#general,ops"` resolve names via `conversations.list` and pass IDs to history fetch; an entry matching `^[CGD][A-Z0-9]+$` is used as-is (no resolve); unknown name → graceful warning (not crash). Include a test proving a NO-`#` name resolves identically to the `#`-prefixed form.
- [x] 7. Implement name→ID resolution in `read-channels.ts` (parseArgs + main). Per entry: if it matches the channel-ID shape (`^[CGD][A-Z0-9]+$`) use directly; else strip an OPTIONAL leading `#` and resolve via one `conversations.list` call (cache the name→ID map). No fuzzy matching — exact case-insensitive name match only.
- [x] 8. Remove SOURCE_CHANNELS injection: `tenant-env-loader.ts:73–83`, `admin-brain-preview.ts:208–218`, `schemas.ts:242`. Update/flip the SOURCE_CHANNELS unit + integration tests.
- [x] 9. Update archetype-generator prompts (3 locations: 118–130, 295, 338) — plain channel names instead of `$SOURCE_CHANNELS`. Flip `archetype-generator-prompts.test.ts` assertions (31–33, 118–122, 481) + `golden-prompts.test.ts:54`.
- [x] 10. Migrate seed.ts — both tenant configs (remove `source_channels`), both SUMMARIZER_INSTRUCTIONS (`--channels "#general"` etc.), fix stale `.js`→`.ts` in summarizer tool_registry.
- [x] 11. Regenerate golden fixtures (`GENERATE_GOLDEN=true pnpm test:unit`) + tool/skill regen (`pnpm generate-tool-usage-skill`; `pnpm generate-skills` then revert unrelated Composio churn).
- [x] 12. Update AGENTS.md — intent-level steps convention + channel plumbing docs (remove `$SOURCE_CHANNELS`).
- [x] 13. `pnpm test:unit` + dashboard tests + build + lint all green.

### Wave 3 — Live E2E Validation (MANDATORY)

- [x] 14. E2E prerequisites: gateway (`curl localhost:7700/health`), Inngest (`curl localhost:8288/health`), Socket Mode (`grep "Socket Mode connected" /tmp/ai-dev.log`), single-gateway preflight.
- [x] 15. Live E2E #2 — happy path: create/configure a summarizer with plain channel names (bot IS a member) on `deepseek/deepseek-v4-flash` → trigger → verify channel resolution + real summary → `Done`. Capture task ID + `task_status_log`. Evidence → `.sisyphus/evidence/final-qa/`.
- [x] 16. Live E2E #2 — no-access path (A): name a channel the bot is NOT in → verify the employee posts the graceful "I don't have access" Slack message and exits cleanly (no zombie). Capture task ID + trace.
- [x] 17. Live E2E #3 — zombie→Failed: force degraded output with `approval_required=true` → verify task reaches `Failed` with visible reason + ❌ notify flip + Slack explanation (NOT stuck Reviewing). Capture task ID + trace.
- [x] 18. Outcome summary: all task IDs, status_log traces, deviations → notepad.

### Wave FINAL — F1–F4 Review Wave (user-requested, all 4 parallel, ALL must APPROVE)

- [x] F1. Plan Compliance Audit — `oracle` — every Must Have present, every Must NOT Have grepped absent, evidence files exist.
- [x] F2. Code Quality Review — `unspecified-high` — build + lint + test:unit + dashboard tests; no `as any`/`@ts-ignore`/empty catch/console.log; no unrelated Composio churn committed.
- [x] F3. Real Manual QA — `unspecified-high` (+ `e2e-testing`, `employee-creation-debugging`) — re-run all 3 E2E scenarios from clean state; evidence to `.sisyphus/evidence/final-qa/`.
- [x] F4. Scope Fidelity + Boundary Audit — `deep` — each task 1:1 with spec; NOTIFICATION_CHANNEL/PUBLISH_CHANNEL untouched; `isToolAllowed`/`postProcess` untouched; no fuzzy channel matching; legitimate approval path intact.
- [x] Present consolidated F1–F4 results → wait for explicit user okay.

### Wave 5 — Completion

- [x] 19. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

---

## Final Checklist (do not check until user okay)

- [x] #3 zombie path routes to Failed with visible reason + ❌ notify + Slack explanation; legitimate approval path intact
- [x] (A) worker posts graceful "no channel access" message and exits cleanly
- [x] #2 plain channel names work end-to-end; no channel IDs / env vars exposed to users
- [x] SOURCE_CHANNELS fully removed (env-loader, brain-preview, schema, prompts, seed, AGENTS.md)
- [x] NOTIFICATION_CHANNEL + PUBLISH_CHANNEL untouched
- [x] All tests green; lint clean; build clean; golden fixtures regenerated
- [x] Live E2E for #2 (happy + no-access) and #3 reached expected terminal states
- [x] AGENTS.md + skills updated; no unrelated Composio churn committed
- [x] F1–F4 review wave all APPROVE
