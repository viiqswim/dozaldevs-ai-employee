import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatConversation } from '../use-chat-conversation';
import type { ConverseResponse } from '@/lib/types';

function makeConverseFn(response: ConverseResponse) {
  return vi.fn().mockResolvedValue(response);
}

describe('useChatConversation — injected converseFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes the injected converseFn with the accumulated transcript', async () => {
    const converseFn = makeConverseFn({ kind: 'no_change' });

    const { result } = renderHook(() => useChatConversation(converseFn));

    await act(async () => {
      await result.current.submit('hello');
    });

    expect(converseFn).toHaveBeenCalledOnce();
    expect(converseFn).toHaveBeenCalledWith([{ role: 'user', content: 'hello' }]);
  });

  it('archetypeId not required — hook works with a create-path converseFn', async () => {
    const createFn = makeConverseFn({ kind: 'no_change' });

    const { result } = renderHook(() => useChatConversation(createFn));

    await act(async () => {
      await result.current.submit('create me an employee');
    });

    expect(createFn).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('same hook module serves both edit and create consumers', async () => {
    const editFn = makeConverseFn({ kind: 'no_change' });
    const createFn = makeConverseFn({ kind: 'no_change' });

    const { result: editResult } = renderHook(() => useChatConversation(editFn));
    const { result: createResult } = renderHook(() => useChatConversation(createFn));

    await act(async () => {
      await editResult.current.submit('edit request');
    });

    await act(async () => {
      await createResult.current.submit('create request');
    });

    expect(editFn).toHaveBeenCalledWith([{ role: 'user', content: 'edit request' }]);
    expect(createFn).toHaveBeenCalledWith([{ role: 'user', content: 'create request' }]);
  });

  it('submit with kind:question appends question bubble and adds both turns to transcript', async () => {
    const converseFn = makeConverseFn({ kind: 'question', question: 'What do you mean?' });

    const { result } = renderHook(() => useChatConversation(converseFn));

    await act(async () => {
      await result.current.submit('make replies shorter');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      kind: 'text',
      text: 'make replies shorter',
    });
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      kind: 'text',
      text: 'What do you mean?',
    });

    expect(result.current.transcript).toHaveLength(2);
    expect(result.current.transcript[0]).toEqual({ role: 'user', content: 'make replies shorter' });
    expect(result.current.transcript[1]).toEqual({
      role: 'assistant',
      content: 'What do you mean?',
    });

    expect(result.current.hasPendingProposal).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('submit with kind:proposal appends proposal message and sets hasPendingProposal true', async () => {
    const converseFn = makeConverseFn({
      kind: 'proposal',
      baseline: { identity: 'old' } as never,
      proposal: { identity: 'new' } as never,
      changed_fields: { identity: { from: 'old', to: 'new' } },
    });

    const { result } = renderHook(() => useChatConversation(converseFn));

    await act(async () => {
      await result.current.submit('make it friendlier');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant', kind: 'proposal' });
    expect(result.current.messages[1].proposal).toBeDefined();
    expect(result.current.hasPendingProposal).toBe(true);

    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0]).toEqual({ role: 'user', content: 'make it friendlier' });
  });

  it('submit with kind:no_change appends notice bubble', async () => {
    const converseFn = makeConverseFn({ kind: 'no_change' });

    const { result } = renderHook(() => useChatConversation(converseFn));

    await act(async () => {
      await result.current.submit('nothing to change');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      kind: 'text',
      text: expect.stringContaining('no change is needed'),
    });
    expect(result.current.hasPendingProposal).toBe(false);
  });

  it('submit with kind:too_long appends notice and sets mustStartFresh true; startFresh clears all', async () => {
    const converseFn = makeConverseFn({ kind: 'too_long' });

    const { result } = renderHook(() => useChatConversation(converseFn));

    await act(async () => {
      await result.current.submit('a very long conversation');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      kind: 'text',
      text: expect.stringContaining('too long'),
    });
    expect(result.current.mustStartFresh).toBe(true);

    act(() => {
      result.current.startFresh();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.transcript).toHaveLength(0);
    expect(result.current.mustStartFresh).toBe(false);
    expect(result.current.hasPendingProposal).toBe(false);
  });

  it('thrown error with JSON errors body renders calm plain-English fallback — no JSON/errors in text', async () => {
    const converseFn = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'Gateway error 422 on /converse-create: {"errors":[{"field":"tools","reason":"bad"}]}',
        ),
      );

    const { result } = renderHook(() => useChatConversation(converseFn));

    await act(async () => {
      await result.current.submit('make it better');
    });

    expect(result.current.messages).toHaveLength(2);
    const assistantMsg = result.current.messages[1];
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.kind).toBe('text');
    expect(assistantMsg.text).toBeDefined();
    expect(assistantMsg.text).not.toContain('"errors"');
    expect(assistantMsg.text).not.toContain('{"');
    expect(assistantMsg.text).not.toContain('422');
    expect(assistantMsg.text).not.toContain('too complex to process');
  });

  it('thrown network error renders calm plain-English fallback', async () => {
    const converseFn = vi.fn().mockRejectedValue(new Error('Network request failed'));

    const { result } = renderHook(() => useChatConversation(converseFn));

    await act(async () => {
      await result.current.submit('do something');
    });

    const assistantMsg = result.current.messages[1];
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.text).toBeDefined();
    expect(assistantMsg.text).not.toContain('too complex to process');
    expect(assistantMsg.text!.length).toBeGreaterThan(10);
  });

  it('markProposalActed sets hasPendingProposal to false', async () => {
    const converseFn = makeConverseFn({
      kind: 'proposal',
      baseline: { identity: 'old' } as never,
      proposal: { identity: 'new' } as never,
      changed_fields: { identity: { from: 'old', to: 'new' } },
    });

    const { result } = renderHook(() => useChatConversation(converseFn));

    await act(async () => {
      await result.current.submit('make it friendlier');
    });

    expect(result.current.hasPendingProposal).toBe(true);

    const proposalMsgId = result.current.messages[1].id;

    act(() => {
      result.current.markProposalActed(proposalMsgId);
    });

    expect(result.current.hasPendingProposal).toBe(false);
    expect(result.current.messages[1]).toMatchObject({ proposalActed: true });
  });
});
