# Learnings — mandatory-delivery-phase-all-employees

## [2026-06-16] Inherited from enforce-execution-delivery-phases plan

### Key Architecture Facts (from prior plan)

- `delivery_instructions` column DROPPED in prior plan migration — do NOT reference it anywhere
- `delivery_steps` is the SOLE canonical delivery field
- `src/lib/delivery-resolver.ts` is the shared resolver — used by all 3 lifecycle gates
- Hard gate at POST/PATCH rejects `deliverable_type` set + empty `delivery_steps` (but NOT null/null — that's the loophole this plan closes)
- `DEFAULT_DELIVERY_INSTRUCTIONS` in `src/lib/output-contract-constants.ts` — use for defaults
- `ERROR_CODES.MISSING_DELIVERY_CONFIG` already added to `src/gateway/lib/prisma-helpers.ts`
- PATCH gate is CONDITIONAL — only fires when patch touches a delivery field (deliverable_type or delivery_steps)
- `pnpm test -- --run` drops to watch mode — use `CI=true pnpm exec vitest run` for one-shot
- Integration tests: `pnpm exec vitest run --config vitest.integration.config.ts <file>`
- `cleanupGateArchetypes()` in integration tests keys on `role_name startsWith 'gate-test-'`
- Must delete archetypeEditHistory children FIRST before deleting archetypes (FK onDelete:Restrict)

### Escape Hatch Employees (THIS PLAN'S TARGETS)

- `cleaning-schedule` (VLRE tenant `00000000-0000-0000-0000-000000000003`): deliverable_type=slack_message, delivery_steps=NULL, approval_required=false. Posts to Slack WITHIN execution.
- `daily-motivation` (DozalDevs tenant `00000000-0000-0000-0000-000000000002`): deliverable_type=slack_message, delivery_steps=NULL, approval_required=false. Has "Do NOT read or follow <delivery-instructions>" guard that MUST be removed.

### --draft-file Handoff Convention

- Execution writes deliverable to a draft file, calls `tsx /tools/platform/submit-output.ts --draft-file <path> --summary "..."`
- Delivery container receives content in `<approved-content>` XML block
- Retrofitted execution_steps must NOT call `post-message` directly

### Approval Mechanism (no REST endpoint)

- Approval = Slack button → Inngest event `employee/approval.received`
- Manual E2E fallback: `curl -X POST localhost:8288/e/local -d '{"name":"employee/approval.received","data":{"taskId":"...","action":"approve","userId":"...","userName":"..."}}'`

### Generator postProcess() (archetype-generator.ts)

- After prior plan: derives default delivery_steps ONLY when deliverable_type is set
- This plan: must derive default REGARDLESS of deliverable_type (close null/null loophole)
- Location: ~L362-366 in archetype-generator.ts

### Generator Prompt (archetype-generator-prompts.ts)

- L281: "Set to null ONLY when deliverable_type is also null (pure utility employees)" — MUST REMOVE
- L208-223: delivery templates (Template A: Slack, Template B: external)
- After this plan: must add "What Goes Where" boundary section (definitions + one annotated contrast + anti-pattern rule)

### Gate Locations

- POST: admin-archetypes.ts ~L197-201
- PATCH: admin-archetypes.ts ~L393-397
- CREATE path: admin-archetype-converse-create.ts ~L79

### Golden Fixture

- Regenerate after prompt text change: `GENERATE_GOLDEN=true pnpm exec vitest run tests/unit/golden-prompts.test.ts`
- Then commit the fixture

### Test Patterns

- Unit tests at root tests/unit/ use `../../src/...` (2 levels) import depth
- Nested tests/unit/gateway/services/ use `../../../../src/...` (4 levels)
- `makeRoutingLLM` mock pattern from archetype-generator-golden.test.ts
- DESCRIPTION must NOT match isCodeWritingEmployee() CODE_PHRASE_PATTERNS

### DB Connection

- `postgresql://postgres:postgres@localhost:54322/ai_employee`
- Test DB: `ai_employee_test`

### Existing Test Files (must stay green)

- `tests/unit/archetype-generator-delivery.test.ts` — prior plan's generator-default tests
- `tests/integration/archetypes-delivery-gate.test.ts` — prior plan's 4 gate tests
- `tests/unit/golden-prompts.test.ts` — golden fixture (regenerate after prompt change)

## [2026-06-16] Task 1 — cleaning-schedule retrofit (COMPLETE)

### Confirmed lifecycle facts (verified from code, not assumed)

- `resolveDelivery()` rule 1 (src/lib/delivery-resolver.ts:38): non-empty `delivery_steps`
  → `has-delivery` REGARDLESS of classification. So an approval-free employee with
  NO_ACTION_NEEDED + non-empty delivery_steps STILL spawns the delivery container.
  This is exactly how the escape-hatch loophole gets closed: once delivery_steps is
  set, posting moves out of execution into delivery automatically.
- Route: validate-and-submit.ts:66 `if (!approvalRequired) runNoApprovalPath(...)`.
- Draft handoff chain: submit-output.ts --draft-file → reads file → `draft` field in
  /tmp/summary.txt JSON → deliverables.content (execution-phase.mts:369) →
  `<approved-content>` in delivery prompt (delivery-phase.mts:95).
- $NOTIFICATION_CHANNEL is injected by tenant-env-loader.ts:70 from
  archetype.notification_channel (C0B71QSMZKQ for cleaning-schedule) and spread into
  the delivery container via delivery-retry.ts (tenantEnvForDelivery). So delivery_steps
  can safely reference "$NOTIFICATION_CHANNEL".
- Delivery confirmation (delivery-phase.mts:243): summary.txt must have delivered:true
  OR a non-empty summary field. submit-output --summary satisfies this.

### Reference employee for approval-free Slack split

- `jira-motivation-bot` (VLRE, seed.ts ~3428): approval_required:false + slack_message +
  non-empty delivery_steps + execution ends with submit-output --classification NO_ACTION_NEEDED.
  Best analog for cleaning-schedule. (daily-summarizer is approval_required:TRUE — uses
  NEEDS_APPROVAL + --draft, different path.)

### Gotchas hit this task

- The execution-phase guard prose "Do NOT call any Slack post-message tool" literally
  contained the substring `post-message` → would FALSE-positive the verification
  `execution_steps LIKE '%post-message%'`. Reworded to "Do NOT publish to Slack". Watch
  this in T2 (daily-motivation) — avoid the literal substring `post-message` anywhere in
  execution_steps prose.
- `.env` line ~96 (GITHUB_PRIVATE_KEY with literal \n) breaks `source .env` in zsh
  (`parse error near \n`). Read SERVICE_TOKEN directly via grep `^SERVICE_TOKEN=` instead.
  Value: hardcode-read from .env line 20.
- PATCH with huge multi-line content: build payload via a Node script
  (JSON.stringify handles all escaping) writing to /tmp/cs-patch.json, then
  `curl --data-binary @/tmp/cs-patch.json`. Add in-script assertions (post-message
  gone, --draft-file present) BEFORE writing the payload — fail fast.
- `tsc --noEmit prisma/seed.ts` on a single file errors on `import.meta` (TS1343) —
  that's a module-config artifact, NOT a real error. Use
  `ts.transpileModule(src,{module:'esnext'})` to check for genuine syntax diagnostics.
- CAUTION: `tsx --eval "import('./prisma/seed.ts')"` actually RUNS the seed (top-level
  await executes). It's idempotent upserts so harmless, but re-verify DB state after.
  Prefer transpileModule for a pure syntax check that does NOT execute.

### Verification result (all 7 checks pass)

deliverable_type=slack_message | delivery_nonempty=t | exec_has_submit_output=t |
exec_has_draft_file=t | exec_has_post_message=f | delivery_has_post_message=t |
delivery_uses_notif_channel=t. delivery_steps len=953.

## [2026-06-16] Task 7 — RED test for null/null loophole (COMPLETE)

### What was added

- 5th test case `(e)` in `tests/integration/archetypes-delivery-gate.test.ts`
- POSTs `deliverable_type: null` + `delivery_steps: ''` → asserts 400 `MISSING_DELIVERY_CONFIG`
- This is the inverse of existing test `(b)` which asserts the same input returns 201
  (the escape-hatch). Test (b) and (e) are mutually exclusive — Task 9's GREEN fix must
  flip (b) too, or (b) will start failing. NOTE FOR T9: when closing the loophole,
  test (b) at L77-99 MUST be updated/removed since it codifies the OLD escape-hatch behavior.

### RED proof

- On current code: resolveDelivery() returns `no-delivery-escape-hatch` for null/null
  (delivery-resolver.ts:48 `deliverable_type != null` is false → falls through to rule 4).
  POST handler only rejects `misconfigured`, so null/null → 201. New test (e) expects 400
  → FAILS today (genuine RED).
- Role-name prefix `gate-test-null-null-reject` matches cleanupGateArchetypes prefix.

## [2026-06-16] Task 6 — RED test for null/null GENERATOR loophole (COMPLETE)

### What the existing test file already contained (key discovery)

- `tests/unit/archetype-generator-delivery.test.ts` already had cases (a)(b)(c).
- Case (b) ALREADY drives the EXACT null/null input (deliverable_type:null +
  delivery_steps:null) but asserts the LEGACY behavior `expect(delivery_steps).toBeNull()`.
  On current code (b) PASSES (escape hatch still open). My new case (d) drives the SAME
  null/null input but asserts the NEW invariant (non-empty string) → FAILS today.
- File header comment (lines 1-2) claimed (a)+(c) are RED, but the prior plan already
  shipped the deliverable_type-set default in postProcess() — so (a)(b)(c) ALL pass now.
  Only my new (d) is genuinely RED. Header comment is stale; left untouched (not my scope).

### Task 8 reconciliation note (for whoever does GREEN — mirrors T7's note on test b)

- When Task 8 closes the loophole, UNIT case (b)'s `toBeNull()` assertion WILL BREAK (it
  expects the legacy null passthrough). Task 8 MUST update case (b) to the new invariant
  (or delete it as superseded by (d)). Plan's Task 8 "update older tests that encoded the
  now-removed null-passthrough behavior" covers this. My (d) inline comment flags it.
  (Symmetric with T7's integration test (b) at L77-99 that T9 must flip.)

### RED proof (genuine, exit 1)

- Failure: `expected 'object' to be 'string'` — typeof null === 'object'. delivery_steps
  came back null on current code = generator loophole confirmed. 3 prior tests (a)(b)(c)
  stay green (didn't break prior plan).
- Genuine exit captured via redirect: `CI=true pnpm exec vitest run <file> > /tmp/f 2>&1;
echo "EXIT:$?" >> /tmp/f`. `| tee` would mask it (PIPESTATUS gotcha from learnings).
- Evidence: .sisyphus/evidence/.../task-6-red.txt (EXIT:1).

## [2026-06-16] Task 2 — daily-motivation retrofit (COMPLETE)

### BIG SURPRISE: daily-motivation is WIZARD-CREATED, NOT in seed.ts

- UUID is `a360b2e6-7dcc-410d-a17b-8d51e21c74ed` (random wizard UUID, NOT seed-style
  `00000000-...`). `grep "daily-motivation" prisma/seed.ts` returns ZERO matches.
- Task premise ("update create + update blocks") assumed it was seeded. It was NOT.
- RESOLUTION: ADDED a brand-new upsert block to seed.ts (after the DozalDevs summarizer,
  ~L3172) using the real wizard UUID so a future `db seed` upserts the SAME row. create
  has tenant_id, update omits it (immutable rule). Outcome "seed.ts create+update blocks
  have non-empty delivery_steps" is satisfied by the new block.

### Schema is the NEWER variant (identity/execution_steps/delivery_steps)

- archetypes table has NO `system_prompt`, NO `instructions`, NO `delivery_instructions`
  columns. Fields: identity, execution_steps, delivery_steps, execution_instructions,
  deliverable_type, enforce_tool_registry. (Confirmed via `\d archetypes`.)
- `execution_steps` and `execution_instructions` were IDENTICAL in the bad DB row (both
  held post-message + ignore-guard). BUT only `execution_steps` matters:
  - execution_steps → compiled into /app/AGENTS.md `<execution-instructions>` block
    (execution-phase.mts:254 → compileAgentsMd). ALL 7 verification checks target this.
  - execution_instructions → NOT consumed by harness. The harness injects the platform
    constant `EXECUTION_PROMPT` as the initial message (execution-phase.mts:133-135),
    NOT execution_instructions. So the prescribed 2-field PATCH (execution_steps +
    delivery_steps) is correct & sufficient. PATCH route maps body.instructions →
    execution_instructions (admin-archetypes.ts:457) but we don't send `instructions`,
    so execution_instructions keeps stale content harmlessly (not checked, not consumed).

### Compiler ALREADY owns the exec/delivery guard — embedded guard is redundant AND wrong

- agents-md-compiler.mts:199-203 injects its OWN platform `EXEC_IMPORTANT`
  ("Do NOT read or follow <delivery-instructions> ... STOP after the final step") and
  `stripEmbeddedStopDirectives()` (L218) removes archetype-embedded `**STOP`/`**IMPORTANT:..STOP`
  lines. So the archetype's "STOP after step 3" guard was both wrong (3 steps no longer
  the boundary) AND redundant. Removing it from execution_steps is strictly correct.

### $NOTIFICATION_CHANNEL resolves even with archetype.notification_channel = NULL

- notification-channel.ts:5 early-returns '' when archetype.notification_channel === null.
- BUT tenant-env-loader.ts:66 passes `archetypeNotificationChannel ?? undefined` — converts
  null→undefined BEFORE the resolver, bypassing the early-return. So it falls through to
  tenant.config.notification_channel = `C0AUBMXKVNU` (DozalDevs). Delivery WILL post.
  Did NOT need to set archetype.notification_channel. (Subtle null-vs-undefined behavior.)

### Repeatable mechanics that worked

- SERVICE_TOKEN via `grep -E "^SERVICE_TOKEN=" .env` (learnings: `source .env` breaks in
  zsh on the GITHUB_PRIVATE_KEY \n line).
- PATCH via Node script (.sisyphus/tmp-\*.mjs): JSON.stringify handles all escaping; put
  fail-fast assertions (no post-message, has --draft-file, etc.) BEFORE the fetch. Deleted
  the temp script after use.
- seed.ts syntax check WITHOUT executing it: `ts.transpileModule(src,{module:'esnext'})`
  filtering code 1343 (import.meta artifact). LSP TS server was unavailable
  (no typescript-language-server version set) so transpileModule was the fallback.

### Verification result (all 7 checks pass)

deliverable_type=slack_message | delivery_nonempty=t | exec_has_submit_output=t |
exec_has_draft_file=t | exec_has_post_message=f | exec_has_ignore_guard=f |
delivery_has_post_message=t | delivery_uses_notif_channel=t. delivery_steps len=877.

## [2026-06-16] Task 8 — GREEN: generator always emits non-empty delivery_steps (COMPLETE)

### The fix (3 code sites, same logic)

- postProcess() (archetype-generator.ts ~L362): two-stage now. (1) malformed non-string →
  null; (2) if null OR blank → ALWAYS DEFAULT_DELIVERY_INSTRUCTIONS, regardless of
  deliverable_type. The `.trim().length === 0` check matters — a model could emit "" not
  just null.
- applyCreateAllowlist() (admin-archetype-converse-create.ts ~L78): `raw.delivery_steps ===
null || raw.delivery_steps.trim().length === 0 ? DEFAULT : raw.delivery_steps`. Mirror of
  postProcess.
- Prompt (archetype-generator-prompts.ts): removed BOTH null carve-outs (SYSTEM_PROMPT_POST
  L281 AND the SYSTEM_PROMPT_PRE "Set to null ONLY if approval_required is false..." line).
  Added "## What Goes Where" section (defs + 1 contrast + anti-pattern).

### CRITICAL gotcha — converse-create baseline comparison must use strippedBaseline

- The empty-baseline `no_change` test (admin-archetype-converse-create.test.ts L278) sends a
  proposal identical to the empty baseline (identity:'', delivery_steps:null, etc.) and
  expects {kind:no_change}.
- The route's response.baseline runs through applyCreateAllowlist (so its delivery_steps
  becomes the DEFAULT), but the changed_fields loop compared against the RAW baseline
  (delivery_steps:null). After my fix, proposal.delivery_steps also becomes DEFAULT →
  mismatch with raw null → delivery_steps falsely flagged "changed" → test would BREAK.
