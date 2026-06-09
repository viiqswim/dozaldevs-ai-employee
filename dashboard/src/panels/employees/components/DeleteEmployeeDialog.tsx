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

interface DeleteEmployeeDialogProps {
  archetype: Archetype | null;
  refresh: () => void;
  onClose: () => void;
}

export function DeleteEmployeeDialog({ archetype, refresh, onClose }: DeleteEmployeeDialogProps) {
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!tenantId || !archetype) return;
    setLoading(true);
    try {
      await deleteArchetype(tenantId, archetype.id);
      toast.success('Employee deleted');
      onClose();
      refresh();
    } catch {
      toast.error('Failed to delete employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={archetype !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {archetype?.role_name}?</DialogTitle>
          <DialogDescription>
            This employee will be soft-deleted. You can restore it later from the &ldquo;Show
            deleted&rdquo; view.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={loading} onClick={() => void handleDelete()}>
            {loading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
