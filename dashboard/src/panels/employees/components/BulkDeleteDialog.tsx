import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { deleteArchetype } from '@/lib/gateway';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import type { Archetype } from '@/lib/types';

interface BulkDeleteDialogProps {
  open: boolean;
  count: number;
  selected: Set<string>;
  archetypes: Archetype[];
  refresh: () => void;
  onClose: () => void;
}

export function BulkDeleteDialog({
  open,
  count,
  selected,
  archetypes,
  refresh,
  onClose,
}: BulkDeleteDialogProps) {
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(false);

  const handleBulkDelete = async () => {
    setLoading(true);
    const ids = Array.from(selected);
    let successCount = 0;
    for (const id of ids) {
      try {
        await deleteArchetype(tenantId!, id);
        successCount++;
      } catch {
        const archetype = archetypes.find((a) => a.id === id);
        toast.error(`Failed to delete ${archetype?.role_name ?? id}`);
      }
    }
    if (successCount > 0)
      toast.success(`${successCount} employee${successCount > 1 ? 's' : ''} deleted`);
    setLoading(false);
    refresh();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {count} employee{count > 1 ? 's' : ''}?
          </DialogTitle>
          <DialogDescription>
            {count} employee{count > 1 ? 's' : ''} will be soft-deleted. You can restore them later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={loading} onClick={() => void handleBulkDelete()}>
            {loading ? 'Deleting…' : 'Delete All'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
