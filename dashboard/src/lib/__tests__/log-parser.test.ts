import { describe, it, expect } from 'vitest';
import { parseLine, truncateMessage, MAX_DISPLAY_CHARS } from '../log-parser';

describe('log-parser', () => {
  it('parses a valid JSON log line correctly', () => {
    const raw = JSON.stringify({
      level: 30,
      time: '2026-05-23T08:51:27.580Z',
      component: 'opencode-harness',
      msg: 'OpenCode harness starting',
    });
    const result = parseLine(raw);
    expect(result.timestamp).toBe('08:51:27.580');
    expect(result.level).toBe('info');
    expect(result.component).toBe('harness');
    expect(result.message).toBe('OpenCode harness starting');
    expect(result.isSignal).toBe(true);
    expect(result.raw).toBe(raw);
  });

  it('handles non-JSON line without crashing', () => {
    const raw = 'This is not JSON at all';
    const result = parseLine(raw);
    expect(result.message).toBe(raw);
    expect(result.level).toBe('info');
    expect(result.component).toBe('unknown');
    expect(result.isSignal).toBe(true);
  });

  it('maps level 40 to warn', () => {
    const raw = JSON.stringify({
      level: 40,
      time: '2026-05-23T08:00:00.000Z',
      component: 'opencode-harness',
      msg: 'warning',
    });
    expect(parseLine(raw).level).toBe('warn');
  });

  it('maps level 50 to error', () => {
    const raw = JSON.stringify({
      level: 50,
      time: '2026-05-23T08:00:00.000Z',
      component: 'opencode-harness',
      msg: 'error',
    });
    expect(parseLine(raw).level).toBe('error');
  });

  it('shortens component names correctly', () => {
    const cases: [string, string][] = [
      ['opencode-harness', 'harness'],
      ['opencode-server', 'server'],
      ['session-manager', 'session-mgr'],
      ['postgrest-client', 'postgrest'],
      ['unknown-component', 'unknown-component'],
    ];
    for (const [input, expected] of cases) {
      const raw = JSON.stringify({
        level: 30,
        time: '2026-05-23T08:00:00.000Z',
        component: input,
        msg: 'test',
      });
      expect(parseLine(raw).component).toBe(expected);
    }
  });

  it('marks opencode-harness lines as signal', () => {
    const raw = JSON.stringify({
      level: 30,
      time: '2026-05-23T08:00:00.000Z',
      component: 'opencode-harness',
      msg: 'test',
    });
    expect(parseLine(raw).isSignal).toBe(true);
  });

  it('marks opencode-server bus lines as noise', () => {
    const raw = JSON.stringify({
      level: 30,
      time: '2026-05-23T08:00:00.000Z',
      component: 'opencode-server',
      msg: 'subscribed to service=bus event',
    });
    expect(parseLine(raw).isSignal).toBe(false);
  });

  it('marks opencode-server llm lines as signal', () => {
    const raw = JSON.stringify({
      level: 30,
      time: '2026-05-23T08:00:00.000Z',
      component: 'opencode-server',
      msg: 'request completed service=llm',
    });
    expect(parseLine(raw).isSignal).toBe(true);
  });

  it('marks level 50 server lines as signal regardless of service', () => {
    const raw = JSON.stringify({
      level: 50,
      time: '2026-05-23T08:00:00.000Z',
      component: 'opencode-server',
      msg: 'service=config error occurred',
    });
    const result = parseLine(raw);
    expect(result.level).toBe('error');
    expect(result.isSignal).toBe(true);
  });

  it('truncates messages over MAX_DISPLAY_CHARS', () => {
    const longMsg = 'x'.repeat(MAX_DISPLAY_CHARS + 100);
    const shortMsg = 'short message';

    const { text: longText, truncated: longTruncated } = truncateMessage(longMsg);
    expect(longTruncated).toBe(true);
    expect(longText.length).toBe(MAX_DISPLAY_CHARS);

    const { text: shortText, truncated: shortTruncated } = truncateMessage(shortMsg);
    expect(shortTruncated).toBe(false);
    expect(shortText).toBe(shortMsg);
  });
});
