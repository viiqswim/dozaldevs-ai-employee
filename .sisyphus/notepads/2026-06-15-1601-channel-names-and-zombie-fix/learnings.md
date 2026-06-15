# Learnings — channel-names-and-zombie-fix

## 2026-06-15 Session Init

### Pre-work state

- 4 files modified (uncommitted): `src/lib/tool-registry.ts`, `src/workers/skills/platform/actions/submit-output.md`, `src/workers/skills/tool-usage-reference/SKILL.md`, `tests/unit/env-enforcement.test.ts`
- Plan file untracked: `.sisyphus/plans/2026-06-15-1601-channel-names-and-zombie-fix.md`
- 2067 tests pass with pre-work changes

### Key conventions

- `#` prefix on channel names is OPTIONAL — shape-based detection: `^[CGD][A-Z0-9]+$` = ID, else = name
- `general` and `#general` must behave identically
- NOTIFICATION_CHANNEL and PUBLISH_CHANNEL are UNTOUCHED — only SOURCE_CHANNELS is removed
- Zombie fix: `reviewing-path.ts:226–232` — replace early-return with Failed routing
- Canonical Failed+notify pattern: `src/inngest/lifecycle/steps/execute.ts:144–202`
- Failure copy: `"I finished working but couldn't post the result for your review."`
- Worker graceful copy: `"I wasn't able to finish — I don't have access to one of the channels you asked me to read. Please add me to that channel and try again."`
- Golden fixtures regenerated via: `GENERATE_GOLDEN=true pnpm test:unit`
- Tool/skill regen: `pnpm generate-tool-usage-skill` then `pnpm generate-skills` (revert unrelated Composio churn)
- Commit messages must NOT reference AI/claude/opencode

## 2026-06-15 Task: Zombie→Failed fix

### Implementation approach
- `trackPendingApprovalStep` return type changed from `Promise<void>` to `Promise<{ routedToFailed: boolean }>`
- Two early-return sites in the function needed updating: nudge-skipping path (`return { routedToFailed: false }`) and end-of-function (`return { routedToFailed: false }`)
- `runReviewingPath` checks `trackResult?.routedToFailed` and returns early to skip `wait-for-approval`
- `approvalCardMissingFailureMessage()` added to `src/lib/slack-copy.ts`
- failure_reason stored in task: `"I finished working but couldn't post the result for your review."`
- Slack ❌ text: `"❌ I finished working but couldn't post the result for your review. Please try again."`
- Notify message updated to ❌ via `loadTenantSlack` + `slackCtx.slackClient.updateMessage`
- Zombie path skips: `wait-for-approval`, `handle-approval-result`, `record-work-metric-approval`, `cleanup` — machine cleanup is skipped but acceptable for zombie case

### Test pattern used
- `buildZombieFetch(missingField)` helper inside the `describe` block creates fetch mock with no `approval_message_ts` or `target_channel`
- Asserted: `mockPatchTask` called with `{ status: 'Failed', failure_reason }`, `mockLogStatusTransition` called with `'Failed', 'Reviewing'`, `mockTrackPendingApproval` NOT called, `step.waitForEvent` NOT called
- For Slack assertion: captured `mockUpdateMessage` by overriding `mockLoadTenantSlack` in that test, checked `call[2].includes('❌')`
- 4 RED tests confirmed before implementing, then GREEN after

## 2026-06-15 Task 3: Worker graceful failure guidance

- Added warning section to tool-usage-reference SKILL.md (hand-written area)
- post-message.ts already supports --channel and --text — no tool changes needed
- Graceful path: read-channels fails → post to $NOTIFICATION_CHANNEL → submit NO_ACTION_NEEDED
- The SKILL.md hand-written section is below the <!-- HAND-WRITTEN: DO NOT GENERATE BELOW --> sentinel
- Do NOT run pnpm generate-tool-usage-skill — that would overwrite the generated section but preserve hand-written
- Warning numbered as ### 6. (warnings 1-5 already existed)

## 2026-06-15 Tasks 6+7: read-channels name→ID resolution

### Implementation
- Shape detection: ^[CGD][A-Z0-9]+ = ID (pass through), else = name (resolve)
- resolveChannelNames() calls conversations.list once, caches result
- Case-insensitive exact match on channel.name after stripping optional #
- Unknown name → stderr warning + skip (graceful, not crash)
- Descriptor --channels description updated to mention names accepted
- Test file: tests/unit/worker-tools/slack/read-channels.test.ts

## 2026-06-15 Tasks 8-10: SOURCE_CHANNELS removal

### Files changed
- tenant-env-loader.ts: SOURCE_CHANNELS block deleted (lines 73-83 of original); kept legacyNotifConfig for PUBLISH_CHANNEL
- admin-brain-preview.ts: SOURCE_CHANNELS catalog entry deleted from TENANT_CONFIG_VARS
- schemas.ts: source_channels field removed from TenantConfigBodySchema
- archetype-generator-prompts.ts: 3 locations updated to plain-channel-names guidance (SYSTEM_PROMPT_PRE, REFINE_SYSTEM_PROMPT_PRE, buildConverseSystemPromptPre)
- prisma/seed.ts: source_channels removed from both tenant configs, SUMMARIZER_INSTRUCTIONS rewritten to use explicit channel IDs, .js→.ts fixed + submit-output.ts added

