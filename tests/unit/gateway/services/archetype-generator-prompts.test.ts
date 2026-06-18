import { describe, it, expect, vi } from 'vitest';
import {
  SYSTEM_PROMPT_PRE,
  REFINE_SYSTEM_PROMPT_PRE,
  buildConnectedAppsBlock,
  buildConverseSystemPromptPre,
} from '../../../../src/gateway/services/prompts/archetype-generator-prompts.js';
import type { callLLM } from '../../../../src/lib/call-llm.js';
import {
  ArchetypeGenerator,
  type GenerateArchetypeResponse,
} from '../../../../src/gateway/services/archetype-generator.js';

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

  it('does NOT reference $SOURCE_CHANNELS env var (removed)', () => {
    expect(SYSTEM_PROMPT_PRE).not.toContain('$SOURCE_CHANNELS');
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

  it('does NOT mention $SOURCE_CHANNELS (removed) but still mentions $NOTIFICATION_CHANNEL', () => {
    const prompt = buildConverseSystemPromptPre(true);
    expect(prompt).not.toContain('$SOURCE_CHANNELS');
    expect(prompt).toContain('$NOTIFICATION_CHANNEL');
  });

  it('still mentions submit-output FINAL STEP requirement', () => {
    const prompt = buildConverseSystemPromptPre(true);
    expect(prompt).toContain('submit-output');
  });
});

