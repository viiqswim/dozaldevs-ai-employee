# Inngest Lifecycle Steps Explained

**Function**: `employee/universal-lifecycle`
**Source file**: `src/inngest/employee-lifecycle.ts`

This document maps every step visible in the Inngest Dev Server trace back to its source code location and purpose.

---

## Step Map (Happy Path — No Approval Required)

| Trace Step              | File:Line                              | What it does                                                                                                    | Necessary?       |
| ----------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Inngest** (ⓘ)         | Framework                              | Inngest SDK initialization — always present in every run                                                        | Yes (framework)  |
| **load-task**           | L147 `step.run('load-task')`           | Fetches task row + joined archetype from DB (PostgREST)                                                         | Yes              |
| **triaging**            | L214 `step.run('triaging')`            | Sets status → `Triaging`. Auto-pass — no logic yet                                                              | ⚠️ Ceremony only |
| **notify-received**     | L222 `step.run('notify-received')`     | Posts "⏳ Task received" Slack message, stores `notify_slack_ts` in task metadata                               | Yes              |
| **awaiting-input**      | L371 `step.run('awaiting-input')`      | Sets status → `AwaitingInput`. Auto-pass — no logic yet                                                         | ⚠️ Ceremony only |
| **ready**               | L378 `step.run('ready')`               | Sets status → `Ready`. Auto-pass                                                                                | ⚠️ Ceremony only |
| **executing**           | L385 `step.run('executing')`           | Loads tenant env + employee rules + knowledge, spins up Docker/Fly worker machine                               | Yes              |
| **poll-completion**     | L601 `step.run('poll-completion')`     | Polls DB every 15 s (max 120 polls = 30 min) until worker sets status to `Submitting`, `Failed`, or `Cancelled` | Yes              |
| **validating**          | L742 `step.run('validating')`          | Sets status → `Validating`. Auto-pass — no quality checks yet                                                   | ⚠️ Ceremony only |
| **submitting**          | L750 `step.run('submitting')`          | Sets status → `Submitting`                                                                                      | ⚠️ Ceremony only |
| **complete**            | L759 `step.run('complete')`            | Marks task `Done`, updates Slack notify message to ✅, cleans up any stale approval card                        | Yes              |
| **cleanup-no-approval** | L854 `step.run('cleanup-no-approval')` | Stops/destroys the worker machine (Docker container or Fly machine)                                             | Yes              |

---

## Auto-Pass Steps — Why They Exist

Five steps do nothing except write two DB rows (task status patch + `task_status_log` entry):

- **triaging** — placeholder for future intent classification / task routing
- **awaiting-input** — placeholder for future "pause and ask the user" logic
- **ready** — signals task is queued for execution
- **validating** — placeholder for future quality checks on worker output
- **submitting** — transition step before approval gate or no-approval completion

They exist to maintain a complete state-machine audit trail in `task_status_log`. Each adds ~5–8 ms but creates visual noise in the trace. They can be collapsed if the audit trail is not needed.

---

## Additional Steps on the Approval Path

When the archetype has `risk_model.approval_required: true`, the following steps appear **after `submitting`** instead of `complete` + `cleanup-no-approval`:

| Step                                                                                  | What it does                                                                                                     |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `check-classification`                                                                | Reads deliverable content, calls `parseClassifyResponse()` — if `NO_ACTION_NEEDED`, skips the full approval flow |
| `cleanup-no-action`                                                                   | (Only if NO_ACTION_NEEDED) Destroys worker machine                                                               |
| `post-override-card`                                                                  | (Only if NO_ACTION_NEEDED) Posts override card to Slack                                                          |
| `wait-for-override`                                                                   | `step.waitForEvent` — blocks until PM clicks override or timeout                                                 |
| `complete-no-action-timeout` / `complete-override-dismissed` / `create-override-task` | Terminal branches for the NO_ACTION_NEEDED path                                                                  |
| `check-supersede`                                                                     | Looks for an older task on the same conversation thread and supersedes it                                        |
| `set-reviewing`                                                                       | Sets status → `Reviewing`                                                                                        |
| `update-notify-reviewing`                                                             | Updates the Slack notify message to show "Awaiting approval"                                                     |
| `track-pending-approval`                                                              | Writes to `pending_approvals` table; optionally posts a nudge broadcast                                          |
| `wait-for-approval`                                                                   | `step.waitForEvent('employee/approval.received')` — blocks until PM approves/rejects/timeout                     |
| `handle-approval-result`                                                              | Handles approve (spawns delivery machine), reject, supersede, or expiry — the largest step in the function       |

---

## Other Conditional Steps

| Step                          | When it appears                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pre-check-skip-host-message` | Only for `guest-messaging` archetype — checks if last Hostfully message was sent by the host (skips task if so) |
| `skip-host-message-done`      | Only for `guest-messaging` — marks task `Done` immediately without notifying Slack                              |
| `mark-cancelled`              | When `poll-completion` returns `Cancelled` (task superseded mid-execution)                                      |
| `cleanup-on-cancellation`     | Destroys machine after cancellation                                                                             |
| `mark-failed`                 | When `poll-completion` returns `Failed`                                                                         |
| `cleanup-on-failure`          | Destroys machine after failure                                                                                  |

---

## The Run in the Screenshot

**Run ID**: `01KS22P836YYFPJT5TDNFQPZET`

This was a **no-approval-required** run (confirmed by `complete` → `cleanup-no-approval` at the bottom — not the approval path). Total time: 46.246 s, almost entirely in `poll-completion` (45.028 s) waiting for the worker to finish.

The 12 visible steps (including the Inngest SDK header) are all intentionally defined — nothing is injected by the platform automatically except the top-level `Inngest` entry.

---

## Key Insight

> **Every step in the Inngest trace is a `step.run()` or `step.waitForEvent()` call you wrote.**
> Inngest does not add steps silently. If you see it in the trace, it is in `employee-lifecycle.ts`.
