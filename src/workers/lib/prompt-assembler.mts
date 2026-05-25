/**
 * Assembles the full task prompt injected into every AI employee session.
 *
 * The prompt wraps the archetype's instructions with:
 * 1. A mandatory submit-output preamble (seen first — cheap models stop early)
 * 2. A dynamic date/time/epoch line (breaks prompt determinism across runs)
 * 3. The archetype instructions
 * 4. A mandatory submit-output suffix (seen last — reinforces the requirement)
 * 5. The task ID
 */

export interface AssembleTaskPromptOptions {
  instructions: string;
  approvalRequired: boolean;
  envManifest?: string; // optional — if provided, included in preamble
  taskId?: string; // optional — defaults to "<dynamic at runtime>"
}

export function assembleTaskPrompt(options: AssembleTaskPromptOptions): string {
  const { instructions, approvalRequired, envManifest, taskId = '<dynamic at runtime>' } = options;

  const submitOutputCmd = `tsx /tools/platform/submit-output.ts --summary "<one sentence describing what you accomplished>" --classification "${approvalRequired ? 'NEEDS_APPROVAL' : 'NO_ACTION_NEEDED'}"`;

  const submitOutputPreamble =
    `MANDATORY FINAL STEP: No matter what happens, your LAST action MUST be to run:\n${submitOutputCmd}\nThe task is marked Failed if you skip this — even if you completed the work.\n\nAVAILABLE ENVIRONMENT VARIABLES (injected by platform):\n- $NOTIFICATION_CHANNEL — Slack channel ID for posting messages (use with: NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "...")\n- $TASK_ID — current task UUID\n- $SLACK_BOT_TOKEN — Slack bot token (auto-used by slack tools)\n\n` +
    (envManifest && envManifest.trim().length > 0 ? `${envManifest}\n\n` : '');

  // Inject date + time + epoch ms to break prompt determinism across runs.
  // Without this, the prompt is byte-for-byte identical every run, causing models to
  // converge on the same high-probability output (e.g. always picking the same quote).
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const dateStr = `${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()} at ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} UTC`;
  const epochMs = now.getTime();
  const contextLine = `TODAY: ${dateStr} | EPOCH_MS: ${epochMs}\n\n`;

  const submitOutputSuffix = `\n\n---\nREMINDER — MANDATORY FINAL STEP: Run this before ending the session:\n${submitOutputCmd}`;

  return (
    submitOutputPreamble +
    contextLine +
    instructions +
    submitOutputSuffix +
    `\n\nTask ID: ${taskId}`
  );
}
