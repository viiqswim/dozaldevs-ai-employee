import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function getGuestMessagingAgentsMd(): string {
  const seedContent = readFileSync(resolve(__dirname, '../../prisma/seed.ts'), 'utf8');
  const match = seedContent.match(/const GUEST_MESSAGING_AGENTS_MD = `([\s\S]*?)`;/);
  if (!match) throw new Error('GUEST_MESSAGING_AGENTS_MD not found in seed.ts');
  return match[1];
}

describe('GUEST_MESSAGING_AGENTS_MD — conversation history context', () => {
  it('includes Conversation History section heading', () => {
    expect(getGuestMessagingAgentsMd()).toContain('Conversation History');
  });

  it('forbids contradicting prior host messages', () => {
    expect(getGuestMessagingAgentsMd()).toContain('NEVER contradict');
  });

  it('requires referencing prior context when helpful', () => {
    expect(getGuestMessagingAgentsMd()).toContain('Reference prior context');
  });

  it('requires conversationSummary to cover the full thread', () => {
    const agentsMd = getGuestMessagingAgentsMd();
    expect(agentsMd).toContain('conversationSummary');
    expect(agentsMd).toContain('full thread');
  });

  it('sets conversationSummary to null for single-message threads', () => {
    const agentsMd = getGuestMessagingAgentsMd();
    expect(agentsMd).toContain('single-message');
    expect(agentsMd).toContain('conversationSummary to null');
  });
});
