import { render, screen } from '@testing-library/react';
import { ApprovalSection } from '../panels/tasks/components/ApprovalSection';
import type { PendingApproval } from '../lib/types';

const approval: PendingApproval = {
  id: 'approval-1',
  tenant_id: '00000000-0000-0000-0000-000000000003',
  thread_uid: 'thread-1',
  task_id: 'task-1',
  slack_ts: '1700000000.000100',
  channel_id: 'C12345',
  urgency: false,
  recipient_name: null,
  context_label: null,
  reminder_sent_at: null,
  created_at: new Date().toISOString(),
};

test('ApprovalSection shows Approve and Reject buttons when an approval is pending', () => {
  render(
    <ApprovalSection
      approvalsList={[approval]}
      approving={false}
      rejecting={false}
      onApprove={() => {}}
      onReject={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
});

test('ApprovalSection shows a zombie warning when no approval is pending', () => {
  render(
    <ApprovalSection
      approvalsList={[]}
      approving={false}
      rejecting={false}
      onApprove={() => {}}
      onReject={() => {}}
    />,
  );
  expect(screen.getByText(/approval card unavailable/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
});
