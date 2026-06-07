import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PendingApproval } from '@/lib/types';

interface ApprovalSectionProps {
  approvalsList: PendingApproval[];
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalSection({
  approvalsList,
  approving,
  rejecting,
  onApprove,
  onReject,
}: ApprovalSectionProps) {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <h2 className="text-sm font-semibold">Approval</h2>

      {approvalsList.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={approving || rejecting}
            onClick={onApprove}
          >
            {approving ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Approve
          </Button>
          <Button variant="destructive" disabled={approving || rejecting} onClick={onReject}>
            {rejecting ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Reject
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
          <p className="text-sm text-yellow-800">
            Approval card unavailable — this task may be a zombie (stuck in Reviewing with no
            pending approval)
          </p>
        </div>
      )}
    </div>
  );
}
