import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../../../src/lib/call-llm.js';
import {
  ArchetypeGenerator,
  type GenerateArchetypeResponse,
  type ConverseMessage,
} from '../../../../src/gateway/services/archetype-generator.js';

const ESTIMATOR_SYSTEM_PREFIX = 'You estimate manual task duration';

function makeResult(content: string) {
  return {
    content,
    model: 'deepseek/deepseek-v4-flash',
    promptTokens: 10,
    completionTokens: 10,
    estimatedCostUsd: 0,
    latencyMs: 1,
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

function makeConverseRoutingMock(converseResponse: string) {
  const fn = vi.fn(async (opts: { messages?: Array<{ role: string; content: string }> }) => {
    const systemContent = opts.messages?.[0]?.content ?? '';
    if (systemContent.startsWith(ESTIMATOR_SYSTEM_PREFIX)) {
      return makeResult('5');
    }
    return makeResult(converseResponse);
  });
  return fn;
}

function makeCapturingConverseMock(converseResponse: string) {
  const converseUserContents: string[] = [];
  const fn = vi.fn(async (opts: { messages?: Array<{ role: string; content: string }> }) => {
    const systemContent = opts.messages?.[0]?.content ?? '';
    if (systemContent.startsWith(ESTIMATOR_SYSTEM_PREFIX)) {
      return makeResult('5');
    }
    converseUserContents.push(opts.messages?.[1]?.content ?? '');
    return makeResult(converseResponse);
  });
  return { fn, converseUserContents };
}

function makeTranscript(assistantTurns: number): ConverseMessage[] {
  const t: ConverseMessage[] = [{ role: 'user', content: 'Initial request' }];
  for (let i = 0; i < assistantTurns; i++) {
    t.push({ role: 'assistant', content: `Clarifying question ${i + 1}?` });
    t.push({ role: 'user', content: `Answer ${i + 1}` });
  }
  return t;
}

const PROPOSAL_RESPONSE = JSON.stringify({
  kind: 'proposal',
  config: { ...makeConfig(), identity: 'You are a fully specified assistant.' },
});

describe('converse() — question path', () => {
  it('returns {kind:question} when LLM responds with a question, without calling applyModelAndEstimate', async () => {
    const questionResponse = JSON.stringify({ kind: 'question', question: 'Which field?' });
    const fn = makeConverseRoutingMock(questionResponse);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const transcript: ConverseMessage[] = [{ role: 'user', content: 'Change something' }];
    const result = await gen.converse(transcript, makeConfig());

    expect(result.kind).toBe('question');
    if (result.kind === 'question') {
      expect(result.question).toBe('Which field?');
    }

    const estimatorCalls = fn.mock.calls.filter((call) =>
      (
        call[0] as { messages?: Array<{ role: string; content: string }> }
      ).messages?.[0]?.content?.startsWith(ESTIMATOR_SYSTEM_PREFIX),
    );
    expect(estimatorCalls.length).toBe(0);
  });
});

describe('converse() — proposal path', () => {
  it('returns {kind:proposal} with baseline and processed proposal when LLM returns proposal', async () => {
    const updatedConfig = {
      ...makeConfig(),
      identity: 'You are a refined assistant.',
      execution_steps: 'Do the task efficiently.',
      instructions: 'Do the task efficiently.',
    };
    const proposalResponse = JSON.stringify({ kind: 'proposal', config: updatedConfig });
    const fn = makeConverseRoutingMock(proposalResponse);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const baseline = makeConfig();
    const transcript: ConverseMessage[] = [
      { role: 'user', content: 'Make the identity more refined' },
    ];
    const result = await gen.converse(transcript, baseline);

    expect(result.kind).toBe('proposal');
    if (result.kind === 'proposal') {
      expect(result.baseline).toBe(baseline);
      expect(result.proposal).toBeDefined();
      expect(result.proposal.identity).toBe('You are a refined assistant.');
      expect(result.changed_fields).toBeDefined();
      expect(result.changed_fields['identity']).toBeDefined();
    }

    const estimatorCalls = fn.mock.calls.filter((call) =>
      (
        call[0] as { messages?: Array<{ role: string; content: string }> }
      ).messages?.[0]?.content?.startsWith(ESTIMATOR_SYSTEM_PREFIX),
    );
    expect(estimatorCalls.length).toBeGreaterThan(0);
  });
});

describe('converse() — 5-question backstop', () => {
  it('coerces to no_change when 5 assistant turns already exist and LLM still returns question', async () => {
    const questionResponse = JSON.stringify({ kind: 'question', question: 'Another question?' });
    const fn = makeConverseRoutingMock(questionResponse);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const transcript: ConverseMessage[] = [
      { role: 'user', content: 'Change X' },
      { role: 'assistant', content: 'What do you mean by X?' },
      { role: 'user', content: 'Something about X' },
      { role: 'assistant', content: 'Which part of X?' },
      { role: 'user', content: 'The first part' },
      { role: 'assistant', content: 'Can you clarify the first part?' },
      { role: 'user', content: 'The very first sentence' },
      { role: 'assistant', content: 'Should it be formal or informal?' },
      { role: 'user', content: 'Formal' },
      { role: 'assistant', content: 'What tone exactly?' },
      { role: 'user', content: 'Professional' },
    ];

    const result = await gen.converse(transcript, makeConfig());

    expect(result.kind).not.toBe('question');
    expect(result.kind).toBe('no_change');
  });

  it('forces a proposal (never a question) once 5 assistant turns exist and the LLM cooperates', async () => {
    const { fn } = makeCapturingConverseMock(PROPOSAL_RESPONSE);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const result = await gen.converse(makeTranscript(5), makeConfig());

    expect(result.kind).toBe('proposal');
    expect(result.kind).not.toBe('question');
  });

  it('injects the "you MUST now produce a proposal" directive into the prompt when backstop is active', async () => {
    const { fn, converseUserContents } = makeCapturingConverseMock(PROPOSAL_RESPONSE);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    await gen.converse(makeTranscript(5), makeConfig());

    expect(converseUserContents).toHaveLength(1);
    expect(converseUserContents[0]).toMatch(/you must now produce a proposal/i);
    expect(converseUserContents[0]).toMatch(/do not ask another question/i);
  });

  it('does NOT inject the backstop directive below the threshold (4 assistant turns)', async () => {
    const questionResponse = JSON.stringify({ kind: 'question', question: 'One more thing?' });
    const { fn, converseUserContents } = makeCapturingConverseMock(questionResponse);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const result = await gen.converse(makeTranscript(4), makeConfig());

    expect(result.kind).toBe('question');
    expect(converseUserContents[0]).not.toMatch(/you must now produce a proposal/i);
  });

  it('never returns a question once backstop is active, regardless of which kind the LLM emits', async () => {
    const questionResponse = JSON.stringify({ kind: 'question', question: 'Yet another?' });
    const fn = makeConverseRoutingMock(questionResponse);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const sixTurns = await gen.converse(makeTranscript(6), makeConfig());
    expect(sixTurns.kind).not.toBe('question');

    const tenTurns = await gen.converse(makeTranscript(10), makeConfig());
    expect(tenTurns.kind).not.toBe('question');
  });
});

describe('converse() — token budget guard', () => {
  it('returns {kind:too_long} without calling LLM when estimated tokens exceed CONVERSE_TOKEN_BUDGET', async () => {
    const fn = vi.fn(async () => makeResult('should not be called'));
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const hugeMessage = 'x'.repeat(240_001 * 4);
    const transcript: ConverseMessage[] = [{ role: 'user', content: hugeMessage }];

    const result = await gen.converse(transcript, makeConfig());

    expect(result.kind).toBe('too_long');
    expect(fn).not.toHaveBeenCalled();
  });
});
