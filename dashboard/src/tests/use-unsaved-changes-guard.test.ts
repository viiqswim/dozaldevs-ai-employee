import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useUnsavedChangesGuard } from '../hooks/use-unsaved-changes-guard';

describe('useUnsavedChangesGuard', () => {
  beforeEach(() => {
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prevents default on beforeunload when active=true', () => {
    renderHook(() => useUnsavedChangesGuard(true));

    const addSpy = window.addEventListener as ReturnType<typeof vi.fn>;
    const call = (addSpy.mock.calls as [string, EventListenerOrEventListenerObject][]).find(
      (c) => c[0] === 'beforeunload',
    );
    expect(call).toBeDefined();

    const handler = call![1] as EventListener;
    const evt = new Event('beforeunload');
    const preventDefaultSpy = vi.spyOn(evt, 'preventDefault');

    act(() => {
      handler(evt);
    });

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('does NOT register beforeunload listener when active=false', () => {
    renderHook(() => useUnsavedChangesGuard(false));

    const addSpy = window.addEventListener as ReturnType<typeof vi.fn>;
    const call = (addSpy.mock.calls as [string, EventListenerOrEventListenerObject][]).find(
      (c) => c[0] === 'beforeunload',
    );
    expect(call).toBeUndefined();
  });

  it('removes beforeunload listener on unmount', () => {
    const { unmount } = renderHook(() => useUnsavedChangesGuard(true));

    unmount();

    const removeSpy = window.removeEventListener as ReturnType<typeof vi.fn>;
    const call = (removeSpy.mock.calls as [string, EventListenerOrEventListenerObject][]).find(
      (c) => c[0] === 'beforeunload',
    );
    expect(call).toBeDefined();
  });

  it('removes beforeunload listener when active flips true→false', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useUnsavedChangesGuard(active),
      { initialProps: { active: true } },
    );

    rerender({ active: false });

    const removeSpy = window.removeEventListener as ReturnType<typeof vi.fn>;
    const call = (removeSpy.mock.calls as [string, EventListenerOrEventListenerObject][]).find(
      (c) => c[0] === 'beforeunload',
    );
    expect(call).toBeDefined();
  });
});
