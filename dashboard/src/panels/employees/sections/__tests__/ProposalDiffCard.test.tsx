import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { ProposalDiffCard } from '../ProposalDiffCard';

vi.mock('react-diff-viewer-continued', () => ({
  default: ({ oldValue, newValue }: { oldValue: string; newValue: string }) => (
    <div data-testid="diff-viewer">
      <div data-testid="diff-old">{oldValue}</div>
      <div data-testid="diff-new">{newValue}</div>
    </div>
  ),
  DiffMethod: { WORDS: 'diffWords' },
}));

describe('ProposalDiffCard', () => {
  test('renders prose diffs for both changed fields and fires onApprove/onDeny on click', () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <ProposalDiffCard
        proseChanges={[
          { field: 'identity', before: 'Old personality text', after: 'New personality text' },
          { field: 'execution_steps', before: 'Old steps text', after: 'New steps text' },
        ]}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );

    expect(screen.getByText('Personality')).toBeInTheDocument();
    expect(screen.getByText('How it works')).toBeInTheDocument();

    const diffs = screen.getAllByTestId('diff-viewer');
    expect(diffs).toHaveLength(2);

    const approveBtn = screen.getByRole('button', { name: /approve/i });
    expect(approveBtn).not.toBeDisabled();
    fireEvent.click(approveBtn);
    expect(onApprove).toHaveBeenCalledOnce();

    const denyBtn = screen.getByRole('button', { name: /deny/i });
    fireEvent.click(denyBtn);
    expect(onDeny).toHaveBeenCalledOnce();
  });

  test('Approve is disabled until the confirm checkbox is ticked when approval is turned OFF', () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <ProposalDiffCard
        proseChanges={[]}
        approvalChange={{ from: true, to: false }}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );

    expect(screen.getByText(/act WITHOUT asking you first/i)).toBeInTheDocument();

    const approveBtn = screen.getByRole('button', { name: /approve/i });
    expect(approveBtn).toBeDisabled();

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(approveBtn).not.toBeDisabled();
    fireEvent.click(approveBtn);
    expect(onApprove).toHaveBeenCalledOnce();
  });
});
