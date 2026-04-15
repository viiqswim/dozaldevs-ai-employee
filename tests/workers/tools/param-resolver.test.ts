import { describe, it, expect } from 'vitest';
import { resolveParams } from '../../../src/workers/tools/param-resolver.js';

describe('resolveParams', () => {
  it('resolves $ENV_VAR from env map', () => {
    const result = resolveParams(
      { channel: '$SLACK_CHANNEL' },
      { SLACK_CHANNEL: 'C123' },
      undefined,
    );
    expect(result).toEqual({ channel: 'C123' });
  });

  it('resolves $prev_result from previous step output (no .text field)', () => {
    const result = resolveParams({ data: '$prev_result' }, {}, { messages: [] });
    expect(result).toEqual({ data: { messages: [] } });
  });

  it('resolves standalone $prev_result extracts .text when LlmGenerateResult', () => {
    const llmResult = { text: 'The summary text', model: 'claude', usage: {} };
    const result = resolveParams({ summary_text: '$prev_result' }, {}, llmResult);
    expect(result).toEqual({ summary_text: 'The summary text' });
  });

  it('interpolates embedded $prev_result in string using .text field', () => {
    const llmResult = { text: 'summary content', model: 'claude', usage: {} };
    const result = resolveParams(
      { user_prompt: 'Generate a report:\n\n$prev_result' },
      {},
      llmResult,
    );
    expect(result).toEqual({ user_prompt: 'Generate a report:\n\nsummary content' });
  });

  it('interpolates embedded $prev_result in string using JSON.stringify when no .text', () => {
    const prev = { messages: [1, 2] };
    const result = resolveParams({ prompt: 'Data: $prev_result' }, {}, prev);
    expect(result).toEqual({ prompt: `Data: ${JSON.stringify(prev)}` });
  });

  it('resolves $archetype.FIELD from archetypeFields map', () => {
    const archetypeFields = { system_prompt: 'You are Papi Chulo', model: 'claude' };
    const result = resolveParams(
      { system: '$archetype.system_prompt' },
      {},
      undefined,
      archetypeFields,
    );
    expect(result).toEqual({ system: 'You are Papi Chulo' });
  });

  it('falls back to original value when $archetype.FIELD not found', () => {
    const result = resolveParams({ system: '$archetype.missing_field' }, {}, undefined, {
      model: 'x',
    });
    expect(result).toEqual({ system: '$archetype.missing_field' });
  });

  it('passes through non-$ values unchanged', () => {
    const result = resolveParams({ count: 24, name: 'test' }, {}, undefined);
    expect(result).toEqual({ count: 24, name: 'test' });
  });

  it('returns original $VAR string when env var not found', () => {
    const result = resolveParams({ channel: '$MISSING_VAR' }, {}, undefined);
    expect(result).toEqual({ channel: '$MISSING_VAR' });
  });

  it('handles empty params object', () => {
    const result = resolveParams({}, { FOO: 'bar' }, 'prev');
    expect(result).toEqual({});
  });

  it('resolves multiple params with mixed sources in one call', () => {
    const result = resolveParams(
      { ch: '$CHANNEL', body: '$prev_result', label: 'static-value' },
      { CHANNEL: 'C999' },
      { summary: 'done' },
    );
    expect(result).toEqual({ ch: 'C999', body: { summary: 'done' }, label: 'static-value' });
  });

  it('resolves $prev_result to null when previousResult is null', () => {
    const result = resolveParams({ output: '$prev_result' }, {}, null);
    expect(result).toEqual({ output: null });
  });
});
