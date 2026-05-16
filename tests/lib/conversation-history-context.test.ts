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
  it('reads the full conversation thread as first workflow step', () => {
    expect(getGuestMessagingAgentsMd()).toContain('Read the full conversation thread');
  });

  it('includes language matching instruction', () => {
    expect(getGuestMessagingAgentsMd()).toContain("match the guest's language");
  });

  it('includes NEEDS_APPROVAL classification rule', () => {
    expect(getGuestMessagingAgentsMd()).toContain('NEEDS_APPROVAL');
  });

  it('includes NO_ACTION_NEEDED classification rule', () => {
    expect(getGuestMessagingAgentsMd()).toContain('NO_ACTION_NEEDED');
  });

  it('references tool-usage-reference skill for CLI syntax', () => {
    const agentsMd = getGuestMessagingAgentsMd();
    expect(agentsMd).toContain('tool-usage-reference');
    expect(agentsMd).toContain('CLI syntax');
  });
});
