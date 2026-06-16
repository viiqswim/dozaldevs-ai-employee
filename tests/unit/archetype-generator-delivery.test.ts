// RED-phase TDD: cases (a) and (c) are EXPECTED to fail until the generator
// delivery-default fix lands. Do not "fix" by deleting these tests.
import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../src/lib/call-llm.js';
import { ArchetypeGenerator } from '../../src/gateway/services/archetype-generator.js';

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

const DESCRIPTION = 'A helper that processes records and notifies a channel';

function makeRawModelOutput(overrides: {
  deliverable_type: string | null;
  delivery_steps: string | null;
  delivery_instructions: string | null;
}): string {
  return JSON.stringify({
    role_name: 'Record Notifier',
    identity: 'You are a record-processing helper.',
    execution_steps: 'Read the records.\nProcess them.\nHand off the result for review.',
    deliverable_type: overrides.deliverable_type,
    delivery_steps: overrides.delivery_steps,
    delivery_instructions: overrides.delivery_instructions,
    risk_model: { approval_required: true, timeout_hours: 24 },
    trigger_sources: { type: 'manual' },
    tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
    overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
  });
}

describe('postProcess() delivery_steps default derivation (via generate())', () => {
  it('(a) BUG CASE: deliverable_type set + model returns delivery_steps:null → derives a non-null default', async () => {
    const raw = makeRawModelOutput({
      deliverable_type: 'slack_message',
      delivery_steps: null,
      delivery_instructions: 'Publish the approved content somewhere.',
    });
    const gen = new ArchetypeGenerator(makeRoutingLLM(raw) as unknown as typeof callLLM);

    const result = await gen.generate(DESCRIPTION);

    expect(typeof result.delivery_steps).toBe('string');
    expect(result.delivery_steps).toBeTruthy();
    expect((result.delivery_steps as string).length).toBeGreaterThan(0);
  });

  it('(b) ESCAPE HATCH: deliverable_type null + delivery_steps null → stays null (preserved)', async () => {
    const raw = makeRawModelOutput({
      deliverable_type: null,
      delivery_steps: null,
      delivery_instructions: null,
    });
    const gen = new ArchetypeGenerator(makeRoutingLLM(raw) as unknown as typeof callLLM);

    const result = await gen.generate(DESCRIPTION);

    expect(result.delivery_steps).toBeNull();
  });

  it('(c) MIRROR RULE BUG: deliverable_type set + delivery_steps null + delivery_instructions null → still derives a default', async () => {
    const raw = makeRawModelOutput({
      deliverable_type: 'slack_message',
      delivery_steps: null,
      delivery_instructions: null,
    });
    const gen = new ArchetypeGenerator(makeRoutingLLM(raw) as unknown as typeof callLLM);

    const result = await gen.generate(DESCRIPTION);

    expect(typeof result.delivery_steps).toBe('string');
    expect(result.delivery_steps).toBeTruthy();
    expect((result.delivery_steps as string).length).toBeGreaterThan(0);
  });
});
