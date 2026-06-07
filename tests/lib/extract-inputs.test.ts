import { describe, it, expect, vi } from 'vitest';
import { extractInputsFromText, stripFences } from '../../src/lib/extract-inputs.js';
import type { callLLM } from '../../src/lib/call-llm.js';
import { CostCircuitBreakerError } from '../../src/lib/errors.js';

function makeCallLLM(content: string): typeof callLLM {
  return vi.fn().mockResolvedValue({
    content,
    model: 'test',
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
    latencyMs: 0,
  }) as unknown as typeof callLLM;
}

function makeSequencedCallLLM(contents: string[]): typeof callLLM {
  const mock = vi.fn();
  for (const content of contents) {
    mock.mockResolvedValueOnce({
      content,
      model: 'test',
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: 0,
    });
  }
  return mock as unknown as typeof callLLM;
}

describe('stripFences', () => {
  it('removes ```json fences', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('leaves plain JSON unchanged when no fences present', () => {
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe('extractInputsFromText', () => {
  it('happy path — single date field', async () => {
    const mockLLM = makeCallLLM('{"date": "2026-06-05"}');
    const result = await extractInputsFromText(
      'generate cleaning schedule for June 5th',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({ date: '2026-06-05' });
    expect(mockLLM).toHaveBeenCalledOnce();
  });

  it('multiple fields — all extracted', async () => {
    const mockLLM = makeCallLLM('{"date":"2026-06-05","time":"10:00","room":"Room A"}');
    const result = await extractInputsFromText(
      'schedule for June 5th at 10am in Room A',
      [
        { key: 'date', label: 'Checkout Date', type: 'date' },
        { key: 'time', label: 'Checkout Time', type: 'time' },
        { key: 'room', label: 'Room', type: 'text' },
      ],
      mockLLM,
    );
    expect(result).toEqual({ date: '2026-06-05', time: '10:00', room: 'Room A' });
  });

  it('null values in LLM response are filtered out — result is empty', async () => {
    const mockLLM = makeCallLLM('{"date": null}');
    const result = await extractInputsFromText(
      'hello',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({});
  });

  it('LLM throws error — returns {} without propagating', async () => {
    const mockLLM = vi.fn().mockRejectedValue(new Error('LLM failed')) as unknown as typeof callLLM;
    const result = await extractInputsFromText(
      'some text',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({});
  });

  it('malformed JSON response — returns {}', async () => {
    const mockLLM = makeCallLLM('not json at all');
    const result = await extractInputsFromText(
      'some text',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({});
  });

  it('JSON wrapped in markdown fences — strips and parses correctly', async () => {
    const mockLLM = makeCallLLM('```json\n{"date":"2026-06-05"}\n```');
    const result = await extractInputsFromText(
      'June 5th',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({ date: '2026-06-05' });
  });

  it('select field — valid option accepted', async () => {
    const mockLLM = makeCallLLM('{"priority":"medium"}');
    const result = await extractInputsFromText(
      'medium priority task',
      [
        {
          key: 'priority',
          label: 'Priority',
          type: 'select',
          options: ['low', 'medium', 'high'],
        },
      ],
      mockLLM,
    );
    expect(result).toEqual({ priority: 'medium' });
  });

  it('select field — invalid option silently rejected, result empty', async () => {
    const mockLLM = makeCallLLM('{"priority":"urgent"}');
    const result = await extractInputsFromText(
      'urgent priority',
      [
        {
          key: 'priority',
          label: 'Priority',
          type: 'select',
          options: ['low', 'medium', 'high'],
        },
      ],
      mockLLM,
    );
    expect(result).toEqual({});
  });

  it('empty text — early return, LLM not called', async () => {
    const mockLLM = vi.fn() as unknown as typeof callLLM;
    const result = await extractInputsFromText(
      '',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({});
    expect(mockLLM).not.toHaveBeenCalled();
  });

  it('empty fields array — early return, LLM not called', async () => {
    const mockLLM = vi.fn() as unknown as typeof callLLM;
    const result = await extractInputsFromText('some important text', [], mockLLM);
    expect(result).toEqual({});
    expect(mockLLM).not.toHaveBeenCalled();
  });

  it('system prompt includes general multilingual instruction', async () => {
    const mockLLM = makeCallLLM('{"date": "2026-06-05"}');
    await extractInputsFromText(
      'Junio 5',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    const callArgs = (mockLLM as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = callArgs.messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('any language');
  });

  it('retry — succeeds on 2nd attempt when 1st returns empty', async () => {
    const mockLLM = makeSequencedCallLLM(['', '{"date":"2026-06-08"}']);
    const result = await extractInputsFromText(
      'Junio 8, 2026',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({ date: '2026-06-08' });
    expect(mockLLM).toHaveBeenCalledTimes(2);
  });

  it('retry — succeeds on 3rd attempt when 1st empty and 2nd truncated', async () => {
    const mockLLM = makeSequencedCallLLM(['', '{"date": "2026-06', '{"date":"2026-06-08"}']);
    const result = await extractInputsFromText(
      'Junio 8, 2026',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({ date: '2026-06-08' });
    expect(mockLLM).toHaveBeenCalledTimes(3);
  });

  it('retry — all 3 attempts exhausted returns {}', async () => {
    const mockLLM = makeSequencedCallLLM(['', '', '']);
    const result = await extractInputsFromText(
      'some text',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({});
    expect(mockLLM).toHaveBeenCalledTimes(3);
  });

  it('retry — escalates maxTokens [800, 1600, 3200] and uses timeoutMs 20000 per attempt', async () => {
    const mock = vi.fn().mockResolvedValue({
      content: '',
      model: 'test',
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: 0,
    }) as unknown as typeof callLLM;

    await extractInputsFromText(
      'some text',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mock,
    );

    expect(mock).toHaveBeenCalledTimes(3);
    const calls = (mock as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ maxTokens: number; timeoutMs: number }]
    >;
    expect(calls[0][0].maxTokens).toBe(800);
    expect(calls[1][0].maxTokens).toBe(1600);
    expect(calls[2][0].maxTokens).toBe(3200);
    expect(calls[0][0].timeoutMs).toBe(20_000);
    expect(calls[1][0].timeoutMs).toBe(20_000);
    expect(calls[2][0].timeoutMs).toBe(20_000);
  });

  it('no retry — valid parse with null value returns {} after exactly 1 call', async () => {
    const mockLLM = makeCallLLM('{"date": null}');
    const result = await extractInputsFromText(
      'hello',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({});
    expect(mockLLM).toHaveBeenCalledTimes(1);
  });

  it('no retry — valid extraction returns result after exactly 1 call', async () => {
    const mockLLM = makeCallLLM('{"date":"2026-06-08"}');
    const result = await extractInputsFromText(
      'Junio 8, 2026',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    expect(result).toEqual({ date: '2026-06-08' });
    expect(mockLLM).toHaveBeenCalledTimes(1);
  });

  it('CostCircuitBreakerError aborts retries — returns {} after exactly 1 call', async () => {
    const mock = vi.fn().mockRejectedValue(
      new CostCircuitBreakerError('Daily limit exceeded', {
        department: 'test',
        currentSpendUsd: 50,
        limitUsd: 50,
      }),
    ) as unknown as typeof callLLM;

    const result = await extractInputsFromText(
      'some text',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mock,
    );
    expect(result).toEqual({});
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('system prompt contains JSON-only nudge and multilingual instruction', async () => {
    const mockLLM = makeCallLLM('{"date": "2026-06-08"}');
    await extractInputsFromText(
      'Junio 8, 2026',
      [{ key: 'date', label: 'Checkout Date', type: 'date' }],
      mockLLM,
    );
    const callArgs = (mockLLM as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = callArgs.messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('no preamble');
    expect(systemMessage?.content).toContain('no markdown code fences');
    expect(systemMessage?.content).toContain('any language');
  });
});
