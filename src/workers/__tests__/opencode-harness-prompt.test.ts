import { describe, it, expect } from 'vitest';
import { extractTriggerPrompt, injectAssignmentSection } from '../lib/trigger-payload.mjs';

const BASE_INSTRUCTIONS =
  'Follow the instructions in <execution-instructions> within the AGENTS.md file';

describe('extractTriggerPrompt', () => {
  it('returns the prompt string when trigger_payload has prompt', () => {
    expect(extractTriggerPrompt({ prompt: 'Fix the login bug' })).toBe('Fix the login bug');
  });

  it('trims leading and trailing whitespace from the prompt', () => {
    expect(extractTriggerPrompt({ prompt: '  Fix the login bug  \n' })).toBe('Fix the login bug');
  });

  it('returns empty string when trigger_payload is an empty object', () => {
    expect(extractTriggerPrompt({})).toBe('');
  });

  it('returns empty string when trigger_payload.prompt is an empty string', () => {
    expect(extractTriggerPrompt({ prompt: '' })).toBe('');
  });

  it('returns empty string when trigger_payload.prompt is whitespace-only', () => {
    expect(extractTriggerPrompt({ prompt: '   \n\t  ' })).toBe('');
  });

  it('returns empty string when trigger_payload is null', () => {
    expect(extractTriggerPrompt(null)).toBe('');
  });

  it('returns empty string when trigger_payload is undefined', () => {
    expect(extractTriggerPrompt(undefined)).toBe('');
  });

  it('returns empty string when trigger_payload has no prompt key', () => {
    expect(extractTriggerPrompt({ other: 'value', task: 'do something' })).toBe('');
  });

  it('returns empty string when trigger_payload.prompt is a number', () => {
    expect(extractTriggerPrompt({ prompt: 42 })).toBe('');
  });

  it('returns empty string when trigger_payload.prompt is null', () => {
    expect(extractTriggerPrompt({ prompt: null })).toBe('');
  });

  it('returns empty string when trigger_payload.prompt is a boolean', () => {
    expect(extractTriggerPrompt({ prompt: true })).toBe('');
  });

  it('returns empty string when trigger_payload is a string (not an object)', () => {
    expect(extractTriggerPrompt('some string')).toBe('');
  });

  it('returns multi-line prompt as-is (trimmed ends only)', () => {
    const multiLine = 'Line 1\nLine 2\nLine 3';
    expect(extractTriggerPrompt({ prompt: multiLine })).toBe(multiLine);
  });
});

describe('injectAssignmentSection', () => {
  it('(a) appends ## Your Assignment section when prompt is present', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, { prompt: 'Fix the login bug' });
    expect(result).toContain('## Your Assignment');
    expect(result).toContain('Fix the login bug');
  });

  it('(a) base instructions are preserved before the assignment section', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, { prompt: 'Fix the login bug' });
    expect(result).toContain(BASE_INSTRUCTIONS);
    const instructionsPos = result.indexOf(BASE_INSTRUCTIONS);
    const assignmentPos = result.indexOf('## Your Assignment');
    expect(assignmentPos).toBeGreaterThan(instructionsPos);
  });

  it('(a) exact format: instructions + \\n\\n## Your Assignment\\n\\n + prompt', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, { prompt: 'Fix the login bug' });
    expect(result).toBe(`${BASE_INSTRUCTIONS}\n\n## Your Assignment\n\nFix the login bug`);
  });

  it('(a) trims the prompt before injecting (no leading/trailing whitespace in section)', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, { prompt: '  Fix the login bug  ' });
    expect(result).toContain('\n\n## Your Assignment\n\nFix the login bug');
    expect(result).not.toContain('  Fix the login bug  ');
  });

  it('(a) multi-word assignment is fully included in output', () => {
    const longPrompt =
      'Implement a Notion integration tool that reads page content and formats it as markdown.';
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, { prompt: longPrompt });
    expect(result).toContain(longPrompt);
    expect(result).toContain('## Your Assignment');
  });

  it('(b) returns instructions unchanged when trigger_payload is empty object', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, {});
    expect(result).toBe(BASE_INSTRUCTIONS);
    expect(result).not.toContain('## Your Assignment');
  });

  it('(b) returns instructions unchanged when trigger_payload is null', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, null);
    expect(result).toBe(BASE_INSTRUCTIONS);
    expect(result).not.toContain('## Your Assignment');
  });

  it('(b) returns instructions unchanged when trigger_payload has no prompt key', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, { metadata: { source: 'cron' } });
    expect(result).toBe(BASE_INSTRUCTIONS);
    expect(result).not.toContain('## Your Assignment');
  });

  it('(c) returns instructions unchanged when prompt is empty string', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, { prompt: '' });
    expect(result).toBe(BASE_INSTRUCTIONS);
    expect(result).not.toContain('## Your Assignment');
  });

  it('(c) returns instructions unchanged when prompt is whitespace-only', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, { prompt: '   \n   ' });
    expect(result).toBe(BASE_INSTRUCTIONS);
    expect(result).not.toContain('## Your Assignment');
  });

  it('(c) returns instructions unchanged when prompt trims to empty string', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, { prompt: '\t\t\t' });
    expect(result).toBe(BASE_INSTRUCTIONS);
    expect(result).not.toContain('## Your Assignment');
  });

  it('only one ## Your Assignment section is added (no duplication)', () => {
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, { prompt: 'Do something' });
    const occurrences = (result.match(/## Your Assignment/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

describe('raw_event envelope unwrapping (harness behavior)', () => {
  it('extractTriggerPrompt does NOT inject when given the raw_event envelope { inputs: { prompt } } directly (confirms unwrapping is needed)', () => {
    // raw_event is stored as { inputs: { prompt: "..." } }
    // Without unwrapping, extractTriggerPrompt sees no top-level .prompt → returns ''
    const rawEvent = { inputs: { prompt: 'hello' } };
    expect(extractTriggerPrompt(rawEvent)).toBe('');
  });

  it('extractTriggerPrompt DOES inject when given the unwrapped inputs { prompt } (confirms unwrapping works)', () => {
    // After unwrapping rawEvent.inputs, extractTriggerPrompt sees .prompt at top level
    const rawEvent = { inputs: { prompt: 'hello' } };
    const unwrapped = (rawEvent as Record<string, unknown>).inputs;
    expect(extractTriggerPrompt(unwrapped)).toBe('hello');
  });

  it('injectAssignmentSection injects prompt when passed unwrapped inputs', () => {
    const rawEvent = { inputs: { prompt: 'Implement the feature' } };
    const unwrapped = (rawEvent as Record<string, unknown>).inputs;
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, unwrapped);
    expect(result).toContain('## Your Assignment');
    expect(result).toContain('Implement the feature');
  });

  it('injectAssignmentSection returns instructions unchanged for webhook raw_event (no inputs key)', () => {
    // Webhook-triggered tasks: raw_event = { property_uid: "...", lead_uid: "..." }
    const webhookEvent = { property_uid: 'abc', lead_uid: 'def' };
    const result = injectAssignmentSection(BASE_INSTRUCTIONS, webhookEvent);
    expect(result).toBe(BASE_INSTRUCTIONS);
    expect(result).not.toContain('## Your Assignment');
  });
});
