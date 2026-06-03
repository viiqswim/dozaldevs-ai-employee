export function extractTriggerPrompt(triggerPayload: unknown): string {
  if (
    typeof triggerPayload === 'object' &&
    triggerPayload !== null &&
    'prompt' in triggerPayload &&
    typeof (triggerPayload as Record<string, unknown>).prompt === 'string'
  ) {
    return ((triggerPayload as Record<string, unknown>).prompt as string).trim();
  }
  return '';
}

export function injectAssignmentSection(instructions: string, triggerPayload: unknown): string {
  const prompt = extractTriggerPrompt(triggerPayload);
  return prompt ? `${instructions}\n\n## Your Assignment\n\n${prompt}` : instructions;
}
