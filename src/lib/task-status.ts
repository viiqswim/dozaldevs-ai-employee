/**
 * Canonical task status constants — single source of truth.
 *
 * ## Lifecycle terminal states
 * The universal employee lifecycle (`employee/universal-lifecycle`) defines
 * three true terminal states: Done | Failed | Cancelled
 * A task in one of these states will never transition again.
 *
 * ## Why multiple named subsets exist
 * Several call sites need sets that are slightly broader or narrower than the
 * canonical three. Each deviation is documented on the export that carries it.
 * Do NOT inline a new set — add a named export here and import it.
 */

/**
 * The three canonical terminal states of the employee lifecycle.
 *
 * Use this as the default for any "is this task done?" check.
 * Override only with one of the named subsets below, and only when the
 * semantic difference is explicitly required.
 */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['Done', 'Failed', 'Cancelled']);

/**
 * Extended terminal set for idempotency guards on Slack approval-button clicks.
 *
 * Includes `Delivering` because a task that has already been approved and is
 * currently delivering is no longer "awaiting approval" — a duplicate button
 * click should be dropped.  `Delivering` is NOT a true terminal state (the task
 * will still transition to Done), but it is terminal for the purpose of the
 * approval-idempotency check in `isTaskAwaitingApproval()`.
 *
 * Used by: `src/gateway/slack/handlers.ts` — `isTaskAwaitingApproval()`
 */
export const APPROVAL_IDEMPOTENCY_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'Done',
  'Cancelled',
  'Failed',
  'Delivering',
]);

/**
 * Extended terminal set for log-streaming decisions.
 *
 * Includes `Stale` — a non-lifecycle status used for very old tasks that
 * were manually retired.  When a task is Stale, the log file (if it exists)
 * is served as a static stream rather than being watched for new lines.
 *
 * Used by: `src/gateway/routes/admin-tasks.ts` — log-streaming route
 */
export const LOG_STREAM_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'Done',
  'Failed',
  'Cancelled',
  'Stale',
]);

/**
 * Narrowest terminal set for cancellation guards.
 *
 * A task can be cancelled from any active state. The guard only blocks
 * cancellation when the task is Done (outcome already final) or already
 * Cancelled (no-op). Failed tasks are intentionally omitted — the cancellation
 * path can still operate on Failed tasks if called explicitly.
 *
 * Used by: `src/gateway/services/jira-task-creation.ts` — `cancelTaskByExternalId()`
 */
export const CANCELLATION_GUARD_STATUSES: ReadonlySet<string> = new Set(['Done', 'Cancelled']);
