import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { usePoll } from '../hooks/use-poll';
import { POLL_INTERVAL_MS } from '../lib/constants';

describe('usePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls fetchFn on mount when enabled=true (default)', async () => {
    const fetchFn = vi.fn().mockResolvedValue([]);

    await act(async () => {
      renderHook(() => usePoll(fetchFn));
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does NOT call fetchFn when enabled=false', async () => {
    const fetchFn = vi.fn().mockResolvedValue([]);

    await act(async () => {
      renderHook(() => usePoll(fetchFn, POLL_INTERVAL_MS, false));
    });

    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);
    });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stops calling fetchFn when enabled flips true→false', async () => {
    const fetchFn = vi.fn().mockResolvedValue([]);

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePoll(fetchFn, POLL_INTERVAL_MS, enabled),
      { initialProps: { enabled: true } },
    );

    // Let initial mount call settle
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    const callsAfterMount = fetchFn.mock.calls.length;

    // Flip to disabled
    rerender({ enabled: false });

    // Advance past one interval — should NOT trigger more calls
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS + 100);
    });

    expect(fetchFn.mock.calls.length).toBe(callsAfterMount);
  });

  it('starts calling fetchFn immediately when enabled flips false→true', async () => {
    const fetchFn = vi.fn().mockResolvedValue([]);

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePoll(fetchFn, POLL_INTERVAL_MS, enabled),
      { initialProps: { enabled: false } },
    );

    // Confirm nothing called yet
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(fetchFn).not.toHaveBeenCalled();

    // Flip to enabled
    await act(async () => {
      rerender({ enabled: true });
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fires fetchFn on mount + at each interval when enabled=true', async () => {
    const fetchFn = vi.fn().mockResolvedValue([]);

    renderHook(() => usePoll(fetchFn, POLL_INTERVAL_MS, true));

    // Settle initial mount call
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    // Advance 2 full intervals
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);
    });

    // mount call + 2 interval calls = at least 3
    expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
