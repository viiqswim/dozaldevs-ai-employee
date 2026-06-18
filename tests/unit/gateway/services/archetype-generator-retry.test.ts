import { describe, it, expect, vi, beforeEach } from 'vitest';

const { logMock } = vi.hoisted(() => {
  const m = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
  (m.child as ReturnType<typeof vi.fn>).mockReturnValue(m);
  return { logMock: m };
});

vi.mock('../../../../src/lib/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/lib/logger.js')>();
  return {
    ...actual,
    createLogger: () => logMock,
    taskLogger: () => logMock,
  };
});

import type { callLLM } from '../../../../src/lib/call-llm.js';
import {
  ArchetypeGenerator,
  type GenerateArchetypeResponse,
  type ConverseMessage,
} from '../../../../src/gateway/services/archetype-generator.js';
import { PLUMBING_JUDGE_SYSTEM_PROMPT } from '../../../../src/gateway/services/prompts/archetype-generator-prompts.js';

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

function makeValidArchetypeJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    role_name: 'test-employee',
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode',
    identity: 'You are a helpful assistant.',
    execution_steps: 'Read messages and summarize them.',
    delivery_steps: 'Post the approved summary to the team notification channel.',
    instructions: 'Read messages and summarize them.',
    deliverable_type: 'slack_message',
    risk_model: { approval_required: true, timeout_hours: 24 },
    trigger_sources: { type: 'manual' },
    tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
    concurrency_limit: 3,
    vm_size: null,
    worker_env: null,
    platform_rules_override: null,
    estimated_manual_minutes: null,
    overview: {
      role: 'Summarizer',
      trigger: 'manual',
      workflow: ['Read messages', 'Summarize', 'Submit for review'],
      tools_used: 'Slack',
      output: 'Summary',
      approval: 'Required',
    },
    ...overrides,
  });
}

function makeLeakJson(): string {
  return makeValidArchetypeJson({
    execution_steps:
      'Run tsx /tools/slack/read-channels.ts --channel C0B71QSMZKQ to read messages.',
    delivery_steps: 'Post to C0B71QSMZKQ using /tools/slack/post-message.ts',
  });
}

function makeCleanJson(): string {
  return makeValidArchetypeJson({
    execution_steps: 'Read messages from the team channel and summarize key themes.',
    delivery_steps: 'Post the approved summary to the team notification channel.',
  });
}

function makeJudgeResponse(hasLeak: boolean, fields: string[] = [], snippets: string[] = []) {
  return JSON.stringify({ has_leak: hasLeak, fields, snippets });
}

function makeConfig(overrides: Partial<GenerateArchetypeResponse> = {}): GenerateArchetypeResponse {
  return {
    role_name: 'test-employee',
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode',
    identity: 'You are a helpful assistant.',
    execution_steps: 'Do the task.',
    delivery_steps: null,
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

function isJudgeCall(opts: Parameters<typeof callLLM>[0]): boolean {
  return opts.messages?.[0]?.content === PLUMBING_JUDGE_SYSTEM_PROMPT;
}

function isEstimatorCall(opts: Parameters<typeof callLLM>[0]): boolean {
  return (opts.messages?.[0]?.content ?? '').startsWith(ESTIMATOR_SYSTEM_PREFIX);
}

describe('ArchetypeGenerator.validateAndRetryProse via generate()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns clean result immediately when judge finds no leak — LLM called twice (generate + judge)', async () => {
    const mockFn = vi.fn(async (opts: Parameters<typeof callLLM>[0]) => {
      if (isEstimatorCall(opts)) return makeResult('5');
      if (isJudgeCall(opts)) return makeResult(makeJudgeResponse(false));
      return makeResult(makeCleanJson());
    }) as unknown as typeof callLLM;

    const generator = new ArchetypeGenerator(mockFn);
    const result = await generator.generate('Summarize team messages daily');

    expect(result.execution_steps).toContain('Read messages');
    expect(logMock.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('plumbing leak detected'),
    );
    const judgeCalls = (mockFn as ReturnType<typeof vi.fn>).mock.calls.filter((args) =>
      isJudgeCall(args[0] as Parameters<typeof callLLM>[0]),
    );
    expect(judgeCalls).toHaveLength(1);
  });

  it('retries once when judge finds leak on attempt 1, returns clean result on retry', async () => {
    let judgeCallCount = 0;
    let generateCallCount = 0;

    const mockFn = vi.fn(async (opts: Parameters<typeof callLLM>[0]) => {
      if (isEstimatorCall(opts)) return makeResult('5');
      if (isJudgeCall(opts)) {
        judgeCallCount++;
        if (judgeCallCount === 1) {
          return makeResult(
            makeJudgeResponse(true, ['execution_steps'], ['/tools/slack/read-channels.ts']),
          );
        }
        return makeResult(makeJudgeResponse(false));
      }
      generateCallCount++;
      if (generateCallCount === 1) return makeResult(makeLeakJson());
      return makeResult(makeCleanJson());
    }) as unknown as typeof callLLM;

    const generator = new ArchetypeGenerator(mockFn);
    const result = await generator.generate('Summarize team messages daily');

    expect(result.execution_steps).not.toContain('/tools/');
    expect(generateCallCount).toBe(2);
    expect(judgeCallCount).toBe(2);
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ fields: ['execution_steps'] }),
      expect.stringContaining('plumbing leak detected'),
    );
    expect(logMock.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('persisted after retries'),
    );
  });

  it('accepts last attempt and logs warn when leak persists through both retries — LLM called 3 times for generation', async () => {
    let judgeCallCount = 0;
    let generateCallCount = 0;

    const mockFn = vi.fn(async (opts: Parameters<typeof callLLM>[0]) => {
      if (isEstimatorCall(opts)) return makeResult('5');
      if (isJudgeCall(opts)) {
        judgeCallCount++;
        return makeResult(
          makeJudgeResponse(true, ['execution_steps'], ['/tools/slack/read-channels.ts']),
        );
      }
      generateCallCount++;
      return makeResult(makeLeakJson());
    }) as unknown as typeof callLLM;

    const generator = new ArchetypeGenerator(mockFn);
    const result = await generator.generate('Summarize team messages daily');

    expect(result).toBeDefined();
    expect(generateCallCount).toBe(3);
    expect(judgeCallCount).toBe(3);
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.any(Array) }),
      expect.stringContaining('persisted after retries — accepting last attempt'),
    );
  });
});

