import { describe, it, expect, vi } from 'vitest';
import { extractInputsFromText, stripFences } from '../../src/lib/extract-inputs.js';
import type { callLLM } from '../../src/lib/call-llm.js';

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
});
