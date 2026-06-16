import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../../../src/lib/call-llm.js';
import {
  ArchetypeGenerator,
  type GenerateArchetypeResponse,
  type ConverseMessage,
} from '../../../../src/gateway/services/archetype-generator.js';

const ESTIMATOR_SYSTEM_PREFIX = 'You estimate manual task duration';

const VALID_JSON = JSON.stringify({
  role_name: 'Test',
  identity: 'You are a test employee.',
  execution_steps: 'Do the task.',
  delivery_steps: 'Deliver the result.',
  instructions: 'Do the task.',
  deliverable_type: 'report',
  tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
  temperature: 1.0,
  overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
});

const VALID_CONVERSE_PROPOSAL = JSON.stringify({
  kind: 'proposal',
  question: null,
  changed_fields: ['identity'],
  baseline: {
    role_name: 'test-employee',
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
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode',
  },
  proposal: {
    role_name: 'test-employee',
    identity: 'You are an updated assistant.',
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
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode',
  },
});

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

function makeRepo() {
  return {
    record: vi.fn(async () => ({ id: 'call-1' })),
    linkArchetype: vi.fn(async () => undefined),
  };
}

function makeCaptureRoutingLLM(mainResponse: string) {
  const capturedOptions: Array<Record<string, unknown>> = [];

  const fn = vi.fn(
    async (
      opts: Record<string, unknown> & { messages?: Array<{ role: string; content: string }> },
    ) => {
      const systemContent =
        (opts.messages as Array<{ role: string; content: string }>)?.[0]?.content ?? '';
      if (systemContent.startsWith(ESTIMATOR_SYSTEM_PREFIX)) {
        return makeResult('15');
      }
      capturedOptions.push({ ...opts });
      return makeResult(mainResponse);
    },
  );

  return { fn, capturedOptions };
}

describe('ArchetypeGenerator — JSON mode symmetry regression', () => {
  it('generate() passes responseFormat: { type: "json_object" } to callLLMFn', async () => {
    const { fn, capturedOptions } = makeCaptureRoutingLLM(VALID_JSON);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM, makeRepo() as never);

    await gen.generate('A test employee that does X');

    expect(capturedOptions.length).toBeGreaterThan(0);
    const mainCall = capturedOptions[0];
    expect(mainCall?.responseFormat).toEqual({ type: 'json_object' });
  });

  it('refine() passes responseFormat: { type: "json_object" } to callLLMFn', async () => {
    const { fn, capturedOptions } = makeCaptureRoutingLLM(VALID_JSON);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM, makeRepo() as never);

    await gen.refine(makeConfig(), 'Make it better');

    expect(capturedOptions.length).toBeGreaterThan(0);
    const mainCall = capturedOptions[0];
    expect(mainCall?.responseFormat).toEqual({ type: 'json_object' });
  });

  it('converse() passes responseFormat: { type: "json_object" } to callLLMFn', async () => {
    const { fn, capturedOptions } = makeCaptureRoutingLLM(VALID_CONVERSE_PROPOSAL);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM, makeRepo() as never);

    const transcript: ConverseMessage[] = [{ role: 'user', content: 'Make it better' }];
    await gen.converse(transcript, makeConfig());

    expect(capturedOptions.length).toBeGreaterThan(0);
    const mainCall = capturedOptions[0];
    expect(mainCall?.responseFormat).toEqual({ type: 'json_object' });
  });
});
