# Learnings — ai-agent-skills

## SKILL.md Format (confirmed from v-mermaid)

```markdown
---
name: skill-name # ^[a-z0-9]+(-[a-z0-9]+)*$ (1-64 chars)
description: Description # 1-1024 chars; THIS IS THE TRIGGER SIGNAL
---

# Skill Title

... content ...
```

- `name` field MUST match the directory name exactly
- `description` field is what the agent sees to decide whether to load the skill
- Content after frontmatter is injected as `<skill_content>` XML when agent calls `skill(name="...")`

## OpenCode Skill Discovery (v1.14.31)

- `.opencode/skills/*/SKILL.md` → priority 5 (project-level, from cwd)
- `src/workers/skills/` → baked into Docker image → COPY to `/app/.opencode/skills/`
- OpenCode discovers from `/app/.opencode/skills/` when cwd is `/app` in container
- No plugin required — native discovery
- Permission `"*": "allow"` (already in worker config) covers skill permission type

## Worker Injection Pipeline

- `archetype.system_prompt` + EMPLOYEE_RULES + EMPLOYEE_KNOWLEDGE → system_prompt string
- `archetype.instructions` → task prompt
- `archetype.agents_md` → 3rd level of AGENTS.md (currently all identical to platform AGENTS.md)
- Skills are SEPARATE from agents_md — they use native OpenCode discovery, not injection

## Key Files

- Harness: `src/workers/opencode-harness.mts` — `writeOpencodeAuth()` lines 141-171
- Worker config: `src/workers/config/opencode.json` — permission + autoupdate:false
- Resolver: `src/workers/lib/agents-md-resolver.mts` — 23-line file

## [Thu May 14 02:51:02 CDT 2026] Task: T3 — Harness skill logging
- Added skill discovery logging in writeOpencodeAuth()
- Added comment documenting '*': 'allow' covers skill permission
- Checks /app/.opencode/skills/ with readdirSync in try/catch
- Build passes with zero TypeScript errors

## [Thu May 14 02:51:07 CDT 2026] Task: T4 — Dockerfile COPY
- Added COPY src/workers/skills/ /app/.opencode/skills/ after line 79
- Skills will be at /app/.opencode/skills/ in container

## [$(date)] Task: T5 — adding-shell-tools skill
- Skill written with 205 lines (well above 80 minimum)
- Key sections: Quick Reference table, 8-step checklist (file creation, script pattern, mock fixtures, env vars, Docker, AGENTS.md, archetype instructions, testing), Reference Implementations table, Common Mistakes table
- description field: routing signal targets "adding a new shell tool script to src/worker-tools/"
- 13 references to src/worker-tools throughout
- Mock mode check must come BEFORE arg/env validation (critical order)
- Non-secret env vars (mock flags) require explicit whitelist in tenant-env-loader.ts

## [Thu May 14 02:54:42 CDT 2026] Task: T5 — adding-shell-tools skill
- Skill written with 205 lines (well above 80 minimum)
- Key sections: Quick Reference table, 8-step checklist (file creation, script pattern, mock fixtures, env vars, Docker, AGENTS.md, archetype instructions, testing), Reference Implementations table, Common Mistakes table
- description field: routing signal targets "adding a new shell tool script to src/worker-tools/"
- 13 references to src/worker-tools throughout
- Mock mode check must come BEFORE arg/env validation (critical order)
- Non-secret env vars (mock flags) require explicit whitelist in tenant-env-loader.ts

## [Thu May 14 CDT 2026] Task: T6 — debugging-lifecycle SKILL.md

### Lifecycle State Machine (sourced from employee-lifecycle.ts)

- 3 auto-pass states (milliseconds each): Triaging, AwaitingInput, Validating
- Terminal: Done, Failed, Cancelled
- Worker sets status=Submitting via PostgREST when it finishes; lifecycle polls for this (15s × 120 = 30min max)
- poll-completion is what transitions Executing → the path to Validating/Failed

### Key actor values in task_status_log
- `lifecycle_fn` — most transitions
- `opencode_harness` — worker sets Delivering→Done, and Failed on SIGTERM
- `reviewing-watchdog` — zombie cleanup (Reviewing→Failed after 30min)

