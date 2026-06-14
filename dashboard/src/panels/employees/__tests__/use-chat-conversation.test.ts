import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatConversation } from '../use-chat-conversation';

vi.mock('@/lib/gateway', () => ({
  converseEdit: vi.fn(),
}));

describe('useChatConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submit with kind:question appends question bubble and adds both turns to transcript', async () => {
    const { converseEdit } = await import('@/lib/gateway');
    vi.mocked(converseEdit).mockResolvedValue({ kind: 'question', question: 'What do you mean?' });

    const { result } = renderHook(() => useChatConversation('tenant-1', 'arch-1'));

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
    const { converseEdit } = await import('@/lib/gateway');
    vi.mocked(converseEdit).mockResolvedValue({
      kind: 'proposal',
      baseline: { identity: 'old' } as never,
      proposal: { identity: 'new' } as never,
      changed_fields: { identity: { from: 'old', to: 'new' } },
    });

    const { result } = renderHook(() => useChatConversation('tenant-1', 'arch-1'));

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
    const { converseEdit } = await import('@/lib/gateway');
    vi.mocked(converseEdit).mockResolvedValue({ kind: 'no_change' });

    const { result } = renderHook(() => useChatConversation('tenant-1', 'arch-1'));

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
    const { converseEdit } = await import('@/lib/gateway');
    vi.mocked(converseEdit).mockResolvedValue({ kind: 'too_long' });

    const { result } = renderHook(() => useChatConversation('tenant-1', 'arch-1'));

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

  it('markProposalActed sets hasPendingProposal to false', async () => {
    const { converseEdit } = await import('@/lib/gateway');
    vi.mocked(converseEdit).mockResolvedValue({
      kind: 'proposal',
      baseline: { identity: 'old' } as never,
      proposal: { identity: 'new' } as never,
      changed_fields: { identity: { from: 'old', to: 'new' } },
    });

    const { result } = renderHook(() => useChatConversation('tenant-1', 'arch-1'));

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
