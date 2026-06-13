import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditHistoryList } from '../EditHistoryList';
import type { EditHistoryRow } from '@/lib/types';

vi.mock('@/lib/gateway', () => ({
  listEditHistory: vi.fn(),
  revertEdit: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>();
  return {
    ...actual,
    formatRelativeTime: (dateStr: string) => `relative(${dateStr})`,
  };
});

const mockRow: EditHistoryRow = {
  id: 'hist-1',
  archetype_id: 'arch-1',
  tenant_id: 'tenant-1',
  request_text: 'make replies shorter',
  before_json: { identity: 'old' },
  after_json: { identity: 'new' },
  changed_fields: ['identity'],
  kind: 'edit',
  actor_user_id: null,
  created_at: new Date().toISOString(),
  deleted_at: null,
};

describe('EditHistoryList', () => {
  const onReverted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders history entries', async () => {
    const { listEditHistory } = await import('@/lib/gateway');
    vi.mocked(listEditHistory).mockResolvedValue([mockRow]);

    render(<EditHistoryList archetypeId="arch-1" tenantId="tenant-1" onReverted={onReverted} />);

    await waitFor(() => {
      expect(screen.getByText('make replies shorter')).toBeInTheDocument();
    });
    expect(screen.getByText(/Personality/)).toBeInTheDocument();
  });

  it('shows empty state when no history', async () => {
    const { listEditHistory } = await import('@/lib/gateway');
    vi.mocked(listEditHistory).mockResolvedValue([]);

    render(<EditHistoryList archetypeId="arch-1" tenantId="tenant-1" onReverted={onReverted} />);

    await waitFor(() => {
      expect(screen.getByText(/no changes recorded/i)).toBeInTheDocument();
    });
  });

  it('calls revertEdit and onReverted on confirm revert', async () => {
    const { listEditHistory, revertEdit } = await import('@/lib/gateway');
    vi.mocked(listEditHistory).mockResolvedValue([mockRow]);
    vi.mocked(revertEdit).mockResolvedValue({
      archetype: {} as never,
      history: mockRow,
    });

    render(<EditHistoryList archetypeId="arch-1" tenantId="tenant-1" onReverted={onReverted} />);

    await waitFor(() => screen.getByText('make replies shorter'));

    // Click Revert button to show confirm
    fireEvent.click(screen.getByRole('button', { name: /revert/i }));
    // Click Yes to confirm
    fireEvent.click(screen.getByRole('button', { name: /yes/i }));

    await waitFor(() => {
      expect(revertEdit).toHaveBeenCalledWith('tenant-1', 'arch-1', 'hist-1');
      expect(onReverted).toHaveBeenCalled();
    });
  });

  it('does not show Revert button for revert-kind rows', async () => {
    const { listEditHistory } = await import('@/lib/gateway');
    const revertRow: EditHistoryRow = {
      ...mockRow,
      kind: 'revert',
      request_text: 'Revert to change from 2026-01-01',
    };
    vi.mocked(listEditHistory).mockResolvedValue([revertRow]);

    render(<EditHistoryList archetypeId="arch-1" tenantId="tenant-1" onReverted={onReverted} />);

    await waitFor(() => screen.getByText(/Revert to change from/));
    expect(screen.queryByRole('button', { name: /revert/i })).not.toBeInTheDocument();
  });

  it('shows No button to cancel confirm', async () => {
    const { listEditHistory } = await import('@/lib/gateway');
    vi.mocked(listEditHistory).mockResolvedValue([mockRow]);

    render(<EditHistoryList archetypeId="arch-1" tenantId="tenant-1" onReverted={onReverted} />);

    await waitFor(() => screen.getByText('make replies shorter'));

    // Click Revert to enter confirm mode
    fireEvent.click(screen.getByRole('button', { name: /revert/i }));
    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();

    // Click No to cancel
    fireEvent.click(screen.getByRole('button', { name: /no/i }));
    expect(screen.queryByRole('button', { name: /yes/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revert/i })).toBeInTheDocument();
  });

  it('refreshes when refreshTrigger changes', async () => {
    const { listEditHistory } = await import('@/lib/gateway');
    vi.mocked(listEditHistory).mockResolvedValue([mockRow]);

    const { rerender } = render(
      <EditHistoryList
        archetypeId="arch-1"
        tenantId="tenant-1"
        onReverted={onReverted}
        refreshTrigger={0}
      />,
    );

    await waitFor(() => screen.getByText('make replies shorter'));
    expect(listEditHistory).toHaveBeenCalledTimes(1);

    rerender(
      <EditHistoryList
        archetypeId="arch-1"
        tenantId="tenant-1"
        onReverted={onReverted}
        refreshTrigger={1}
      />,
    );

    await waitFor(() => expect(listEditHistory).toHaveBeenCalledTimes(2));
  });
});
