# Issues — composio-auth-consolidation

## [2026-06-12] Plan Start

No issues yet — execution starting.

## [2026-06-12] T15 — Slack Approval E2E Findings

1. **guest-messaging requires `current_date` every_run input.** A prompt-only trigger body returns 422 MISSING_REQUIRED_INPUTS. Body must be `{"inputs":{"current_date":"YYYY-MM-DD","prompt":"..."}}`.

2. **Archetype notification_channel C0AMGJQN05S is unreachable (channel_not_found).** Both the lifecycle `notify-received` step AND the harness auto-post (`tryAutoPostApprovalCard`) fail `channel_not_found` — the Papi Chulo bot is not a member. Result: no `pending_approvals` row, empty deliverable metadata. Task still enters Reviewing (waitForEvent keyed on data.taskId), so it is approvable, but the canonical card pipeline is broken for this archetype's configured channel.

3. **dev/prod shared SLACK_APP_TOKEN steals button clicks.** Clicking "Approve & Post" on the real Slack card updated it to "Looks like this one has already been handled" — but NO slack-handlers entry appeared in the local gateway log and the local task stayed Reviewing. The interaction was round-robined to the PRODUCTION gateway (shared SLACK_APP_TOKEN), whose cloud DB has no task → isTaskAwaitingApproval=false → "already handled". Resolution: manual approval fallback against local Inngest (port 8288), which fires the exact `employee/approval.received` event the local Bolt handler emits. This is the documented Known Issue (per-dev Slack app is the long-term fix).
