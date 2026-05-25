/**
 * Assembles the full task prompt injected into every AI employee session.
 *
 * The prompt wraps the archetype's instructions with:
 * 1. A dynamic date/time/epoch line (breaks prompt determinism across runs)
 * 2. The archetype instructions
 * 3. A mandatory submit-output suffix (seen last — reinforces the requirement)
 * 4. The task ID
 */

export interface AssembleTaskPromptOptions {
  instructions: string;
  approvalRequired: boolean;
  taskId?: string; // optional — defaults to "<dynamic at runtime>"
}

export function assembleTaskPrompt(options: AssembleTaskPromptOptions): string {
  const { instructions, approvalRequired, taskId = '<dynamic at runtime>' } = options;

  const submitOutputCmd = `tsx /tools/platform/submit-output.ts --summary "<one sentence describing what you accomplished>" --classification "${approvalRequired ? 'NEEDS_APPROVAL' : 'NO_ACTION_NEEDED'}"`;

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

  return contextLine + instructions + submitOutputSuffix + `\n\nTask ID: ${taskId}`;
}
