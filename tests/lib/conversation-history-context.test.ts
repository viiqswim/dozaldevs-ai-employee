import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function getGuestMessagingIdentity(): string {
  const seedContent = readFileSync(resolve(__dirname, '../../prisma/seed.ts'), 'utf8');
  const match = seedContent.match(/role_name:\s*'guest-messaging'[\s\S]*?identity:\s*"([^"]+)"/);
  if (!match) throw new Error('guest-messaging identity not found in seed.ts');
  return match[1];
}

function getGuestMessagingInstructions(): string {
  const seedContent = readFileSync(resolve(__dirname, '../../prisma/seed.ts'), 'utf8');
  const match = seedContent.match(/const VLRE_GUEST_MESSAGING_INSTRUCTIONS = `([\s\S]*?)`;/);
  if (!match) throw new Error('VLRE_GUEST_MESSAGING_INSTRUCTIONS not found in seed.ts');
  return match[1];
}

function getToolUsageReferenceSkill(): string {
  return readFileSync(
    resolve(__dirname, '../../src/workers/skills/tool-usage-reference/SKILL.md'),
    'utf8',
  );
}

describe('GUEST_MESSAGING_AGENTS_MD — conversation history context', () => {
  it('reads the full conversation thread as first workflow step', () => {
    expect(getGuestMessagingInstructions()).toContain('Read the full conversation thread');
  });

  it('includes language matching instruction', () => {
    expect(getGuestMessagingIdentity()).toContain("match the guest's language");
  });

  it('includes NEEDS_APPROVAL classification rule', () => {
    expect(getGuestMessagingInstructions()).toContain('NEEDS_APPROVAL');
  });

  it('includes NO_ACTION_NEEDED classification rule', () => {
    expect(getGuestMessagingInstructions()).toContain('NO_ACTION_NEEDED');
  });

  it('references tool-usage-reference skill for CLI syntax', () => {
    const skillMd = getToolUsageReferenceSkill();
    expect(skillMd).toContain('tool-usage-reference');
    expect(skillMd).toContain('CLI syntax');
  });
});
