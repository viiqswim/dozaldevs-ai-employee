/**
 * Generates the "How to Complete Your Work" platform procedures section
 * for injection into an employee's AGENTS.md via platformRuntimeSections.
 */
export interface PlatformProceduresOptions {
  approvalRequired: boolean;
}

export function generatePlatformProcedures({
  approvalRequired,
}: PlatformProceduresOptions): string {
  if (approvalRequired) {
    return `## How to Complete Your Work

When you have finished your task, you MUST call the submit-output tool as your final step. This is mandatory — the task will be marked Failed if you skip it.

CLASSIFICATION:
- Use \`NEEDS_APPROVAL\` if you have produced output that requires human review before delivery (this is the default).
- Use \`NO_ACTION_NEEDED\` if there was nothing to do or the situation was already resolved.

REQUIRED final step:
tsx /tools/platform/submit-output.ts \\
  --summary "<one-sentence description of what you did>" \\
  --classification "NEEDS_APPROVAL"`;
  }

  return `## How to Complete Your Work

When you have finished your task, you MUST call the submit-output tool as your final step. This is mandatory — the task will be marked Failed if you skip it.

CLASSIFICATION:
- Use \`NO_ACTION_NEEDED\` — this task NEVER requires human approval. Do NOT use NEEDS_APPROVAL. Do NOT write /tmp/approval-message.json.

REQUIRED final step:
tsx /tools/platform/submit-output.ts \\
  --summary "<one-sentence description of what you did>" \\
  --classification "NO_ACTION_NEEDED"`;
}
