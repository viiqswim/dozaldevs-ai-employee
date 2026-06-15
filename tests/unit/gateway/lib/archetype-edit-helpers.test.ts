import { describe, it, expect } from 'vitest';
import {
  mapArchetypeRowToConfig,
  validateProposalFields,
  resolveToolPaths,
} from '../../../../src/gateway/lib/archetype-edit-helpers.js';
import type { StrippedProposal } from '../../../../src/gateway/lib/archetype-edit-helpers.js';

const VALID_TOOL = '/tools/platform/submit-output.ts';

function makeBaseline() {
  return mapArchetypeRowToConfig({
    role_name: 'test-employee',
    model: 'deepseek/deepseek-v4-flash',
    identity: 'You are a helpful assistant.',
    execution_steps: 'Do the task.',
    delivery_steps: null,
    execution_instructions: 'Run it',
    delivery_instructions: null,
    deliverable_type: null,
    risk_model: { approval_required: false, timeout_hours: 2 },
    trigger_sources: { type: 'manual' },
    tool_registry: { tools: [VALID_TOOL] },
    overview: {
      role: 'assistant',
      trigger: 'manual',
      workflow: [],
      tools_used: '',
      output: '',
      approval: '',
    },
    input_schema: null,
    worker_env: null,
    vm_size: null,
    concurrency_limit: 3,
    platform_rules_override: null,
    estimated_manual_minutes: null,
  });
}

describe('mapArchetypeRowToConfig', () => {
  it('maps all fields correctly', () => {
    const row = {
      role_name: 'my-employee',
      model: 'minimax/minimax-m2.7',
      identity: 'I am an employee.',
      execution_steps: 'Step 1. Step 2.',
      delivery_steps: 'Deliver it.',
      execution_instructions: 'Execute now',
      delivery_instructions: 'Deliver now',
      deliverable_type: 'slack_message',
      risk_model: { approval_required: true, timeout_hours: 48 },
      trigger_sources: { type: 'scheduled', cron: '0 8 * * 1-5', timezone: 'UTC' },
      tool_registry: { tools: [VALID_TOOL] },
      overview: {
        role: 'employee',
        trigger: 'scheduled',
        workflow: ['step1'],
        tools_used: 'slack',
        output: 'message',
        approval: 'required',
      },
      input_schema: [
        { key: 'topic', label: 'Topic', type: 'text', frequency: 'once', required: true },
      ],
      worker_env: { MY_VAR: 'value' },
      vm_size: 'performance-1x',
      concurrency_limit: 2,
      platform_rules_override: 'custom rules',
      estimated_manual_minutes: 30,
    };

    const result = mapArchetypeRowToConfig(row);

    expect(result.role_name).toBe('my-employee');
    expect(result.model).toBe('minimax/minimax-m2.7');
    expect(result.runtime).toBe('opencode');
    expect(result.identity).toBe('I am an employee.');
    expect(result.execution_steps).toBe('Step 1. Step 2.');
    expect(result.delivery_steps).toBe('Deliver it.');
    expect(result.delivery_instructions).toBe('Deliver now');
    expect(result.instructions).toBe('Execute now');
    expect(result.deliverable_type).toBe('slack_message');
    expect(result.risk_model.approval_required).toBe(true);
    expect(result.risk_model.timeout_hours).toBe(48);
    expect(result.trigger_sources).toEqual({
      type: 'scheduled',
      cron: '0 8 * * 1-5',
      timezone: 'UTC',
    });
    expect(result.tool_registry.tools).toEqual([VALID_TOOL]);
    expect(result.input_schema).toEqual([
      { key: 'topic', label: 'Topic', type: 'text', frequency: 'once', required: true },
    ]);
    expect(result.worker_env).toEqual({ MY_VAR: 'value' });
    expect(result.vm_size).toBe('performance-1x');
    expect(result.concurrency_limit).toBe(2);
    expect(result.platform_rules_override).toBe('custom rules');
    expect(result.estimated_manual_minutes).toBe(30);
  });

  it('applies defaults for missing/null fields', () => {
    const result = mapArchetypeRowToConfig({
      role_name: 'minimal',
    });

    expect(result.model).toBe('deepseek/deepseek-v4-flash');
    expect(result.runtime).toBe('opencode');
    expect(result.identity).toBe('');
    expect(result.execution_steps).toBe('');
    expect(result.delivery_steps).toBeNull();
    expect(result.delivery_instructions).toBeNull();
    expect(result.deliverable_type).toBeNull();
    expect(result.risk_model.approval_required).toBe(false);
    expect(result.risk_model.timeout_hours).toBe(24);
    expect(result.trigger_sources).toEqual({ type: 'manual' });
    expect(result.tool_registry.tools).toEqual([]);
    expect(result.input_schema).toBeUndefined();
    expect(result.worker_env).toBeNull();
    expect(result.vm_size).toBeNull();
    expect(result.concurrency_limit).toBe(1);
    expect(result.platform_rules_override).toBeNull();
    expect(result.estimated_manual_minutes).toBeNull();
  });

  it('coerces non-array input_schema to undefined', () => {
    const result = mapArchetypeRowToConfig({ role_name: 'x', input_schema: 'bad' });
    expect(result.input_schema).toBeUndefined();
  });

  it('coerces non-number concurrency_limit to 1', () => {
    const result = mapArchetypeRowToConfig({ role_name: 'x', concurrency_limit: 'bad' });
    expect(result.concurrency_limit).toBe(1);
  });
});

