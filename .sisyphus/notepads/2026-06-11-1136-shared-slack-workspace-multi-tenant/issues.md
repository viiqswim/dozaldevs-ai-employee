# Issues

## [2026-06-12] Known Issues

- None yet — Wave 1 starting

## [2026-06-12] BLOCKING BUG — disambiguation card duplicate action_id (found in Task 11 live E2E)
- File: src/gateway/slack/handlers/event-handlers.ts lines 309-314.
- All disambiguation buttons share action_id 'trigger_disambiguate' => Slack rejects the whole
  message with invalid_blocks ("`action_id` ... already exists"). Card NEVER posts when there
  are 2+ candidates. The multi-tenant "pick an employee" feature cannot complete.
- Also: the "Disambiguation card posted" info log fires unconditionally outside the try/catch,
  masking the failure. Real signal is the level-40 WARN "Failed to post disambiguation card".
- Fix needed (separate task): unique action_id per button + Bolt RegExp action matcher
  (/^trigger_disambiguate/); move success log inside the try after API success.
- Reproduced live (gateway invalid_blocks log), in Slack (empty thread, only ack), and via
  direct chat.postMessage repro. No task created from 3 attempts (0 rows in tasks since 22:44).

## [2026-06-12] T12 BLOCKED — PR #33 not yet merged to main

- T12 (production backup + additive data repair) requires code to be deployed to production first.
- Current prod deploy: commit 6bac6ae4 (PR #29) — does NOT contain the multi-tenant Slack changes.
- PR #33 (https://github.com/viiqswim/dozaldevs-ai-employee/pull/33) is OPEN and must be merged.
- After merge, Render auto-deploy will trigger (CI → deploy pipeline). Wait for status=live.
- Only then: connect to prod DB (port 5432 session pooler), take backup, do additive INSERT for tenant a17cdcca-1911-4138-b6dc-48b6e6393702.
- Preferred path: have teammate re-run OAuth flow (cleanest — no manual SQL needed).
- Alternative: manual INSERT into tenant_integrations (provider='slack', external_id=<team_id>, tenant_id='a17cdcca-1911-4138-b6dc-48b6e6393702').
- Per Task 3 spike: repair row does NOT need its own slack_bot_token — Task 7's fetchInstallation iterates to a live token from the incumbent tenant.