### Reviewing Watchdog (triggers/reviewing-watchdog.ts)
- Cron: `*/15 * * * *`
- ZOMBIE_THRESHOLD_MINUTES = 30
- Kills tasks in Reviewing with no `pending_approvals` row

### Approval flow wait mechanism
- `step.waitForEvent('wait-for-approval', { event: 'employee/approval.received', match: 'data.taskId', timeout: timeoutHours+'h' })`
- Timeout → Cancelled (not Failed)
- action='reject' or 'superseded' → Cancelled
- action='approve' → Approved → Delivering → Done

### Shortcircuit paths
- Pre-check (guest-messaging only): last host message → Received→Done in <5s
- approval_required=false: Submitting→Done (no Reviewing)
- NO_ACTION_NEEDED classification: Submitting→Done (with override Slack card)

## [Thu May 14 2026] Task: T8 — hostfully-api SKILL.md

- Wrote 397-line SKILL.md at `.opencode/skills/hostfully-api/SKILL.md`
- Key content: UUID disambiguation table (lead_uid vs thread_uid vs property_uid), senderType values, lead types/statuses, response envelope patterns, CLI reference for all 5 tools, webhook payload fields, env vars, safe parsing rules, gotchas table, mock fixtures
- CRITICAL gotcha: `lead_uid ≠ thread_uid` — post-guest-approval.ts takes BOTH separately; emits stderr warning if they are identical
- `get-messages.ts` uses `--lead-id` flag (NOT `--lead-uid`); same with `send-message.ts`
- `post-guest-approval.ts` lives under `/tools/slack/` not `/tools/hostfully/`
- CLOSED leads silently drop webhooks — handled only by polling cron
- `THREAD_UID` and `LEAD_UID` env vars injected by lifecycle from webhook raw_event
- Messages API returns newest-first; tools sort to chronological before output
- `propertyUid` can be null on INQUIRY leads — use `--fallback-property-uid` with webhook's property_uid

## [$(date)] Task: T11 — uuid-disambiguation skill
- Skill written with 201 lines (well above 80 minimum)
- Key sections: UUID Type Map table, full flow diagram (webhook→raw_event→env vars→tool flags), per-tool reference with flags, CRITICAL lead_uid≠thread_uid section, platform vs Hostfully UUID distinction, diagnostic checklist
- description field: triggers on "passing UUIDs to shell tools" or "confused about which UUID to use"
- post-guest-approval.ts is in src/worker-tools/slack/ (NOT hostfully/) — important for future searches
- The "identical" warning is at line 361 of post-guest-approval.ts
- get-messages.ts uses --lead-id (NOT --lead-uid) — documented as known naming inconsistency
- threadUid in get-messages output comes from THREAD_UID env var, not API response
- tenant_id is NOT injected as env var (resolved internally by lifecycle/gateway from agency_uid)
- Env var injection: lifecycle lines 397-402, conditional on raw_event field being non-empty
- Fake example UUIDs used: aaaaaaaa-0000-0000-0000-000000000001 pattern (clearly fake)

## [Thu May 14 2026] Task: T7 — creating-archetypes SKILL.md

- File was a placeholder (8 lines) — replaced fully with 312-line skill
- Used Edit tool (not Write) since file already existed
- Key fields documented from prisma/schema.prisma Archetype model:
  system_prompt, instructions, agents_md, delivery_instructions, model, runtime,
  risk_model, notification_channel, enrichment_adapter, pre_check_adapter, vm_size,
  concurrency_limit, worker_env, tool_registry, trigger_sources, deliverable_type
- Critical model constraint: minimax/minimax-m2.7 (exec) and anthropic/claude-haiku-4-5 (judge only)
- loadTenantEnv() auto-uppercases all tenant_secrets keys → env vars (no whitelist)
- tenant_id is immutable → only in create block of upsert, never in update
- Pre-check adapter: 'hostfully' skips worker spawn if last message already from host
- Evidence: .sisyphus/evidence/task-7-archetype-fields.txt (line count), task-7-checklist.txt (sections)

## [Thu May 14 2026] Task: T9 — e2e-testing SKILL.md

