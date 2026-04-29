import { describe, it, expect } from 'vitest';
import { GUEST_MESSAGING_SYSTEM_PROMPT } from '../../prisma/prompts/guest-messaging.js';

describe('GUEST_MESSAGING_SYSTEM_PROMPT — conversation history context', () => {
  it('includes CONVERSATION HISTORY CONTEXT section heading', () => {
    expect(GUEST_MESSAGING_SYSTEM_PROMPT).toContain('CONVERSATION HISTORY CONTEXT');
  });

  it('forbids contradicting prior host messages', () => {
    expect(GUEST_MESSAGING_SYSTEM_PROMPT).toContain('NEVER contradict');
  });

  it('requires referencing prior context when helpful', () => {
    expect(GUEST_MESSAGING_SYSTEM_PROMPT).toContain('Reference prior context');
  });

  it('requires conversationSummary to cover the full thread', () => {
    expect(GUEST_MESSAGING_SYSTEM_PROMPT).toContain('conversationSummary');
    expect(GUEST_MESSAGING_SYSTEM_PROMPT).toContain('full thread');
  });

  it('sets conversationSummary to null for single-message threads', () => {
    expect(GUEST_MESSAGING_SYSTEM_PROMPT).toContain('single-message');
    expect(GUEST_MESSAGING_SYSTEM_PROMPT).toContain('conversationSummary to null');
  });
});
