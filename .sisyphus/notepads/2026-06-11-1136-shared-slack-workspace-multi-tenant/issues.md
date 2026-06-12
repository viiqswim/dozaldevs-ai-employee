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
