import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface DeleteDialogProps {
  open: boolean;
  roleName: string | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}

export function DeleteDialog({
  open,
  roleName,
  loading,
  onOpenChange,
  onDelete,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {roleName}?</DialogTitle>
          <DialogDescription>
            This employee will be soft-deleted. You can restore it later from the &ldquo;Show
            deleted&rdquo; view.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={loading} onClick={onDelete}>
            {loading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