- FIX: hoist `const strippedBaseline = applyCreateAllowlist(baseline)` once; use it in BOTH
  the changed_fields comparison loop AND response.baseline. Now baseline+proposal derive the
  same default → no false diff. Test stays green. This is the non-obvious coupling of T8.

### Case (b) deletion (not just update)

- Plan said "update OR delete (b)". Chose DELETE: case (b) and case (d) drive the IDENTICAL
  null/null input. (b) asserted toBeNull (legacy), (d) asserts non-empty (new). Keeping both
  = contradictory tests on same input. (d) supersedes (b) verbatim. Also fixed the stale
  file-header RED notice (claimed a/c fail — they pass) and (d)'s inline ref to deleted (b).

### EDIT path deliberately untouched

- archetype-edit-helpers.test.ts L108 `delivery_steps toBeNull` is CORRECT and stays:
  mapArchetypeRowToConfig faithfully reads an existing DB row (EDIT path). The abstraction
  is GENERATE + converse-create CREATE branch ONLY. Did not touch refine()/propose-edit.

### Verification

- Affected suite: 80 passed (delivery + prompts + converse-create + golden).
- Broader archetype suite: 52 passed (propose-edit + edit-helpers + enforce-gate +
  patch-identity). pnpm build EXIT_CODE:0.
- Golden fixture (system-prompt.txt) regenerated — prompt text changed so this is mandatory,
  else golden-prompts.test.ts byte-compare fails on next run.
