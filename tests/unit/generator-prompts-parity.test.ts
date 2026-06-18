import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT_PRE,
  buildConverseSystemPromptPre,
} from '../../src/gateway/services/prompts/archetype-generator-prompts.js';

const converse = buildConverseSystemPromptPre(true);

describe('generator-prompts parity', () => {
  it('SYSTEM_PROMPT_PRE does not contain hardcode zone table instruction', () => {
    expect(SYSTEM_PROMPT_PRE).not.toContain('Hardcode coverage/zone table IN execution_steps');
    expect(SYSTEM_PROMPT_PRE).not.toContain('Do NOT say "look up zone in Notion"');
  });

  it('SYSTEM_PROMPT_PRE does not contain hardcode calendar instruction', () => {
    expect(SYSTEM_PROMPT_PRE).not.toContain('Hardcode recurring task calendar IN execution_steps');
    expect(SYSTEM_PROMPT_PRE).not.toContain(
      'Do NOT say "read the restock/trash calendar from Notion"',
    );
  });

  it('buildConverseSystemPromptPre does not contain hardcode zone table instruction', () => {
    expect(converse).not.toContain('Hardcode coverage table IN the steps');
    expect(converse).not.toContain('Do NOT say "look up zone in Notion"');
  });

  it('buildConverseSystemPromptPre does not contain hardcode calendar instruction', () => {
    expect(converse).not.toContain('Hardcode recurring task calendar IN the steps');
    expect(converse).not.toContain('Do NOT read it from Notion');
  });

  it('SYSTEM_PROMPT_PRE does not teach printenv INPUT_TARGET_DATE as a MUST instruction', () => {
    expect(SYSTEM_PROMPT_PRE).not.toMatch(/MUST.*printenv INPUT_TARGET_DATE/);
    expect(SYSTEM_PROMPT_PRE).not.toMatch(/Step 1 MUST be.*printenv/);
  });

  it('buildConverseSystemPromptPre does not teach printenv INPUT_TARGET_DATE as a MUST instruction', () => {
    expect(converse).not.toMatch(/MUST.*printenv INPUT_TARGET_DATE/);
    expect(converse).not.toMatch(/Step 1 reads.*printenv/);
  });

  it('SYSTEM_PROMPT_PRE does not contain /tmp/delivery-draft.txt', () => {
    expect(SYSTEM_PROMPT_PRE).not.toContain('/tmp/delivery-draft.txt');
  });

  it('buildConverseSystemPromptPre does not contain /tmp/delivery-draft.txt', () => {
    expect(converse).not.toContain('/tmp/delivery-draft.txt');
  });

  it('SYSTEM_PROMPT_PRE contains the runtime reference-data extraction pattern', () => {
    expect(SYSTEM_PROMPT_PRE).toContain('Runtime Reference-Data Extraction Pattern');
  });

  it('buildConverseSystemPromptPre contains the runtime reference-data extraction pattern', () => {
    expect(converse).toContain('RUNTIME REFERENCE-DATA EXTRACTION PATTERN');
  });

  it('both paths have the same number of numbered bold items (parity check)', () => {
    const sysItems = (SYSTEM_PROMPT_PRE.match(/^\d+\. \*\*/gm) ?? []).length;
    const convItems = (converse.match(/^\d+\. \*\*/gm) ?? []).length;
    expect(sysItems).toBe(convItems);
  });

  // Grep-gate: forbidden phrases that caused hardcoded business data in generated steps
  it('SYSTEM_PROMPT_PRE does not contain hardcode-calendar driver phrase', () => {
    expect(SYSTEM_PROMPT_PRE).not.toContain('hardcode the full calendar');
    expect(SYSTEM_PROMPT_PRE).not.toContain('do NOT read it from Notion');
    expect(SYSTEM_PROMPT_PRE).not.toMatch(/Do NOT read .* from Notion/);
  });

  it('buildConverseSystemPromptPre does not contain hardcode-calendar driver phrase', () => {
    expect(converse).not.toContain('hardcode the full calendar');
    expect(converse).not.toContain('do NOT read it from Notion');
    expect(converse).not.toMatch(/Do NOT read .* from Notion/);
  });

  it('SYSTEM_PROMPT_PRE contains CRITICAL distinction clause in Closed-Allowlist rule', () => {
    expect(SYSTEM_PROMPT_PRE).toContain(
      'CRITICAL distinction**: UNASSIGNED means the key has NO coverage in the roster at all',
    );
  });

  it('buildConverseSystemPromptPre contains CRITICAL distinction clause in Closed-Allowlist rule', () => {
    expect(converse).toContain(
      'CRITICAL distinction**: UNASSIGNED means the key has NO coverage in the roster at all',
    );
  });

  it('SYSTEM_PROMPT_PRE contains Backup-Fallback Rule', () => {
    expect(SYSTEM_PROMPT_PRE).toContain('Backup-Fallback Rule');
  });

  it('buildConverseSystemPromptPre contains Backup-Fallback Rule', () => {
    expect(converse).toContain('Backup-Fallback Rule');
  });

  it('SYSTEM_PROMPT_PRE contains REQUIRED VERBATIM PHRASE for closed-allowlist', () => {
    expect(SYSTEM_PROMPT_PRE).toContain('REQUIRED VERBATIM PHRASE');
    expect(SYSTEM_PROMPT_PRE).toContain(
      'This set is now CLOSED — a property is covered ONLY if its exact',
    );
  });

  it('buildConverseSystemPromptPre contains REQUIRED VERBATIM PHRASE for closed-allowlist', () => {
    expect(converse).toContain('REQUIRED VERBATIM PHRASE');
    expect(converse).toContain('This set is now CLOSED — a property is covered ONLY if its exact');
  });

  it('SYSTEM_PROMPT_PRE forbids determining key from non-roster source', () => {
    expect(SYSTEM_PROMPT_PRE).toContain(
      "NEVER determine a property's key from the property directory",
    );
  });

  it('buildConverseSystemPromptPre forbids determining key from non-roster source', () => {
    expect(converse).toContain("NEVER determine a property's key from the property directory");
  });
});