describe('validateProposalFields', () => {
  it('returns ok:true with validTools for a valid proposal', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Updated identity.',
      execution_steps: 'Updated steps.',
      tool_registry: { tools: [VALID_TOOL] },
      trigger_sources: { type: 'manual' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.validTools).toEqual([VALID_TOOL]);
    }
  });

  it('drops unknown tool silently and keeps ok:true (never-block)', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Updated identity.',
      execution_steps: 'Updated steps.',
      tool_registry: { tools: ['/tools/nonexistent/fake-tool.ts'] },
      trigger_sources: { type: 'manual' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.validTools).not.toContain('/tools/nonexistent/fake-tool.ts');
    }
  });

  it('returns reAsk when blanking a non-empty identity field', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: '',
      execution_steps: 'Updated steps.',
      trigger_sources: { type: 'manual' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reAsk).toBe(true);
      expect(result.fields).toContain('identity');
    }
  });

  it('returns reAsk when blanking a non-empty execution_steps field', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Valid identity.',
      execution_steps: '   ',
      trigger_sources: { type: 'manual' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reAsk).toBe(true);
      expect(result.fields).toContain('execution_steps');
    }
  });

  it('allows blanking delivery_steps when baseline delivery_steps is null', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Valid identity.',
      execution_steps: 'Valid steps.',
      delivery_steps: null,
      trigger_sources: { type: 'manual' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
  });

  it('coerces malformed trigger_sources to manual and keeps ok:true (never-block)', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Valid identity.',
      execution_steps: 'Valid steps.',
      trigger_sources: { type: 'scheduled' } as never,
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
  });

  it('drops invalid input_schema items and keeps ok:true (never-block)', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Valid identity.',
      execution_steps: 'Valid steps.',
      trigger_sources: { type: 'manual' },
      input_schema: [
        {
          key: 'INVALID KEY WITH SPACES',
          label: 'Bad Key',
          type: 'text' as const,
          frequency: 'once' as const,
          required: true,
        },
      ],
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
  });

  it('returns reAsk when multiple prose fields would go blank', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: '',
      execution_steps: '',
      tool_registry: { tools: ['/tools/fake/nonexistent.ts'] },
      trigger_sources: { type: 'manual' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reAsk).toBe(true);
      expect(result.fields).toContain('identity');
      expect(result.fields).toContain('execution_steps');
    }
  });

  it('accepts a valid scheduled trigger with cron', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Valid identity.',
      execution_steps: 'Valid steps.',
      trigger_sources: { type: 'scheduled', cron: '0 8 * * 1-5' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
  });

  it('accepts a valid webhook trigger', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Valid identity.',
      execution_steps: 'Valid steps.',
      trigger_sources: { type: 'webhook', event_type: 'NEW_MESSAGE' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
  });

  it('skips trigger validation when trigger_sources is unchanged', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Valid identity.',
      execution_steps: 'Valid steps.',
      trigger_sources: { type: 'manual' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
  });

  it('returns empty validTools when no tool_registry in proposal', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Valid identity.',
      execution_steps: 'Valid steps.',
      trigger_sources: { type: 'manual' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.validTools).toEqual([]);
    }
  });

  it('tool drop keeps ok:true and drops bogus tool from validTools', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Updated identity.',
      execution_steps: 'Updated steps.',
      tool_registry: { tools: [VALID_TOOL, '/tools/bogus/does-not-exist.ts'] },
      trigger_sources: { type: 'manual' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.validTools).toEqual([VALID_TOOL]);
      expect(result.validTools).not.toContain('/tools/bogus/does-not-exist.ts');
    }
  });

  it('bad trigger coerced to manual — ok:true', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Valid identity.',
      execution_steps: 'Valid steps.',
      trigger_sources: { type: 'scheduled' } as never,
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
  });

  it('partial input_schema salvaged — valid item kept, invalid item dropped, ok:true', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: 'Valid identity.',
      execution_steps: 'Valid steps.',
      trigger_sources: { type: 'manual' },
      input_schema: [
        { key: 'good_key', label: 'Good', type: 'text', frequency: 'once', required: true },
        { key: 'INVALID KEY', label: 'Bad', type: 'text', frequency: 'once', required: true },
      ],
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(true);
  });

  it('prose-blank on EDIT returns reAsk variant not a 422 error', () => {
    const baseline = makeBaseline();
    const proposal: StrippedProposal = {
      identity: '',
      execution_steps: 'Updated steps.',
      trigger_sources: { type: 'manual' },
    };

    const result = validateProposalFields(proposal, baseline, [], []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reAsk).toBe(true);
      expect(result.fields).toContain('identity');
    }
  });
});

