import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT_PRE,
  buildConnectedAppsBlock,
  buildConverseSystemPromptPre,
} from '../../../../src/gateway/services/prompts/archetype-generator-prompts.js';

const INTENT_CLOSER = 'Finally, submit your completed summary for review so it can be delivered to the team.';
const CLI_PATTERN = /tsx \/tools\//;

describe('SYSTEM_PROMPT_PRE — intent-level (no CLI commands)', () => {
  it('does NOT contain tsx /tools/ in the execution_steps Runtime Patterns section', () => {
    const runtimeSection = (SYSTEM_PROMPT_PRE.split('## execution_steps Runtime Patterns (MANDATORY)')[1] ?? '')
      .split('## Code-Writing Employees')[0];
    expect(runtimeSection).not.toMatch(CLI_PATTERN);
  });

  it('still references $NOTIFICATION_CHANNEL env var', () => {
    expect(SYSTEM_PROMPT_PRE).toContain('$NOTIFICATION_CHANNEL');
  });

  it('still references $SOURCE_CHANNELS env var', () => {
    expect(SYSTEM_PROMPT_PRE).toContain('$SOURCE_CHANNELS');
  });

  it('contains the intent closer phrase', () => {
    expect(SYSTEM_PROMPT_PRE).toContain(INTENT_CLOSER);
  });

  it('still mandates /tools/platform/submit-output.ts in tool_registry.tools', () => {
    expect(SYSTEM_PROMPT_PRE).toContain('/tools/platform/submit-output.ts');
  });

  it('still mandates the boundary enforcement line instruction', () => {
    expect(SYSTEM_PROMPT_PRE).toContain('**IMPORTANT: Follow ONLY these steps');
  });

  it('still mandates the STOP directive', () => {
    expect(SYSTEM_PROMPT_PRE).toContain('**STOP. Do nothing else. Your job is done.**');
  });

  it('still mandates writing draft content to /tmp/', () => {
    expect(SYSTEM_PROMPT_PRE).toContain('/tmp/');
  });
});

describe('SYSTEM_PROMPT_PRE — delivery templates (intent-level)', () => {
  const deliverySection = SYSTEM_PROMPT_PRE.split('## Delivery Templates')[1] ?? '';

  it('does NOT contain tsx /tools/ in the delivery templates section', () => {
    expect(deliverySection).not.toMatch(CLI_PATTERN);
  });

  it('still references $NOTIFICATION_CHANNEL in delivery templates', () => {
    expect(deliverySection).toContain('$NOTIFICATION_CHANNEL');
  });

  it('still notes that delivery_steps must write via submit-output', () => {
    expect(deliverySection).toContain('submit-output');
  });
});

describe('buildConnectedAppsBlock — intent-level (no CLI invocation example)', () => {
  it('does NOT contain tsx /tools/ in the usage instructions for connected apps', () => {
    const block = buildConnectedAppsBlock(['notion'], ['notion', 'gmail']);
    const instructionLines = block
      .split('\n')
      .filter((l) => l.includes('include') || l.includes('invocation') || l.includes('When the job'))
      .join('\n');
    expect(instructionLines).not.toMatch(CLI_PATTERN);
  });

  it('NONE branch does NOT reference tsx /tools/composio/execute.ts CLI in the warning', () => {
    const block = buildConnectedAppsBlock([], ['notion']);
    expect(block).not.toMatch(/tsx \/tools\/composio\/execute\.ts/);
  });

  it('CRITICAL RULES are preserved', () => {
    const block = buildConnectedAppsBlock(['notion'], []);
    expect(block).toContain('CRITICAL RULES for Composio');
    expect(block).toContain('ONLY');
  });

  it('preserves the NONE warning severity', () => {
    const block = buildConnectedAppsBlock([], ['notion']);
    expect(block).toContain('CRITICAL');
    expect(block).toContain('NONE');
  });
});

describe('buildConverseSystemPromptPre — intent-level (no tsx /tools/ mandate)', () => {
  it('create=true: does NOT contain "includes explicit tsx /tools/" in the execution_steps rule', () => {
    const prompt = buildConverseSystemPromptPre(true);
    expect(prompt).not.toContain('includes explicit tsx /tools/');
  });

  it('create=false: does NOT contain "includes explicit tsx /tools/" in the execution_steps rule', () => {
    const prompt = buildConverseSystemPromptPre(false);
    expect(prompt).not.toContain('includes explicit tsx /tools/');
  });

  it('still mentions boundary enforcement line requirement', () => {
    const prompt = buildConverseSystemPromptPre(true);
    expect(prompt).toContain('boundary enforcement line');
  });

  it('still mentions $SOURCE_CHANNELS/$NOTIFICATION_CHANNEL env var requirement', () => {
    const prompt = buildConverseSystemPromptPre(true);
    expect(prompt).toContain('$SOURCE_CHANNELS');
    expect(prompt).toContain('$NOTIFICATION_CHANNEL');
  });

  it('still mentions submit-output FINAL STEP requirement', () => {
    const prompt = buildConverseSystemPromptPre(true);
    expect(prompt).toContain('submit-output');
  });
});