describe('ArchetypeGenerator.validateAndRetryProse via converse() — proposal branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeTranscript(): ConverseMessage[] {
    return [
      { role: 'user', content: 'Create an employee that summarizes messages' },
      { role: 'assistant', content: 'What channel should it read from?' },
      { role: 'user', content: 'The general channel' },
    ];
  }

  it('judges proposal branch and retries when leak found — returns clean result', async () => {
    let judgeCallCount = 0;
    let converseCallCount = 0;

    const proposalJson = (steps: string) =>
      JSON.stringify({
        kind: 'proposal',
        config: JSON.parse(makeValidArchetypeJson({ execution_steps: steps })),
      });

    const mockFn = vi.fn(async (opts: Parameters<typeof callLLM>[0]) => {
      if (isEstimatorCall(opts)) return makeResult('5');
      if (isJudgeCall(opts)) {
        judgeCallCount++;
        if (judgeCallCount === 1) {
          return makeResult(
            makeJudgeResponse(true, ['execution_steps'], ['/tools/slack/read-channels.ts']),
          );
        }
        return makeResult(makeJudgeResponse(false));
      }
      converseCallCount++;
      if (converseCallCount === 1) {
        return makeResult(
          proposalJson('Run tsx /tools/slack/read-channels.ts --channel C0B71QSMZKQ'),
        );
      }
      return makeResult(proposalJson('Read messages from the general channel and summarize.'));
    }) as unknown as typeof callLLM;

    const generator = new ArchetypeGenerator(mockFn);
    const result = await generator.converse(makeTranscript(), makeConfig());

    expect(result.kind).toBe('proposal');
    if (result.kind === 'proposal') {
      expect(result.proposal.execution_steps).not.toContain('/tools/');
    }
    expect(judgeCallCount).toBe(2);
    expect(converseCallCount).toBe(2);
  });

  it('does NOT call judge for question branch', async () => {
    let judgeCallCount = 0;

    const mockFn = vi.fn(async (opts: Parameters<typeof callLLM>[0]) => {
      if (isJudgeCall(opts)) {
        judgeCallCount++;
        return makeResult(makeJudgeResponse(false));
      }
      return makeResult(JSON.stringify({ kind: 'question', question: 'What channel?' }));
    }) as unknown as typeof callLLM;

    const generator = new ArchetypeGenerator(mockFn);
    const result = await generator.converse(makeTranscript(), makeConfig());

    expect(result.kind).toBe('question');
    expect(judgeCallCount).toBe(0);
  });

  it('does NOT call judge for no_change branch', async () => {
    let judgeCallCount = 0;

    const mockFn = vi.fn(async (opts: Parameters<typeof callLLM>[0]) => {
      if (isJudgeCall(opts)) {
        judgeCallCount++;
        return makeResult(makeJudgeResponse(false));
      }
      return makeResult(JSON.stringify({ kind: 'no_change' }));
    }) as unknown as typeof callLLM;

    const generator = new ArchetypeGenerator(mockFn);
    const result = await generator.converse(makeTranscript(), makeConfig());

    expect(result.kind).toBe('no_change');
    expect(judgeCallCount).toBe(0);
  });
});
