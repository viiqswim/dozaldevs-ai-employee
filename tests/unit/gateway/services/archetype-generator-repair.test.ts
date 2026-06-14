import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../../../src/lib/call-llm.js';
import {
  ArchetypeGenerator,
  repairJsonStrings,
  type GenerateArchetypeResponse,
} from '../../../../src/gateway/services/archetype-generator.js';

type LLMCallArgs = { messages: Array<{ role: string; content: string }> };

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

type GenStep = string | Error;

// refine() makes an extra TimeEstimator LLM call beyond the generation call; this
// routing mock intercepts the estimator call (by its system-prompt prefix) so
// generationCalls.length counts only the JSON-generation attempts under test.
function makeRoutingMock(genSteps: GenStep[]) {
  const generationCalls: LLMCallArgs[] = [];
  const fn = vi.fn(async (opts: LLMCallArgs) => {
    const systemContent = opts.messages?.[0]?.content ?? '';
    if (systemContent.startsWith(ESTIMATOR_SYSTEM_PREFIX)) {
      return makeResult('5');
    }
    const idx = generationCalls.length;
    generationCalls.push(opts);
    const step = genSteps[idx] ?? genSteps[genSteps.length - 1];
    if (step instanceof Error) throw step;
    return makeResult(step);
  });
  return { fn, generationCalls };
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
    risk_model: { approval_required: false, timeout_hours: 2 },
    trigger_sources: { type: 'manual' },
    tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
    concurrency_limit: 3,
    vm_size: null,
    worker_env: null,
    platform_rules_override: null,
    estimated_manual_minutes: null,
    overview: {
      role: '',
      trigger: '',
      workflow: [],
      tools_used: '',
      output: '',
      approval: '',
    },
    ...overrides,
  } as GenerateArchetypeResponse;
}

const VALID_REFINE_JSON = JSON.stringify({
  role_name: 'test-employee',
  identity: 'You are a refined, concise assistant.',
  execution_steps: 'Do the task efficiently.',
  instructions: 'Do the task efficiently.',
  tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
  overview: {
    role: 'assistant',
    trigger: 'manual',
    workflow: [],
    tools_used: '',
    output: '',
    approval: '',
  },
});

// The \n below are REAL newline bytes inside the string values — do not escape
// them or the "invalid-until-repaired" precondition disappears.
const NEWLINE_REFINE_RAW =
  '{"role_name":"test-employee","identity":"Line one\nLine two",' +
  '"execution_steps":"step a\nstep b","instructions":"x",' +
  '"tool_registry":{"tools":["/tools/platform/submit-output.ts"]},' +
  '"overview":{"role":"","trigger":"","workflow":[],"tools_used":"","output":"","approval":""}}';

const STRUCTURALLY_BROKEN = '{"identity": "x"';

describe('repairJsonStrings', () => {
  it('escapes a raw newline inside a string value so JSON.parse succeeds', () => {
    const raw = '{"a":"line1\nline2"}';
    expect(() => JSON.parse(raw)).toThrow();
    const parsed = JSON.parse(repairJsonStrings(raw)) as { a: string };
    expect(parsed.a).toBe('line1\nline2');
  });

  it('escapes a raw tab inside a string value', () => {
    const raw = '{"a":"col1\tcol2"}';
    expect(() => JSON.parse(raw)).toThrow();
    const parsed = JSON.parse(repairJsonStrings(raw)) as { a: string };
    expect(parsed.a).toBe('col1\tcol2');
  });

  it('escapes a raw carriage return inside a string value', () => {
    const raw = '{"a":"x\ry"}';
    expect(() => JSON.parse(raw)).toThrow();
    const parsed = JSON.parse(repairJsonStrings(raw)) as { a: string };
    expect(parsed.a).toBe('x\ry');
  });

  it('passes already-valid JSON through unchanged', () => {
    const raw = '{"a":1,"b":"plain text","c":[1,2,3]}';
    expect(repairJsonStrings(raw)).toBe(raw);
    expect(JSON.parse(repairJsonStrings(raw))).toEqual({ a: 1, b: 'plain text', c: [1, 2, 3] });
  });

  it('does not treat an escaped quote as the end of a string', () => {
    const raw = '{"a":"he said \\"hi\\"","b":"next\nline"}';
    const parsed = JSON.parse(repairJsonStrings(raw)) as { a: string; b: string };
    expect(parsed.a).toBe('he said "hi"');
    expect(parsed.b).toBe('next\nline');
  });

  it('does not fix structural errors — a missing closing brace still throws', () => {
    expect(() => JSON.parse(repairJsonStrings(STRUCTURALLY_BROKEN))).toThrow();
  });

  it('returns an empty string unchanged', () => {
    expect(repairJsonStrings('')).toBe('');
  });
});

