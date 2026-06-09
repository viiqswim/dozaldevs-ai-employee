import { describe, expect, it } from 'vitest';

import { getArg } from '../../../../src/worker-tools/lib/get-arg.js';

describe('getArg', () => {
  it('returns the value after the flag', () => {
    expect(getArg(['--foo', 'bar'], '--foo')).toBe('bar');
  });

  it('returns undefined when the flag is absent', () => {
    expect(getArg(['--other', 'val'], '--foo')).toBeUndefined();
  });

  it('returns undefined when the flag has no following value', () => {
    expect(getArg(['--foo'], '--foo')).toBeUndefined();
  });

  it('returns undefined when the value is empty string', () => {
    expect(getArg(['--foo', ''], '--foo')).toBeUndefined();
  });

  it('returns undefined for empty args array', () => {
    expect(getArg([], '--foo')).toBeUndefined();
  });

  it('picks the correct flag when multiple flags are present', () => {
    expect(getArg(['--a', '1', '--b', '2'], '--b')).toBe('2');
    expect(getArg(['--a', '1', '--b', '2'], '--a')).toBe('1');
  });

  it('returns the first occurrence when the flag appears more than once', () => {
    expect(getArg(['--foo', 'first', '--foo', 'second'], '--foo')).toBe('first');
  });
});
