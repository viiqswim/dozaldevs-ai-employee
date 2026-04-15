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

  it('resolves $prev_result from previous step output', () => {
    const result = resolveParams({ data: '$prev_result' }, {}, { messages: [] });
    expect(result).toEqual({ data: { messages: [] } });
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
