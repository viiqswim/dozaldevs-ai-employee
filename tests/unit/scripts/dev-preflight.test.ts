import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function killAndWait(
  name: string,
  pattern: string,
  graceMs = 3000,
  listPids: (p: string) => string = (p) => {
    throw new Error(`real listPids called for ${p} — inject a mock`);
  },
  sendSignal: (sig: string, p: string) => void = (_sig, p) => {
    throw new Error(`real sendSignal called for ${p} — inject a mock`);
  },
): Promise<void> {
  sendSignal('TERM', pattern);
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    const pids = listPids(pattern);
    if (!pids) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  sendSignal('KILL', pattern);
  await new Promise((r) => setTimeout(r, 200));
}

function detectOtherDevInstances(
  rawPgrepOutput: string,
  ownPid: number,
  ownPpid: number,
): string[] {
  const selfPids = new Set([String(ownPid), String(ownPpid)]);
  return rawPgrepOutput
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((p) => !selfPids.has(p));
}

describe('single-instance guard — detectOtherDevInstances', () => {
  it('returns empty array when pgrep output contains only own PID', () => {
    const ownPid = 12345;
    const ownPpid = 12344;
    const others = detectOtherDevInstances(`${ownPid}\n`, ownPid, ownPpid);
    expect(others).toHaveLength(0);
  });

  it('returns empty array when pgrep output contains own PID and ppid', () => {
    const ownPid = 12345;
    const ownPpid = 12344;
    const others = detectOtherDevInstances(`${ownPpid}\n${ownPid}\n`, ownPid, ownPpid);
    expect(others).toHaveLength(0);
  });

  it('returns foreign PID when another dev instance is running', () => {
    const ownPid = 12345;
    const ownPpid = 12344;
    const others = detectOtherDevInstances(`${ownPid}\n99999\n`, ownPid, ownPpid);
    expect(others).toEqual(['99999']);
  });

  it('returns multiple foreign PIDs when several other instances are running', () => {
    const ownPid = 12345;
    const ownPpid = 12344;
    const others = detectOtherDevInstances(`${ownPid}\n88888\n77777\n`, ownPid, ownPpid);
    expect(others).toEqual(['88888', '77777']);
  });

  it('returns empty array when pgrep output is empty', () => {
    const others = detectOtherDevInstances('', 12345, 12344);
    expect(others).toHaveLength(0);
  });
});

describe('killAndWait', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves gracefully without SIGKILL when PIDs clear before deadline', async () => {
    const sendSignal = vi.fn();
    let callCount = 0;
    const listPids = vi.fn(() => {
      callCount++;
      return callCount >= 2 ? '' : '12345';
    });

    const pending = killAndWait('TestProcess', 'test-pattern', 500, listPids, sendSignal);
    await vi.advanceTimersByTimeAsync(400);
    await pending;

    expect(sendSignal).toHaveBeenCalledWith('TERM', 'test-pattern');
    expect(sendSignal).not.toHaveBeenCalledWith('KILL', 'test-pattern');
    expect(listPids.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('sends SIGKILL exactly once when PIDs never clear before deadline', async () => {
    const sendSignal = vi.fn();
    const listPids = vi.fn(() => '12345');

    const pending = killAndWait('TestProcess', 'test-pattern', 50, listPids, sendSignal);
    await vi.advanceTimersByTimeAsync(400);
    await pending;

    expect(sendSignal).toHaveBeenCalledWith('TERM', 'test-pattern');
    const killCalls = sendSignal.mock.calls.filter(([sig]) => sig === 'KILL');
    expect(killCalls).toHaveLength(1);
    expect(killCalls[0]).toEqual(['KILL', 'test-pattern']);
  });

  it('sends SIGTERM with the correct pattern argument', async () => {
    const sendSignal = vi.fn();
    const listPids = vi.fn(() => '');

    await killAndWait('MyService', 'my-unique-pattern', 500, listPids, sendSignal);

    expect(sendSignal).toHaveBeenCalledWith('TERM', 'my-unique-pattern');
  });

  it('polls listPids exactly once when process is already gone on first check', async () => {
    const sendSignal = vi.fn();
    const listPids = vi.fn(() => '');

    await killAndWait('TestProcess', 'test-pattern', 500, listPids, sendSignal);

    expect(listPids).toHaveBeenCalledTimes(1);
    expect(sendSignal).not.toHaveBeenCalledWith('KILL', 'test-pattern');
  });
});