### Test changes
- tenant-env-loader.test.ts: 'injects SOURCE_CHANNELS' flipped to assert not injected; PLATFORM_ENV_MANIFEST test updated to not check SOURCE_CHANNELS
- multi-tenancy.test.ts: SOURCE_CHANNELS assertion flipped to toBeUndefined()
- archetype-generator-prompts.test.ts: $SOURCE_CHANNELS presence assertions flipped to absence assertions
- schemas.test.ts: source_channels rejection test flipped (Zod strips unknown fields → succeeds now)
- golden-prompts.test.ts: system-prompt and refine-prompt golden tests skipped (.skip) — stale after prompt changes; regenerate with GENERATE_GOLDEN=true in Task 11

### Gotchas
- The prompts in archetype-generator-prompts.ts said "do NOT use $SOURCE_CHANNELS" — the literal string $SOURCE_CHANNELS was still present and failing the toContain test. Solution: rephrase to "never use a placeholder env var for source channels" without mentioning the literal env var name.
- schemas.test.ts had a separate test (not in the task spec) that needed flipping: 'rejects non-array source_channels' — Zod strips unknown fields so any value passes after field removal.
- legacyNotifConfig was shared between SOURCE_CHANNELS block and PUBLISH_CHANNEL — preserved it for PUBLISH_CHANNEL when removing SOURCE_CHANNELS block.

## 2026-06-15 Task 11: Golden fixtures + skill regen

- GENERATE_GOLDEN=true pnpm test:unit regenerates tests/fixtures/golden/*.txt
- pnpm generate-tool-usage-skill updates the generated section of tool-usage-reference/SKILL.md
- pnpm generate-skills regenerates all per-service skills — revert composio-* churn after
- git checkout -- src/workers/skills/composio-*/ reverts Composio churn
- After regen, remove .skip from golden-prompts.test.ts and verify tests pass
- IMPORTANT: Must remove .skip BEFORE running GENERATE_GOLDEN=true so all 3 golden tests regenerate their fixtures
- The skipped tests (system-prompt, refine-prompt) won't write fixtures while skipped — un-skip first
- 175 test files pass, 2079 tests pass, 9 skipped (pre-existing container-boot skips only)
- build exits 0 cleanly

## [2026-06-15 17:40] E2E Scenario A — Happy Path PASS

**Task ID**: 8c7c825c-cc87-4e09-90a8-c3b3d5136d98
**Result**: Reviewing (approval card posted, pending_approvals row created, slack_ts=1781562469.256159)
**State trace**: Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Reviewing
**Time to Reviewing**: ~75 seconds

### Key Finding: Plain channel names work end-to-end
- "victor-tests" → resolved to C0AUBMXKVNU via conversations.list → messages read successfully
- "project-lighthouse" → resolved to C092BJ04HUG → bot not a member → empty messages + warning logged (graceful)
- Task produced valid NEEDS_APPROVAL deliverable with full executive summary
- Worker produces a meaningful summary even when one of two channels is inaccessible

### Key Finding: DozalDevs Slack token IS valid
- The encrypted tenant_secrets.slack_bot_token for DozalDevs works correctly
- Bot is a member of victor-tests (C0AUBMXKVNU) 
- Bot is NOT a member of project-lighthouse (C092BJ04HUG) — graceful empty result

---

## [2026-06-15 17:40] E2E Scenario B — No-Access Path PASS

**Task ID**: c7a06f8f-46a9-47ea-aad1-1f26d22f2d0e  
**Result**: Submitting (override-card wait — NOT a zombie, will auto-resolve to Done in 24h)
**Deliverable**: {"classification":"NO_ACTION_NEEDED","summary":"No channel access"}

### Key Finding: Override-card path is the graceful path for NO_ACTION_NEEDED + approval_required=true
- When the worker produces NO_ACTION_NEEDED and approval_required=true, the lifecycle does NOT go to Reviewing
- Instead it goes to the override-card path (Submitting state while waiting for PM decision)
- This is CORRECT behavior — PM gets a card saying "Bot thinks no action needed, confirm or override"
- Task auto-resolves to Done after timeout (not a zombie)
- The zombie fix (→Failed) only triggers when classification=NEEDS_APPROVAL but card metadata is missing

### Key Finding: Non-existent channel name gracefully skipped
- "restricted-internal-finance-2099" not found in conversations.list → warning logged → skipped
- Worker gets 0 messages, decides NO_ACTION_NEEDED
- No crash, no error exit code, clean task completion

---

## [2026-06-15 17:40] E2E Scenario C — Zombie→Failed PASS

**Task ID**: fea62aaf-7478-4406-ba1d-3982089783d3
**Result**: Failed (immediately, not after 30-min watchdog timeout)
**failure_reason**: "I finished working but couldn't post the result for your review."
**Time from trigger to Failed**: ~76 seconds
**Reviewing→Failed dwell time**: 14ms (immediate detection!)

### Key Finding: Zombie fix is fast and precise
- State trace: ...→Submitting→Reviewing→Failed (14ms in Reviewing)
- Zero pending_approvals rows (no stale card tracked)
- Deliverable metadata = {} (harness failed to post card to invalid channel C0000000000)
- failure_reason is human-readable for end users
- lifecycle_fn (not reviewing-watchdog) caught it immediately — no 30-min wait

### Trigger mechanism confirmed
- harness-helpers.mts: postApprovalCard fails → catches error → returns {} 
- deliverable metadata written without approval_message_ts/target_channel
- reviewing-path.ts trackPendingApprovalStep: missing metadata → routes to Failed immediately
- Slack notification updated to ❌

### Archetype restored
- After Scenario C, execution_steps and notification_channel restored to original values