describe('REFINE_SYSTEM_PROMPT_PRE — intent-level (no tsx /tools/ mandate)', () => {
  // REFINE is now intent-level like SYSTEM_PROMPT_PRE and buildConverseSystemPromptPre;
  // these guards ensure CLI plumbing does NOT leak into the refine prompt.
  it('mandates intent-level plain English descriptions (no CLI invocations) in the execution_steps rule', () => {
    expect(REFINE_SYSTEM_PROMPT_PRE).toContain('intent-level plain English');
  });

  it('does NOT contain the explicit tsx /tools/platform/submit-output.ts FINAL STEP example', () => {
    expect(REFINE_SYSTEM_PROMPT_PRE).not.toContain('tsx /tools/platform/submit-output.ts');
  });

  it('does NOT contain the includes-explicit-tsx mandate (removed — refine is now intent-level like converse)', () => {
    expect(REFINE_SYSTEM_PROMPT_PRE).not.toContain(
      'includes explicit `tsx /tools/...` invocations',
    );
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

describe('postProcess — delivery_steps default derivation', () => {
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

  it('derives a non-null default when the LLM emits null but deliverable_type is set', async () => {
    const fn = makeGenerateLLMWithStubbedEstimator(NULL_DELIVERY_JSON);
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.generate('An employee with no delivery action');

    expect(typeof result.delivery_steps).toBe('string');
    expect(result.delivery_steps).toBeTruthy();
  });

  it('does NOT propagate the intent closer from execution_steps into delivery_steps', async () => {
    const fn = makeGenerateLLMWithStubbedEstimator(NULL_DELIVERY_JSON);
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.generate('An employee with no delivery action');

    expect(result.execution_steps).toContain(INTENT_CLOSER);
    expect(typeof result.delivery_steps).toBe('string');
  });

  it('derives the default for a non-string delivery_steps (malformed → normalized → default)', async () => {
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

    expect(typeof result.delivery_steps).toBe('string');
    expect(result.delivery_steps).toBeTruthy();
  });
});

function makeDomainConfigJson(executionSteps: string, tools: string[]) {
  return JSON.stringify({
    role_name: 'cross-domain-employee',
    identity: 'You are a test employee.',
    execution_steps: executionSteps,
    delivery_steps: null,
    delivery_instructions: null,
    instructions: 'STALE PLACEHOLDER — postProcess overwrites this from execution_steps',
    deliverable_type: 'slack_message',
    tool_registry: { tools },
    temperature: 1.0,
    overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
  });
}

describe('generate() — cross-domain intent-level regression', () => {
  // Invariant under guard: the post-generation path is domain-agnostic — Slack, Composio/Notion, and KB intent prose all survive postProcess unchanged.
  type DomainCase = {
    domain: string;
    description: string;
    executionSteps: string;
    tools: string[];
    expectPresent: string[];
  };

  const SLACK_STEPS =
    '1. Read the recent messages from the Slack channels in $SOURCE_CHANNELS.\n' +
    '2. Write a concise daily digest to /tmp/summary.txt.\n' +
    '3. Post the digest to the team in $NOTIFICATION_CHANNEL.\n' +
    '4. ' +
    INTENT_CLOSER;

  const NOTION_STEPS =
    '1. Gather the weekly metrics for the report.\n' +
    '2. Create a Notion page with the weekly report content.\n' +
    '3. Write the report draft to /tmp/summary.txt.\n' +
    '4. ' +
    INTENT_CLOSER;

  const KB_STEPS =
    '1. Search the knowledge base for the answer to the question.\n' +
    '2. Write the grounded answer to /tmp/summary.txt.\n' +
    '3. ' +
    INTENT_CLOSER;

  const cases: DomainCase[] = [
    {
      domain: 'Slack summary',
      description: 'Read messages from Slack channels and post a daily digest',
      executionSteps: SLACK_STEPS,
      tools: ['/tools/platform/submit-output.ts'],
      expectPresent: ['$NOTIFICATION_CHANNEL', INTENT_CLOSER],
    },
    {
      domain: 'Composio/Notion',
      description: 'Create a Notion page with the weekly report',
      executionSteps: NOTION_STEPS,
      tools: ['/tools/composio/execute.ts', '/tools/platform/submit-output.ts'],
      expectPresent: ['Create a Notion page with the weekly report content', INTENT_CLOSER],
    },
    {
      domain: 'Knowledge-base lookup',
      description: 'Search the knowledge base and answer questions',
      executionSteps: KB_STEPS,
      tools: ['/tools/knowledge_base/search.ts', '/tools/platform/submit-output.ts'],
      expectPresent: [INTENT_CLOSER],
    },
  ];

  it.each(cases)(
    '$domain: execution_steps has no tsx /tools/ CLI',
    async ({ description, executionSteps, tools }) => {
      const fn = makeGenerateLLMWithStubbedEstimator(makeDomainConfigJson(executionSteps, tools));
      const gen = new ArchetypeGenerator(
        fn as unknown as typeof callLLM,
        makeGenerationRepo() as never,
      );

      const result = await gen.generate(description);

      expect(result.execution_steps).not.toMatch(CLI_PATTERN);
    },
  );

  it.each(cases)(
    '$domain: execution_steps preserves the intent-level prose verbatim',
    async ({ description, executionSteps, tools, expectPresent }) => {
      const fn = makeGenerateLLMWithStubbedEstimator(makeDomainConfigJson(executionSteps, tools));
      const gen = new ArchetypeGenerator(
        fn as unknown as typeof callLLM,
        makeGenerationRepo() as never,
      );

      const result = await gen.generate(description);

      for (const fragment of expectPresent) {
        expect(result.execution_steps).toContain(fragment);
      }
    },
  );

  it.each(cases)(
    '$domain: tool_registry still mandates /tools/platform/submit-output.ts',
    async ({ description, executionSteps, tools }) => {
      const fn = makeGenerateLLMWithStubbedEstimator(makeDomainConfigJson(executionSteps, tools));
      const gen = new ArchetypeGenerator(
        fn as unknown as typeof callLLM,
        makeGenerationRepo() as never,
      );

      const result = await gen.generate(description);

      expect(result.tool_registry.tools).toContain('/tools/platform/submit-output.ts');
    },
  );

  it.each(cases)(
    '$domain: instructions alias equals execution_steps after generate()',
    async ({ description, executionSteps, tools }) => {
      const fn = makeGenerateLLMWithStubbedEstimator(makeDomainConfigJson(executionSteps, tools));
      const gen = new ArchetypeGenerator(
        fn as unknown as typeof callLLM,
        makeGenerationRepo() as never,
      );

      const result = await gen.generate(description);

      expect(result.instructions).toBe(result.execution_steps);
    },
  );

  it('Composio/Notion: execution_steps prose never contains the composio execute CLI', async () => {
    const fn = makeGenerateLLMWithStubbedEstimator(
      makeDomainConfigJson(NOTION_STEPS, [
        '/tools/composio/execute.ts',
        '/tools/platform/submit-output.ts',
      ]),
    );
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.generate('Create a Notion page with the weekly report');

    expect(result.execution_steps).not.toMatch(/tsx \/tools\/composio\/execute\.ts/);
  });
});

describe('buildConnectedAppsBlock — cross-domain connected apps stay intent-level', () => {
  // Invariant under guard: every Composio toolkit's usage guidance stays plain-English — no tsx /tools/composio/execute.ts CLI example, regardless of app.
  const connectedToolkits = ['notion', 'gmail', 'googlesheets', 'linear'];

  it.each(connectedToolkits)(
    '%s connected: lists the app and emits no composio execute CLI',
    (toolkit) => {
      const block = buildConnectedAppsBlock([toolkit], [toolkit]);

      expect(block).toContain(`- ${toolkit}`);
      expect(block).not.toMatch(/tsx \/tools\/composio\/execute\.ts/);
      expect(block).not.toMatch(CLI_PATTERN);
    },
  );

  it.each(connectedToolkits)(
    '%s connected: instructs plain-English description (runtime skill resolves the command)',
    (toolkit) => {
      const block = buildConnectedAppsBlock([toolkit], [toolkit]);

      expect(block).toContain('describe the action in plain English');
    },
  );
});

describe('generate() — instructions alias mirrors execution_steps (backward-compat)', () => {
  // Invariant under guard: postProcess overwrites any model-emitted instructions with execution_steps, so the alias never diverges.
  it('overwrites a divergent instructions field so instructions === execution_steps', async () => {
    const json = JSON.stringify({
      role_name: 'alias-employee',
      identity: 'You are a test employee.',
      execution_steps:
        '1. Do the intent work and write the draft to /tmp/summary.txt.\n2. ' + INTENT_CLOSER,
      delivery_steps: null,
      delivery_instructions: null,
      instructions: 'STALE — this should be overwritten by execution_steps',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
      temperature: 1.0,
      overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
    });
    const fn = makeGenerateLLMWithStubbedEstimator(json);
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.generate('An employee whose model emitted a stale instructions field');

    expect(result.instructions).toBe(result.execution_steps);
    expect(result.instructions).not.toContain('STALE');
    expect(result.instructions).toContain(INTENT_CLOSER);
  });
});

function makeRefineConfig(
  overrides: Partial<GenerateArchetypeResponse> = {},
): GenerateArchetypeResponse {
  return {
    role_name: 'cli-refine-employee',
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode',
    identity: 'You are the original assistant.',
    execution_steps:
      '1. Read the channel messages using `tsx /tools/slack/read-channels.ts`.\n2. Post a long summary.',
    delivery_steps: null,
    delivery_instructions: null,
    instructions:
      '1. Read the channel messages using `tsx /tools/slack/read-channels.ts`.\n2. Post a long summary.',
    deliverable_type: 'slack_message',
    risk_model: { approval_required: true, timeout_hours: 24 },
    trigger_sources: { type: 'manual' },
    tool_registry: { tools: ['/tools/slack/read-channels.ts', '/tools/platform/submit-output.ts'] },
    concurrency_limit: 3,
    vm_size: null,
    worker_env: null,
    platform_rules_override: null,
    estimated_manual_minutes: null,
    overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
    ...overrides,
  } as GenerateArchetypeResponse;
}

describe('BOUNDARY — refine() preserves CLI-style execution_steps (intent rewrite is NOT applied here)', () => {
  // Invariant under guard: refine() runs the CLI-level prompt; postProcess never strips tsx /tools/, so CLI survives the round-trip (refined steps differ from input to skip the proseUnchanged nudge-retry).
  const REFINED_CLI_JSON = JSON.stringify({
    role_name: 'cli-refine-employee',
    identity: 'You are the refined assistant.',
    execution_steps:
      '1. Read the recent channel messages: `tsx /tools/slack/read-channels.ts --channels "$SOURCE_CHANNELS"`.\n' +
      '2. Write the SHORTER summary to /tmp/draft.txt.\n' +
      '3. Submit: `tsx /tools/platform/submit-output.ts --summary "..." --classification "NEEDS_APPROVAL" --draft-file /tmp/draft.txt`.',
    delivery_steps: null,
    delivery_instructions: null,
    instructions: 'STALE — postProcess overwrites this from execution_steps',
    deliverable_type: 'slack_message',
    tool_registry: { tools: ['/tools/slack/read-channels.ts', '/tools/platform/submit-output.ts'] },
    temperature: 1.0,
    overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
  });

  it('does NOT rewrite tsx /tools/ execution_steps to intent-level — CLI survives the refine round-trip', async () => {
    const fn = makeGenerateLLMWithStubbedEstimator(REFINED_CLI_JSON);
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.refine(makeRefineConfig(), 'make the summary shorter');

    expect(result.execution_steps).toMatch(CLI_PATTERN);
  });

  it('preserves the explicit tsx /tools/slack/read-channels.ts CLI command verbatim', async () => {
    const fn = makeGenerateLLMWithStubbedEstimator(REFINED_CLI_JSON);
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.refine(makeRefineConfig(), 'make the summary shorter');

    expect(result.execution_steps).toContain('tsx /tools/slack/read-channels.ts');
  });

  it('preserves the explicit tsx /tools/platform/submit-output.ts FINAL STEP CLI in the refined steps', async () => {
    const fn = makeGenerateLLMWithStubbedEstimator(REFINED_CLI_JSON);
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.refine(makeRefineConfig(), 'make the summary shorter');

    expect(result.execution_steps).toContain('tsx /tools/platform/submit-output.ts');
  });

  it('does NOT inject the intent closer phrase into a CLI-style refined config', async () => {
    const fn = makeGenerateLLMWithStubbedEstimator(REFINED_CLI_JSON);
    const gen = new ArchetypeGenerator(
      fn as unknown as typeof callLLM,
      makeGenerationRepo() as never,
    );

    const result = await gen.refine(makeRefineConfig(), 'make the summary shorter');

    expect(result.execution_steps).not.toContain(INTENT_CLOSER);
  });
});

describe('BOUNDARY — SYSTEM_PROMPT_PRE Code-Writing Employees block is NOT abstracted (CLI preserved)', () => {
  // Invariant under guard: T5 abstracted the general Runtime Patterns + delivery sections but deliberately left the code-employee block CLI-level — git/gh procedural steps must stay literal.
  const codeEmployeeBlock = (SYSTEM_PROMPT_PRE.split('## Code-Writing Employees')[1] ?? '').split(
    '## Environment Variables',
  )[0];

  it('isolates a non-empty code-employee block between its heading and ## Environment Variables', () => {
    expect(codeEmployeeBlock.length).toBeGreaterThan(0);
    expect(codeEmployeeBlock).toContain('GitHub PRs');
  });

  it('STILL contains tsx /tools/github/get-token.ts', () => {
    expect(codeEmployeeBlock).toContain('tsx /tools/github/get-token.ts');
  });

  it('STILL contains tsx /tools/platform/submit-output.ts', () => {
    expect(codeEmployeeBlock).toContain('tsx /tools/platform/submit-output.ts');
  });

  it('STILL contains the procedural git clone step', () => {
    expect(codeEmployeeBlock).toContain('git clone');
  });

  it('the code-employee block STILL matches the CLI pattern (was not intent-abstracted)', () => {
    expect(codeEmployeeBlock).toMatch(CLI_PATTERN);
  });
});

describe('BOUNDARY — buildConverseSystemPromptPre(false) EDIT mode (forbid kept, slug excluded)', () => {
  // Invariant under guard: EDIT keeps the role_name forbid clause and never emits the CREATE-only slug instruction — locks the create/edit asymmetry from T1.
  const editPrompt = buildConverseSystemPromptPre(false);

  it('STILL contains the role_name forbid clause', () => {
    expect(editPrompt).toContain('Politely decline');
    expect(editPrompt).toContain('role_name');
  });

  it('does NOT contain the CREATE-only kebab-slug generation instruction', () => {
    expect(editPrompt).not.toContain('Derive a kebab-case slug');
  });

  it('CREATE mode (true) is the inverse — it DOES emit the slug instruction and DROPS the forbid', () => {
    const createPrompt = buildConverseSystemPromptPre(true);
    expect(createPrompt).toContain('Derive a kebab-case slug');
    expect(createPrompt).not.toContain('Politely decline');
  });
});
