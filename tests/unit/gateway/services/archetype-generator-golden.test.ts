import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../../../src/lib/call-llm.js';
import {
  ArchetypeGenerator,
  type GenerateArchetypeResponse,
} from '../../../../src/gateway/services/archetype-generator.js';
import { DEFAULT_DELIVERY_INSTRUCTIONS } from '../../../../src/lib/output-contract-constants.js';

// Tripwire guards: postProcess() is private and reached only via generate()/refine().
// They assert the current byte-identical normalization so any future over-reach breaks them.

const ESTIMATOR_SYSTEM_PREFIX = 'You estimate manual task duration';

function makeResult(content: string) {
  return {
    content,
    model: 'deepseek/deepseek-v4-flash',
    promptTokens: 10,
    completionTokens: 20,
    estimatedCostUsd: 0.001,
    latencyMs: 100,
  };
}

function makeRoutingLLM(mainResponse: string) {
  return vi.fn(async (opts: { messages?: Array<{ role: string; content: string }> }) => {
    const systemContent = opts.messages?.[0]?.content ?? '';
    if (systemContent.startsWith(ESTIMATOR_SYSTEM_PREFIX)) {
      return makeResult('5');
    }
    return makeResult(mainResponse);
  });
}

function makeConfig(overrides: Partial<GenerateArchetypeResponse> = {}): GenerateArchetypeResponse {
  return {
    role_name: 'test-employee',
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode',
    identity: 'You are a helpful assistant.',
    execution_steps: 'Do the task.',
    delivery_steps: null,
    delivery_instructions: null,
    instructions: 'Do the task.',
    deliverable_type: null,
    risk_model: { approval_required: true, timeout_hours: 24 },
    trigger_sources: { type: 'manual' },
    tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
    concurrency_limit: 3,
    vm_size: null,
    worker_env: null,
    platform_rules_override: null,
    estimated_manual_minutes: null,
    overview: {
      role: 'assistant',
      trigger: 'manual',
      workflow: [],
      tools_used: '',
      output: '',
      approval: '',
    },
    ...overrides,
  } as GenerateArchetypeResponse;
}

describe('postProcess() golden — tool path / trigger / prose normalization', () => {
  // Input deliberately mixes all four tool-path formats postProcess handles + the legacy cron trigger.
  const RAW_MODEL_OUTPUT = JSON.stringify({
    role_name: 'Daily Digest Bot',
    identity: 'You are the Daily Digest correspondent.',
    execution_steps: 'Read channels.\nSummarize the activity.\nSubmit the digest for review.',
    deliverable_type: 'report',
    risk_model: { approval_required: true, timeout_hours: 24 },
    trigger_sources: { type: 'cron', expression: '0 8 * * *' },
    tool_registry: {
      tools: [
        'slack/post-message',
        'tsx /tools/knowledge_base/search.ts',
        '/tools/platform/submit-output.ts',
        'tsx slack/read-channels',
      ],
    },
    overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
  });

  const DESCRIPTION = 'Summarize daily channel activity and post a digest report';

  it('normalizes the mixed tool-path formats to exact, byte-identical /tools/*.ts paths', async () => {
    const gen = new ArchetypeGenerator(
      makeRoutingLLM(RAW_MODEL_OUTPUT) as unknown as typeof callLLM,
    );
    const result = await gen.generate(DESCRIPTION);

    expect(result.tool_registry.tools).toEqual([
      '/tools/slack/post-message.ts',
      '/tools/knowledge_base/search.ts',
      '/tools/platform/submit-output.ts',
      '/tools/slack/read-channels.ts',
    ]);
  });

  it('maps the legacy cron trigger to the scheduled form, byte-identical', async () => {
    const gen = new ArchetypeGenerator(
      makeRoutingLLM(RAW_MODEL_OUTPUT) as unknown as typeof callLLM,
    );
    const result = await gen.generate(DESCRIPTION);

    expect(result.trigger_sources).toEqual({ type: 'scheduled', cron: '0 8 * * *' });
  });

  it('passes prose through verbatim and mirrors execution_steps into instructions', async () => {
    const gen = new ArchetypeGenerator(
      makeRoutingLLM(RAW_MODEL_OUTPUT) as unknown as typeof callLLM,
    );
    const result = await gen.generate(DESCRIPTION);

    expect(result.identity).toBe('You are the Daily Digest correspondent.');
    expect(result.execution_steps).toBe(
      'Read channels.\nSummarize the activity.\nSubmit the digest for review.',
    );
    expect(result.instructions).toBe(result.execution_steps);
  });

  it('derives a kebab-case role_name and forces runtime to opencode', async () => {
    const gen = new ArchetypeGenerator(
      makeRoutingLLM(RAW_MODEL_OUTPUT) as unknown as typeof callLLM,
    );
    const result = await gen.generate(DESCRIPTION);

    expect(result.role_name).toBe('daily-digest-bot');
    expect(result.runtime).toBe('opencode');
  });

  it('produces a stable golden snapshot of every postProcess-owned field', async () => {
    const gen = new ArchetypeGenerator(
      makeRoutingLLM(RAW_MODEL_OUTPUT) as unknown as typeof callLLM,
    );
    const result = await gen.generate(DESCRIPTION);

    const golden = {
      role_name: result.role_name,
      runtime: result.runtime,
      identity: result.identity,
      execution_steps: result.execution_steps,
      instructions: result.instructions,
      trigger_sources: result.trigger_sources,
      tools: result.tool_registry.tools,
    };

    expect(golden).toMatchInlineSnapshot(`
      {
        "execution_steps": "Read channels.
      Summarize the activity.
      Submit the digest for review.",
        "identity": "You are the Daily Digest correspondent.",
        "instructions": "Read channels.
      Summarize the activity.
      Submit the digest for review.",
        "role_name": "daily-digest-bot",
        "runtime": "opencode",
        "tools": [
          "/tools/slack/post-message.ts",
          "/tools/knowledge_base/search.ts",
          "/tools/platform/submit-output.ts",
          "/tools/slack/read-channels.ts",
        ],
        "trigger_sources": {
          "cron": "0 8 * * *",
          "type": "scheduled",
        },
      }
    `);
  });
});