describe('resolveToolPaths', () => {
  it('resolves /tools/slack/read-channels (no .ts) to /tools/slack/read-channels.ts', () => {
    const result = resolveToolPaths(['/tools/slack/read-channels']);
    expect(result.resolved).toEqual(['/tools/slack/read-channels.ts']);
    expect(result.dropped).toEqual([]);
  });

  it('resolves bare slack/read-channels to /tools/slack/read-channels.ts', () => {
    const result = resolveToolPaths(['slack/read-channels']);
    expect(result.resolved).toEqual(['/tools/slack/read-channels.ts']);
    expect(result.dropped).toEqual([]);
  });

  it('resolves tsx /tools/slack/read-channels.ts by stripping tsx prefix', () => {
    const result = resolveToolPaths(['tsx /tools/slack/read-channels.ts']);
    expect(result.resolved).toEqual(['/tools/slack/read-channels.ts']);
    expect(result.dropped).toEqual([]);
  });

  it('leaves an already-valid /tools/platform/submit-output.ts unchanged (idempotent)', () => {
    const result = resolveToolPaths(['/tools/platform/submit-output.ts']);
    expect(result.resolved).toEqual(['/tools/platform/submit-output.ts']);
    expect(result.dropped).toEqual([]);
  });

  it('drops /tools/nonexistent/foo with a human-readable reason', () => {
    const result = resolveToolPaths(['/tools/nonexistent/foo']);
    expect(result.resolved).toEqual([]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].tool).toBe('/tools/nonexistent/foo');
    expect(result.dropped[0].reason).toBeTruthy();
  });

  it('drops /tools/composio/notion when connectedToolkits=[] without mangling to .ts', () => {
    const result = resolveToolPaths(['/tools/composio/notion'], undefined, []);
    expect(result.resolved).toEqual([]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].tool).toBe('/tools/composio/notion');
    expect(result.dropped[0].reason).not.toContain('/tools/composio/notion.ts');
  });

  it('keeps /tools/composio/notion as-is when connectedToolkits includes notion', () => {
    const result = resolveToolPaths(['/tools/composio/notion'], undefined, ['notion']);
    expect(result.resolved).toEqual(['/tools/composio/notion']);
    expect(result.dropped).toEqual([]);
  });
});
