import { describe, it, expect, beforeEach, vi } from 'vitest';

// Partial-mock: only createLogger/taskLogger are stubbed so the module-level
// `log` in archetype-generator is captured; importOriginal keeps the rest real.
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

type LogCall = [Record<string, unknown> | string | undefined, string | undefined];

function findDegradedCall(calls: unknown[][]): LogCall | undefined {
  return (calls as LogCall[]).find(
    (c) => typeof c[1] === 'string' && c[1].includes('degraded to no_change'),
  );
}

describe('converse() — degraded no_change is logged distinctly', () => {
  beforeEach(() => {
    logMock.warn.mockClear();
    logMock.error.mockClear();
    logMock.info.mockClear();
  });

  it('emits a distinguishing error log on LLM-call failure while still returning no_change', async () => {
    const fn = vi.fn(async () => {
      throw new Error('network failure: upstream 503');
    });
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const transcript: ConverseMessage[] = [{ role: 'user', content: 'do something useful' }];
    const result = await gen.converse(transcript, makeConfig());

    expect(result.kind).toBe('no_change');

    const degraded = findDegradedCall(logMock.error.mock.calls);
    expect(degraded).toBeDefined();
    expect(degraded?.[0]).toMatchObject({ degraded: true, reason: 'llm_call_failed' });
  });

  it('does NOT emit a degraded log on a legitimate no_change (differentiation)', async () => {
    const fn = vi.fn(async () => makeResult(JSON.stringify({ kind: 'no_change' })));
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const transcript: ConverseMessage[] = [{ role: 'user', content: 'this is genuinely a no-op' }];
    const result = await gen.converse(transcript, makeConfig());

    expect(result.kind).toBe('no_change');

    expect(findDegradedCall(logMock.error.mock.calls)).toBeUndefined();
    expect(findDegradedCall(logMock.warn.mock.calls)).toBeUndefined();
  });
});