describe('refine() round-trip — CLI-style config is preserved', () => {
  it('leaves already-normalized /tools/*.ts paths byte-identical while applying the prose edit', async () => {
    const previousConfig = makeConfig({
      identity: 'OLD identity',
      execution_steps: 'OLD steps',
      tool_registry: {
        tools: ['/tools/slack/post-message.ts', '/tools/platform/submit-output.ts'],
      },
    });

    const editedResponse = JSON.stringify({
      ...previousConfig,
      identity: 'NEW friendlier identity',
      execution_steps: 'NEW steps',
    });

    const gen = new ArchetypeGenerator(makeRoutingLLM(editedResponse) as unknown as typeof callLLM);
    const result = await gen.refine(previousConfig, 'make the identity friendlier');

    expect(result.tool_registry.tools).toEqual([
      '/tools/slack/post-message.ts',
      '/tools/platform/submit-output.ts',
    ]);
    expect(result.identity).toBe('NEW friendlier identity');
    expect(result.execution_steps).toBe('NEW steps');
  });

  it('is idempotent on a pure echo: an unchanged config round-trips byte-identical through the retry path', async () => {
    const previousConfig = makeConfig({
      identity: 'You are a stable assistant.',
      execution_steps: 'Step one.\nStep two.',
      tool_registry: {
        tools: [
          '/tools/slack/post-message.ts',
          '/tools/knowledge_base/search.ts',
          '/tools/platform/submit-output.ts',
        ],
      },
    });

    // Echoing the config unchanged exercises refine()'s proseUnchanged retry path; result must still match.
    const echoResponse = JSON.stringify(previousConfig);

    const gen = new ArchetypeGenerator(makeRoutingLLM(echoResponse) as unknown as typeof callLLM);
    const result = await gen.refine(previousConfig, 'no real change');

    expect(result.tool_registry.tools).toEqual(previousConfig.tool_registry.tools);
    expect(result.identity).toBe(previousConfig.identity);
    expect(result.execution_steps).toBe(previousConfig.execution_steps);
    expect(result.delivery_steps).toBe(DEFAULT_DELIVERY_INSTRUCTIONS);
  });
});
