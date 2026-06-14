import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { callLLM } from '../../../src/lib/call-llm.js';
import { ArchetypeGenerator } from '../../../src/gateway/services/archetype-generator.js';
import type { RecordInput } from '../../../src/repositories/ArchetypeGenerationCallRepository.js';

const ESTIMATOR_SYSTEM_PREFIX = 'You estimate manual task duration';

const VALID_GENERATION_JSON = JSON.stringify({
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

// generate() calls callLLM twice: once for generation, once for the TimeEstimator.
// Route by the estimator's system-prompt prefix so the estimator never hijacks the
// generation response and vice versa.
function makeRoutingLLM(generationContent: string | Error) {
  return vi.fn(async (opts: { messages: Array<{ role: string; content: string }> }) => {
    const systemContent = opts.messages?.[0]?.content ?? '';
    if (systemContent.startsWith(ESTIMATOR_SYSTEM_PREFIX)) {
      return makeResult('15');
    }
    if (generationContent instanceof Error) throw generationContent;
    return makeResult(generationContent);
  });
}

function makeRepo() {
  return {
    record: vi.fn(async (_input: RecordInput) => ({ id: 'call-1' })),
    linkArchetype: vi.fn(async (_callId: string, _archetypeId: string) => undefined),
  };
}

const GEN_CONTEXT = { tenantId: 'tenant-1', createdBy: 'user-1' };

describe('ArchetypeGenerator instrumentation — non-blocking persistence', () => {
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
  });

  it('(g) still returns a valid config when repo.record throws (persistence is non-blocking)', async () => {
    repo.record.mockRejectedValue(new Error('audit insert failed'));
    const llm = makeRoutingLLM(VALID_GENERATION_JSON);
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, repo as never);

    const result = await gen.generate(
      'A test employee that does X',
      undefined,
      undefined,
      GEN_CONTEXT,
    );

    expect(result.role_name).toBe('test');
    expect(result.runtime).toBe('opencode');
    expect(result.identity).toBe('You are a test employee.');
    expect(repo.record).toHaveBeenCalled();
  });

  it('does not call repo.record when no generationContext is supplied', async () => {
    const llm = makeRoutingLLM(VALID_GENERATION_JSON);
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, repo as never);

    const result = await gen.generate('A test employee that does X');

    expect(result.role_name).toBe('test');
    expect(repo.record).not.toHaveBeenCalled();
  });

  it('persists a success row with status "success" on the happy path', async () => {
    const llm = makeRoutingLLM(VALID_GENERATION_JSON);
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, repo as never);

    await gen.generate('A test employee that does X', undefined, undefined, GEN_CONTEXT);

    const generateRow = repo.record.mock.calls
      .map((c) => c[0])
      .find((row) => row.call_type === 'generate');
    expect(generateRow).toBeDefined();
    expect(generateRow?.status).toBe('success');
    expect(generateRow?.tenant_id).toBe('tenant-1');
    expect(generateRow?.created_by).toBe('user-1');
    expect(generateRow?.archetype_id).toBeNull();
  });

  it('(h) persists a failed row with error_message when the LLM throws', async () => {
    const llm = makeRoutingLLM(new Error('LLM returned empty content'));
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, repo as never);

    await expect(
      gen.generate('A test employee that does X', undefined, undefined, GEN_CONTEXT),
    ).rejects.toThrow('GENERATION_FAILED');

    const failedRow = repo.record.mock.calls
      .map((c) => c[0])
      .find((row) => row.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow?.call_type).toBe('generate');
    expect(failedRow?.error_message).toContain('LLM returned empty content');
    expect(failedRow?.tenant_id).toBe('tenant-1');
    expect(failedRow?.created_by).toBe('user-1');
  });

  it('(h) does not throw out of the failure-path persistence even when repo.record itself throws', async () => {
    repo.record.mockRejectedValue(new Error('audit insert failed'));
    const llm = makeRoutingLLM(new Error('LLM returned empty content'));
    const gen = new ArchetypeGenerator(llm as unknown as typeof callLLM, repo as never);

    await expect(
      gen.generate('A test employee that does X', undefined, undefined, GEN_CONTEXT),
    ).rejects.toThrow('GENERATION_FAILED');

    expect(repo.record).toHaveBeenCalled();
  });
});
