import { describe, it, expect, vi } from 'vitest';
import {
  SYSTEM_PROMPT_PRE,
  REFINE_SYSTEM_PROMPT_PRE,
  buildConnectedAppsBlock,
  buildConverseSystemPromptPre,
} from '../../../../src/gateway/services/prompts/archetype-generator-prompts.js';
import type { callLLM } from '../../../../src/lib/call-llm.js';
import { ArchetypeGenerator } from '../../../../src/gateway/services/archetype-generator.js';

const INTENT_CLOSER =
  'Finally, submit your completed summary for review so it can be delivered to the team.';
const CLI_PATTERN = /tsx \/tools\//;
const ESTIMATOR_SYSTEM_PREFIX = 'You estimate manual task duration';

describe('SYSTEM_PROMPT_PRE — intent-level (no CLI commands)', () => {
  it('does NOT contain tsx /tools/ in the execution_steps Runtime Patterns section', () => {
    const runtimeSection = (
      SYSTEM_PROMPT_PRE.split('## execution_steps Runtime Patterns (MANDATORY)')[1] ?? ''
    ).split('## Code-Writing Employees')[0];
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
      .filter(
        (l) => l.includes('include') || l.includes('invocation') || l.includes('When the job'),
      )
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

describe('REFINE_SYSTEM_PROMPT_PRE — intentionally NOT abstracted (still CLI-level)', () => {
  // REFINE is deliberately left CLI-level; these guards fail loudly if the intent rewrite is mis-applied here.
  it('STILL contains tsx /tools/ in the refine execution_steps rule', () => {
    expect(REFINE_SYSTEM_PROMPT_PRE).toMatch(CLI_PATTERN);
  });

  it('STILL contains the explicit tsx /tools/platform/submit-output.ts FINAL STEP example', () => {
    expect(REFINE_SYSTEM_PROMPT_PRE).toContain('tsx /tools/platform/submit-output.ts');
  });

  it('STILL contains the includes-explicit-tsx mandate that converse no longer has', () => {
    expect(REFINE_SYSTEM_PROMPT_PRE).toContain('includes explicit `tsx /tools/...` invocations');
  });
});

function makeLLMResult(content: string) {
  return {
    content,
    model: 'deepseek/deepseek-v4-flash',
    promptTokens: 10,
    completionTokens: 20,
    estimatedCostUsd: 0.001,
    latencyMs: 100,
  };
}

function makeGenerateLLMWithStubbedEstimator(mainResponse: string) {
  return vi.fn(
    async (
      opts: Record<string, unknown> & { messages?: Array<{ role: string; content: string }> },
    ) => {
      const systemContent =
        (opts.messages as Array<{ role: string; content: string }>)?.[0]?.content ?? '';
      if (systemContent.startsWith(ESTIMATOR_SYSTEM_PREFIX)) {
        return makeLLMResult('15');
      }
      return makeLLMResult(mainResponse);
    },
  );
}

function makeGenerationRepo() {
  return {
    record: vi.fn(async () => ({ id: 'call-1' })),
    linkArchetype: vi.fn(async () => undefined),
  };
}

describe('postProcess — null delivery_steps stays null (no intent closer injected)', () => {
  // Invariant under guard: postProcess only null-coerces delivery_steps, never synthesizes it.
  const NULL_DELIVERY_JSON = JSON.stringify({
    role_name: 'no-delivery-employee',
    identity: 'You are a test employee.',
    execution_steps: '1. Do the task.\n2. Write to /tmp/draft.txt.\n3. ' + INTENT_CLOSER,
    delivery_steps: null,
    delivery_instructions: null,
    instructions: '1. Do the task.',
    deliverable_type: 'slack_message',
    tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
    temperature: 1.0,
    overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
  });

  it('keeps delivery_steps === null when the LLM emits null', async () => {
    const fn = makeGenerateLLMWithStubbedEstimator(NULL_DELIVERY_JSON);
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.generate('An employee with no delivery action');

    expect(result.delivery_steps).toBeNull();
  });

  it('does NOT propagate the intent closer from execution_steps into delivery_steps', async () => {
    const fn = makeGenerateLLMWithStubbedEstimator(NULL_DELIVERY_JSON);
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.generate('An employee with no delivery action');

    expect(result.execution_steps).toContain(INTENT_CLOSER);
    expect(result.delivery_steps).toBeNull();
  });

  it('null-coerces a non-string delivery_steps rather than synthesizing content', async () => {
    const badDeliveryJson = JSON.stringify({
      role_name: 'bad-delivery-employee',
      identity: 'You are a test employee.',
      execution_steps: '1. Do the task.',
      delivery_steps: 42,
      delivery_instructions: null,
      instructions: '1. Do the task.',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
      temperature: 1.0,
      overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
    });
    const fn = makeGenerateLLMWithStubbedEstimator(badDeliveryJson);
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.generate('An employee whose delivery_steps came back malformed');

    expect(result.delivery_steps).toBeNull();
  });
});