describe('refine() — JSON repair and retry path', () => {
  it('repairs invalid JSON with raw newlines locally, without an LLM retry', async () => {
    const { fn, generationCalls } = makeRoutingMock([NEWLINE_REFINE_RAW, VALID_REFINE_JSON]);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const result = await gen.refine(makeConfig(), 'make it concise');

    expect(result.identity).toBe('Line one\nLine two');
    expect(generationCalls.length).toBe(1);
  });

  it('throws GENERATION_FAILED when JSON is genuinely invalid on both attempts', async () => {
    const { fn, generationCalls } = makeRoutingMock([STRUCTURALLY_BROKEN, STRUCTURALLY_BROKEN]);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    await expect(gen.refine(makeConfig(), 'change it')).rejects.toThrow('GENERATION_FAILED');
    expect(generationCalls.length).toBe(2);
  });
});

describe('refine() — empty-content handling', () => {
  it("retries instead of calling JSON.parse('') when the first response is empty", async () => {
    const { fn, generationCalls } = makeRoutingMock(['', VALID_REFINE_JSON]);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    const result = await gen.refine(makeConfig(), 'make it concise');

    expect(result.identity).toBe('You are a refined, concise assistant.');
    expect(generationCalls.length).toBe(2);
  });

  // The empty-content guard lives in call-llm.ts (T2): it THROWS on empty content.
  // The first generation call sits outside callLLMWithJsonRetry's try/catch, so a
  // thrown guard propagates straight to GENERATION_FAILED with no retry — distinct
  // from the empty-string-return case above, which does retry.
  it('surfaces a thrown empty-content guard error as GENERATION_FAILED without retrying', async () => {
    const guardError = new Error('LLM returned empty content — possible reasoning-only response');
    const { fn, generationCalls } = makeRoutingMock([guardError, VALID_REFINE_JSON]);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);

    await expect(gen.refine(makeConfig(), 'change it')).rejects.toThrow('GENERATION_FAILED');
    expect(generationCalls.length).toBe(1);
  });
});

const UNCHANGED_REFINE_JSON = JSON.stringify({
  role_name: 'test-employee',
  identity: 'You are a helpful assistant.',
  execution_steps: 'Do the task.',
  delivery_steps: null,
  instructions: 'Do the task.',
  tool_registry: { tools: ['/tools/platform/submit-output.ts'] },
  overview: { role: '', trigger: '', workflow: [], tools_used: '', output: '', approval: '' },
});

describe('refine() — no-change retry path', () => {
  it('retries with a nudge when the first result leaves all prose fields identical to input', async () => {
    const { fn, generationCalls } = makeRoutingMock([UNCHANGED_REFINE_JSON, VALID_REFINE_JSON]);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);
    const baseline = makeConfig();

    const result = await gen.refine(baseline, 'make it more concise');

    expect(result.identity).toBe('You are a refined, concise assistant.');
    expect(generationCalls.length).toBe(2);
  });

  it('returns the result as-is when both attempts produce identical prose — no infinite loop', async () => {
    const { fn, generationCalls } = makeRoutingMock([UNCHANGED_REFINE_JSON, UNCHANGED_REFINE_JSON]);
    const gen = new ArchetypeGenerator(fn as unknown as typeof callLLM);
    const baseline = makeConfig();

    const result = await gen.refine(baseline, 'attempt an impossible change');

    expect(result.identity).toBe(baseline.identity);
    expect(generationCalls.length).toBe(2);
  });
});
