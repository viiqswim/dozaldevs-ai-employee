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
import { ArchetypeGenerator } from '../../../../src/gateway/services/archetype-generator.js';

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

function makeGenerator(mockFn: typeof callLLM): ArchetypeGenerator {
  return new ArchetypeGenerator(mockFn);
}

describe('ArchetypeGenerator.judgeProseForPlumbing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns has_leak: true when payload contains raw channel ID and tool path', async () => {
    const mockFn = vi.fn(async () =>
      makeResult(
        JSON.stringify({
          has_leak: true,
          fields: ['delivery_steps'],
          snippets: ['C0B71QSMZKQ', '/tools/slack/post-message.ts'],
        }),
      ),
    ) as unknown as typeof callLLM;

    const generator = makeGenerator(mockFn);
    const result = await generator.judgeProseForPlumbing({
      identity: 'You are a helpful assistant.',
      execution_steps: 'Read messages and summarize.',
      delivery_steps:
        'Post to C0B71QSMZKQ using /tools/slack/post-message.ts --channel C0B71QSMZKQ',
      overview: {
        role: 'Summarizer',
        trigger: 'manual',
        workflow: ['Read', 'Summarize'],
        tools_used: 'Slack',
        output: 'Summary',
        approval: 'Required',
      },
    });

    expect(result.has_leak).toBe(true);
    expect(result.fields).toContain('delivery_steps');
    expect(result.snippets).toContain('C0B71QSMZKQ');
    expect(mockFn).toHaveBeenCalledOnce();
  });

  it('returns has_leak: false for clean intent-prose payload', async () => {
    const mockFn = vi.fn(async () =>
      makeResult(JSON.stringify({ has_leak: false, fields: [], snippets: [] })),
    ) as unknown as typeof callLLM;

    const generator = makeGenerator(mockFn);
    const result = await generator.judgeProseForPlumbing({
      identity: 'You are Alex, the Operations Coordinator at Acme Properties.',
      execution_steps:
        '1. Read all messages from the support channel.\n2. Summarize key themes.\n3. Submit the summary for review.',
      delivery_steps:
        '1. Take the approved summary.\n2. Post it to the team notification channel.\n3. Confirm delivery.',
      overview: {
        role: 'Operations Coordinator',
        trigger: 'Triggered manually on demand',
        workflow: ['Read messages', 'Summarize', 'Submit for review'],
        tools_used: 'Slack read-channel tool',
        output: 'Daily summary posted to team channel',
        approval: 'Required before posting',
      },
    });

    expect(result.has_leak).toBe(false);
    expect(result.fields).toHaveLength(0);
    expect(result.snippets).toHaveLength(0);
  });

  it('does not flag {{target_date}} placeholder as plumbing', async () => {
    const mockFn = vi.fn(async () =>
      makeResult(JSON.stringify({ has_leak: false, fields: [], snippets: [] })),
    ) as unknown as typeof callLLM;

    const generator = makeGenerator(mockFn);
    const result = await generator.judgeProseForPlumbing({
      identity: 'You are a reporting assistant.',
      execution_steps:
        '1. Read the report for {{target_date}}.\n2. Summarize findings.\n3. Submit for review.',
      delivery_steps: '1. Post the approved report to the team channel.',
      overview: {
        role: 'Reporter',
        trigger: 'Triggered manually with a target date',
        workflow: ['Read report for {{target_date}}', 'Summarize', 'Submit'],
        tools_used: 'Slack',
        output: 'Report summary',
        approval: 'Required',
      },
    });

    expect(result.has_leak).toBe(false);
    expect(result.fields).toHaveLength(0);
  });

  it('does not flag plain business codes as plumbing', async () => {
    const mockFn = vi.fn(async () =>
      makeResult(JSON.stringify({ has_leak: false, fields: [], snippets: [] })),
    ) as unknown as typeof callLLM;

    const generator = makeGenerator(mockFn);
    const result = await generator.judgeProseForPlumbing({
      identity: 'You are a contract analyst.',
      execution_steps: '1. Look up contract CONTRACT2024.\n2. Summarize terms.',
      delivery_steps: '1. Post the summary to the team channel.',
      overview: {
        role: 'Contract Analyst',
        trigger: 'manual',
        workflow: ['Look up CONTRACT2024', 'Summarize'],
        tools_used: 'Notion',
        output: 'Generates report CONTRACT2024',
        approval: 'Required',
      },
    });

    expect(result.has_leak).toBe(false);
    expect(result.fields).toHaveLength(0);
  });

  it('fails open and calls log.warn when LLM throws', async () => {
    const mockFn = vi.fn(async () => {
      throw new Error('LLM unavailable');
    }) as unknown as typeof callLLM;

    const generator = makeGenerator(mockFn);
    const result = await generator.judgeProseForPlumbing({
      identity: 'You are a helpful assistant.',
      execution_steps: 'Do the task.',
    });

    expect(result.has_leak).toBe(false);
    expect(result.fields).toHaveLength(0);
    expect(result.snippets).toHaveLength(0);
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('judgeProseForPlumbing'),
    );
  });

  it('fails open and calls log.warn when LLM returns invalid JSON', async () => {
    const mockFn = vi.fn(async () =>
      makeResult('this is not json at all'),
    ) as unknown as typeof callLLM;

    const generator = makeGenerator(mockFn);
    const result = await generator.judgeProseForPlumbing({
      identity: 'You are a helpful assistant.',
      execution_steps: 'Do the task.',
    });

    expect(result.has_leak).toBe(false);
    expect(result.fields).toHaveLength(0);
    expect(result.snippets).toHaveLength(0);
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('judgeProseForPlumbing'),
    );
  });

  it('fails open and calls log.warn when LLM returns unexpected shape', async () => {
    const mockFn = vi.fn(async () =>
      makeResult(JSON.stringify({ result: 'ok', status: 'clean' })),
    ) as unknown as typeof callLLM;

    const generator = makeGenerator(mockFn);
    const result = await generator.judgeProseForPlumbing({
      identity: 'You are a helpful assistant.',
      execution_steps: 'Do the task.',
    });

    expect(result.has_leak).toBe(false);
    expect(result.fields).toHaveLength(0);
    expect(result.snippets).toHaveLength(0);
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ parsed: expect.anything() }),
      expect.stringContaining('judgeProseForPlumbing'),
    );
  });

  it('serializes overview sub-fields including workflow array into the judge payload', async () => {
    let capturedPayload: unknown;
    const mockFn = vi.fn(async (opts: Parameters<typeof callLLM>[0]) => {
      capturedPayload = JSON.parse(opts.messages[1]?.content ?? '{}');
      return makeResult(JSON.stringify({ has_leak: false, fields: [], snippets: [] }));
    }) as unknown as typeof callLLM;

    const generator = makeGenerator(mockFn);
    await generator.judgeProseForPlumbing({
      identity: 'You are a reporter.',
      execution_steps: 'Read and summarize.',
      delivery_steps: 'Post to channel.',
      overview: {
        role: 'Reporter',
        trigger: 'manual',
        workflow: ['Step one', 'Step two'],
        tools_used: 'Slack',
        output: 'Summary',
        approval: 'Required',
      },
    });

    const payload = capturedPayload as Record<string, unknown>;
    expect(payload).toHaveProperty('identity');
    expect(payload).toHaveProperty('execution_steps');
    expect(payload).toHaveProperty('delivery_steps');
    expect(payload).toHaveProperty('overview');
    const overview = payload['overview'] as Record<string, unknown>;
    expect(overview).toHaveProperty('role', 'Reporter');
    expect(overview).toHaveProperty('workflow');
    expect(Array.isArray(overview['workflow'])).toBe(true);
    expect(overview['workflow']).toEqual(['Step one', 'Step two']);
  });

  it('calls LLM with taskType review, temperature 0, and json_object response format', async () => {
    const mockFn = vi.fn(async () =>
      makeResult(JSON.stringify({ has_leak: false, fields: [], snippets: [] })),
    ) as unknown as typeof callLLM;

    const generator = makeGenerator(mockFn);
    await generator.judgeProseForPlumbing({ identity: 'You are a helper.' });

    expect(mockFn).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'review',
        temperature: 0,
        responseFormat: { type: 'json_object' },
      }),
    );
  });
});
