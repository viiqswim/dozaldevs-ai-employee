import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { listEditHistory, revertEdit } from '@/lib/gateway';
import type { EditHistoryRow } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';

interface EditHistoryListProps {
  archetypeId: string;
  tenantId: string;
  onReverted: () => void;
  refreshTrigger?: number;
}

const FIELD_LABELS: Record<string, string> = {
  identity: 'Personality',
  execution_steps: 'How it works',
  delivery_steps: 'How it delivers',
  overview: 'Overview',
  risk_model: 'Approval setting',
  tool_registry: 'Capabilities',
  trigger_sources: 'Schedule',
  input_schema: 'Required information',
};

export function EditHistoryList({
  archetypeId,
  tenantId,
  onReverted,
  refreshTrigger,
}: EditHistoryListProps) {
  const [history, setHistory] = useState<EditHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [confirmRevertId, setConfirmRevertId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const rows = await listEditHistory(tenantId, archetypeId);
      setHistory(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load change history');
    } finally {
      setLoading(false);
    }
  }, [tenantId, archetypeId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory, refreshTrigger]);

  const handleRevert = async (row: EditHistoryRow) => {
    setRevertingId(row.id);
    setConfirmRevertId(null);
    try {
      await revertEdit(tenantId, archetypeId, row.id);
      toast.success('Change reverted successfully.');
      onReverted();
      void fetchHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revert change');
    } finally {
      setRevertingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No changes recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {history.map((row) => {
        const isReverting = revertingId === row.id;
        const isConfirming = confirmRevertId === row.id;
        const isRevert = row.kind === 'revert';
        const isCreate = row.kind === 'create';
        const changedLabels = row.changed_fields.map((f) => FIELD_LABELS[f] ?? f).join(', ');

        return (
          <div
            key={row.id}
            className={`rounded-lg border bg-card px-4 py-3 flex items-start justify-between gap-3 ${isRevert ? 'border-amber-200 dark:border-amber-800' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {isRevert ? '↩ Reverted: ' : isCreate ? '✦ ' : ''}
                {row.request_text}
              </p>
              {changedLabels && (
                <p className="text-xs text-muted-foreground mt-0.5">Changed: {changedLabels}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatRelativeTime(row.created_at)}
              </p>
            </div>

            {!isRevert && !isCreate && (
              <div className="shrink-0">
                {isConfirming ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Revert?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      disabled={isReverting}
                      onClick={() => void handleRevert(row)}
                    >
                      {isReverting ? 'Reverting…' : 'Yes'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={isReverting}
                      onClick={() => setConfirmRevertId(null)}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    disabled={isReverting}
                    onClick={() => setConfirmRevertId(row.id)}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Revert
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
