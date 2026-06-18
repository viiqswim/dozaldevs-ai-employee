import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../../../src/lib/call-llm.js';
import {
  ArchetypeGenerator,
  type GenerateArchetypeResponse,
} from '../../../../src/gateway/services/archetype-generator.js';

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

function makeRepo() {
  return {
    record: vi.fn(async () => ({ id: 'call-1' })),
    linkArchetype: vi.fn(async () => undefined),
  };
}

function makeLLM(executionSteps: string, existingTools: string[] = []) {
  const payload = JSON.stringify({
    role_name: 'test-employee',
    identity: 'You are a test employee.',
    execution_steps: executionSteps,
    delivery_steps: 'Deliver the result.',
    instructions: executionSteps,
    deliverable_type: 'report',
    tool_registry: { tools: existingTools },
    temperature: 1.0,
    overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
  });

  return vi.fn(
    async (
      opts: Record<string, unknown> & { messages?: Array<{ role: string; content: string }> },
    ) => {
      const systemContent =
        (opts.messages as Array<{ role: string; content: string }>)?.[0]?.content ?? '';
      if (systemContent.startsWith(ESTIMATOR_SYSTEM_PREFIX)) {
        return makeResult('15');
      }
      return makeResult(payload);
    },
  );
}

describe('ArchetypeGenerator — Composio tool auto-attach', () => {
  it('attaches /tools/composio/execute.ts when execution_steps mention "notion"', async () => {
    const llm = makeLLM('Read the Notion page and extract the cleaning schedule.');
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, makeRepo() as never);

    const result = await gen.generate('An employee that reads a Notion page');

    expect(result.tool_registry.tools).toContain('/tools/composio/execute.ts');
  });

  it('does NOT attach composio tool when execution_steps have no Composio keywords', async () => {
    const llm = makeLLM('Read the Slack channel and post a summary.');
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, makeRepo() as never);

    const result = await gen.generate('An employee that summarizes Slack channels');

    expect(result.tool_registry.tools).not.toContain('/tools/composio/execute.ts');
  });

  it('does NOT duplicate composio tool if already present in tool_registry', async () => {
    const llm = makeLLM('Read the Notion page for context.', [
      '/tools/platform/submit-output.ts',
      '/tools/composio/execute.ts',
    ]);
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, makeRepo() as never);

    const result = await gen.generate('An employee that reads a Notion page');

    const composioCount = result.tool_registry.tools.filter(
      (t: string) => t === '/tools/composio/execute.ts',
    ).length;
    expect(composioCount).toBe(1);
  });

  it('attaches composio tool when execution_steps mention "google sheet" (multi-word keyword)', async () => {
    const llm = makeLLM('Look up the property assignments in the Google Sheet.');
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, makeRepo() as never);

    const result = await gen.generate('An employee that reads a Google Sheet');

    expect(result.tool_registry.tools).toContain('/tools/composio/execute.ts');
  });

  it('keyword match is case-insensitive', async () => {
    const llm = makeLLM('Fetch tasks from LINEAR and update status.');
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, makeRepo() as never);

    const result = await gen.generate('An employee that updates Linear tasks');

    expect(result.tool_registry.tools).toContain('/tools/composio/execute.ts');
  });

  it('creates tool_registry with composio tool when registry is missing and keyword matches', async () => {
    const payload = JSON.stringify({
      role_name: 'test-employee',
      identity: 'You are a test employee.',
      execution_steps: 'Read the Airtable base and compile a report.',
      delivery_steps: 'Post to Slack.',
      instructions: 'Read the Airtable base and compile a report.',
      deliverable_type: 'report',
      temperature: 1.0,
      overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
    });

    const llm = vi.fn(
      async (
        opts: Record<string, unknown> & { messages?: Array<{ role: string; content: string }> },
      ) => {
        const systemContent =
          (opts.messages as Array<{ role: string; content: string }>)?.[0]?.content ?? '';
        if (systemContent.startsWith(ESTIMATOR_SYSTEM_PREFIX)) {
          return makeResult('15');
        }
        return makeResult(payload);
      },
    );

    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, makeRepo() as never);
    const result = await gen.generate('An employee that reads Airtable');

    expect(result.tool_registry.tools).toContain('/tools/composio/execute.ts');
  });

  it('refine() also auto-attaches composio tool through postProcess', async () => {
    const llm = makeLLM('Pull the latest data from HubSpot and generate a report.');
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, makeRepo() as never);

    const baseline: GenerateArchetypeResponse = {
      role_name: 'crm-reporter',
      model: 'deepseek/deepseek-v4-flash',
      runtime: 'opencode',
      identity: 'You are a CRM reporting employee.',
      execution_steps: 'Pull the latest data from HubSpot and generate a report.',
      delivery_steps: null,
      delivery_instructions: null,
      instructions: 'Pull the latest data from HubSpot and generate a report.',
      deliverable_type: null,
      risk_model: { approval_required: true, timeout_hours: 24 },
      trigger_sources: { type: 'manual' },
      tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
      concurrency_limit: 3,
      vm_size: null,
      worker_env: null,
      platform_rules_override: null,
      estimated_manual_minutes: null,
      overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
    } as GenerateArchetypeResponse;

    const result = await gen.refine(baseline, 'Also include deal pipeline data');

    expect(result.tool_registry.tools).toContain('/tools/composio/execute.ts');
  });
});
