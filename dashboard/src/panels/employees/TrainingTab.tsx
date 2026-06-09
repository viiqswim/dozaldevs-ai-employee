import { useState, useCallback, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { gatewayFetch } from '@/lib/gateway';
import { createRule, updateRule, deleteRule } from '@/lib/gateway';
import { usePoll } from '@/hooks/use-poll';
import type { EmployeeRule } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus, Check, X, Pencil, Trash2 } from 'lucide-react';

interface TrainingTabProps {
  archetypeId: string;
  tenantId: string;
}

const STATUS_LABELS: Record<EmployeeRule['status'], string> = {
  confirmed: 'Active',
  awaiting_input: 'Needs Review',
  proposed: 'Needs Review',
  rejected: 'Rejected',
};

const STATUS_CLASSES: Record<EmployeeRule['status'], string> = {
  confirmed:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  awaiting_input:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  proposed:
    'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
  rejected:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
};

export function TrainingTab({ archetypeId, tenantId }: TrainingTabProps) {
  const [localRules, setLocalRules] = useState<EmployeeRule[] | null>(null);
  const mutatingRef = useRef(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newRuleText, setNewRuleText] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchFn = useCallback(
    () =>
      gatewayFetch<EmployeeRule[]>(
        `/admin/tenants/${tenantId}/employee-rules?archetype_id=${archetypeId}&limit=50`,
      ),
    [tenantId, archetypeId],
  );

  const { data: fetchedRules, error, loading, refresh } = usePoll(fetchFn);

  useEffect(() => {
    if (!mutatingRef.current) {
      setLocalRules(fetchedRules);
    }
  }, [fetchedRules]);

  const displayRules = localRules ?? fetchedRules ?? [];

  const handleApprove = async (rule: EmployeeRule) => {
    mutatingRef.current = true;
    setSaving(rule.id);
    const prev = localRules ?? fetchedRules ?? [];
    setLocalRules(prev.map((r) => (r.id === rule.id ? { ...r, status: 'confirmed' } : r)));
    try {
      await updateRule(tenantId, archetypeId, rule.id, { status: 'confirmed' });
      toast.success('Rule approved');
      refresh();
      mutatingRef.current = false;
    } catch (err) {
      setLocalRules(null);
      mutatingRef.current = false;
      toast.error(err instanceof Error ? err.message : 'Failed to approve rule');
    } finally {
      setSaving(null);
    }
  };

  const handleReject = async (rule: EmployeeRule) => {
    mutatingRef.current = true;
    setSaving(rule.id);
    const prev = localRules ?? fetchedRules ?? [];
    setLocalRules(prev.map((r) => (r.id === rule.id ? { ...r, status: 'rejected' } : r)));
    try {
      await updateRule(tenantId, archetypeId, rule.id, { status: 'rejected' });
      toast.success('Rule rejected');
      refresh();
      mutatingRef.current = false;
    } catch (err) {
      setLocalRules(null);
      mutatingRef.current = false;
      toast.error(err instanceof Error ? err.message : 'Failed to reject rule');
    } finally {
      setSaving(null);
    }
  };

  const startEdit = (rule: EmployeeRule) => {
    setEditingId(rule.id);
    setEditText(rule.rule_text);
  };

  const handleSaveEdit = async (rule: EmployeeRule) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    mutatingRef.current = true;
    setSaving(rule.id);
    const prev = localRules ?? fetchedRules ?? [];
    setLocalRules(prev.map((r) => (r.id === rule.id ? { ...r, rule_text: trimmed } : r)));
    setEditingId(null);
    try {
      await updateRule(tenantId, archetypeId, rule.id, { rule_text: trimmed });
      toast.success('Rule updated');
      refresh();
      mutatingRef.current = false;
    } catch (err) {
      setLocalRules(null);
      mutatingRef.current = false;
      toast.error(err instanceof Error ? err.message : 'Failed to update rule');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    mutatingRef.current = true;
    const id = deletingId;
    const prev = localRules ?? fetchedRules ?? [];
    setLocalRules(prev.filter((r) => r.id !== id));
    setDeletingId(null);
    try {
      await deleteRule(tenantId, archetypeId, id);
      toast.success('Rule deleted');
      refresh();
      mutatingRef.current = false;
    } catch (err) {
      setLocalRules(null);
      mutatingRef.current = false;
      toast.error(err instanceof Error ? err.message : 'Failed to delete rule');
    } finally {
      setDeleting(false);
    }
  };

  const handleAdd = async () => {
    const trimmed = newRuleText.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const newRule = await createRule(tenantId, archetypeId, trimmed);
      mutatingRef.current = true;
      setLocalRules([newRule, ...(localRules ?? fetchedRules ?? [])]);
      setNewRuleText('');
      setAddOpen(false);
      toast.success('Rule added');
      refresh();
      mutatingRef.current = false;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add rule');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {displayRules.length > 0
            ? `${displayRules.length} rule${displayRules.length === 1 ? '' : 's'}`
            : ''}
        </p>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Rule
        </Button>
      </div>

      {displayRules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No training rules yet. As this employee works and you provide feedback in Slack, it will
            learn rules automatically. You can also add rules manually above.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayRules.map((rule) => {
            const isEditing = editingId === rule.id;
            const isSaving = saving === rule.id;
            const status = rule.status;
            const needsReview = status === 'awaiting_input' || status === 'proposed';
            const isActive = status === 'confirmed';

            return (
              <div key={rule.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start gap-3">
                  <Badge
                    variant="outline"
                    className={STATUS_CLASSES[status] ?? STATUS_CLASSES.proposed}
                  >
                    {STATUS_LABELS[status] ?? status}
                  </Badge>

                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          rows={3}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={!editText.trim() || isSaving}
                            onClick={() => void handleSaveEdit(rule)}
                          >
                            {isSaving ? 'Saving…' : 'Save'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSaving}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed">{rule.rule_text}</p>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="mr-1 text-xs text-muted-foreground">
                        {formatRelativeTime(rule.created_at)}
                      </span>

                      {needsReview && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSaving}
                            className="h-7 border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950"
                            onClick={() => void handleApprove(rule)}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSaving}
                            className="h-7 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                            onClick={() => void handleReject(rule)}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </>
                      )}

                      {isActive && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isSaving}
                            className="h-7 text-muted-foreground hover:text-foreground"
                            onClick={() => startEdit(rule)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isSaving}
                            className="h-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
                            onClick={() => setDeletingId(rule.id)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Training Rule</DialogTitle>
            <DialogDescription>
              Manually add a rule that this employee will follow when completing tasks.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            rows={4}
            placeholder="e.g. Always greet guests by name when available."
            value={newRuleText}
            onChange={(e) => setNewRuleText(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setNewRuleText('');
              }}
            >
              Cancel
            </Button>
            <Button disabled={!newRuleText.trim() || adding} onClick={() => void handleAdd()}>
              {adding ? 'Adding…' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deletingId}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this rule? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