- SKILL.md file was a placeholder (8 lines) — replaced with 385-line substantive content
- Slack UX test guide path: `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` (6 scenarios A-F)
- Feedback Pipeline guide path: `docs/testing/2026-05-12-0202-feedback-pipeline-v2-e2e-test-guide.md` (NOT the 2026-05-11 date in AGENTS.md — use Glob to find correct path)
- VLRE fixed test resources: Thread UID `dc2c8f5e-...`, Lead UID `f83d431f-...` (different from AGENTS.md main section which has an older thread)
- Playwright must use CDP (not headless) due to Airbnb requiring real browser session
- Approval card appears in THREAD REPLY, not channel top-level — click "View thread" to find it
- Pre-check auto-Done in <5s = expected when last Hostfully message was from host
- SYNTHESIS_THRESHOLD = 5 confirmed rules per archetype triggers synthesis event

## [Thu May 14 2026] Task: T10 — tool-usage-reference skill

- Written 878 lines covering all 13 tools across 5 service directories
- post-guest-approval.ts lives in /tools/slack/ not /tools/hostfully/ — verified via Glob
- KEY FACTS verified from source code:
  - post-message.ts: `NODE_NO_WARNINGS=1` required, flags: --channel, --text, --task-id (optional), --title (optional), --blocks (optional), --conversation-ref (optional)
  - read-channels.ts: --channels (comma-sep), --lookback-hours (default 24); filters bot summary posts
  - post-guest-approval.ts: 13 required flags; --lead-uid ≠ --thread-uid (tool warns but doesn't error); idempotency guard on /tmp/approval-message.json
  - get-messages.ts: --lead-id (NOT --lead-uid!); --property-id mutually exclusive; LEAD_UID env var fallback; THREAD_UID env var populates threadUid in output
  - send-message.ts: --lead-id + --message required; --thread-id optional; IRREVERSIBLE
  - get-property.ts: --property-id required; fetches amenities+rules in parallel (non-fatal failures)
  - get-reservations.ts: --property-id required; --status filter: confirmed/cancelled/inquiry/omit
  - sifely-client.ts: 6 actions; HTTP 200 on auth failure — checks body.code; list success OMITS code field
  - generate-code.ts: no required flags; outputs {code, pattern, length, description}
  - update-door-code.ts: exit code 2 if door_code field missing
  - rotate-property-code.ts: requires SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID + Sifely + Hostfully creds
  - knowledge_base/search.ts: --entity-type + --entity-id required; entity_id normalized to lowercase
  - platform/report-issue.ts: Slack failure non-fatal (exit 0); ISSUES_SLACK_CHANNEL optional

## [Thu May 14 2026] Task: T13 — AGENTS.md Skills System section

- Inserted `## Skills System` section at line 121 (after OpenCode Worker section, before Feedback Pipeline)
- Section covers: two-tier model, two-phase loading, employee skills table (2 entries), dev skills table (5 entries), how to add each type
- Kept under ~60 lines as required — concise prose + tables
- Evidence saved to `.sisyphus/evidence/task-13-agents-md.txt`
- The "Adding a new employee" section already had enough context; no additional note needed there since the Skills System section itself explains that employee skills are shared across all archetypes

## Task 14 — Docker Build Verification (2026-05-14)

### Docker Build
- `docker build -t ai-employee-worker:latest .` succeeds (EXIT_CODE 0)
- Skills are correctly baked in at `/app/.opencode/skills/` via `COPY src/workers/skills/ /app/.opencode/skills/` in Dockerfile
- Both `tool-usage-reference` and `uuid-disambiguation` directories present with valid SKILL.md files
- YAML frontmatter validated: both start with `---`, have `name` and `description` fields

### pnpm build
- `pnpm build` (tsc -p tsconfig.build.json) exits 0 — no TypeScript errors

### pnpm lint
- `pnpm lint` exits 1 due to 12 pre-existing errors in `scripts/generate-final-lock-map.mjs` and `scripts/merge-lock-map.mjs`
- These are `no-undef` errors for `console` in .mjs files — committed before the skills plan
- NOT regressions from the skills implementation
- 119 warnings also pre-existing (no-explicit-any, no-unused-vars in test files)

### Evidence Files
- `.sisyphus/evidence/task-14-docker-verification.txt` — Docker build + skills verification
- `.sisyphus/evidence/task-14-build-test.txt` — pnpm build + lint results
