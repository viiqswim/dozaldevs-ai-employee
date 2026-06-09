import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface TriggerDialogProps {
  open: boolean;
  roleName: string | null;
  triggering: boolean;
  onOpenChange: (open: boolean) => void;
  onTrigger: (prompt?: string) => void;
}

export function TriggerDialog({
  open,
  roleName,
  triggering,
  onOpenChange,
  onTrigger,
}: TriggerDialogProps) {
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (!open) setPrompt('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trigger {roleName}</DialogTitle>
          <DialogDescription>
            Optionally describe what this employee should work on.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">What should this employee work on?</label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px] resize-y"
            placeholder="e.g., Fix the login page timeout bug"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={triggering}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-3 pt-1">
          <Button
            disabled={triggering || !prompt.trim()}
            onClick={() => onTrigger(prompt)}
            className="w-full"
          >
            {triggering ? 'Starting…' : 'Send'}
          </Button>
          <div className="text-center">
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={triggering}
              onClick={() => onTrigger()}
            >
              Trigger without instructions
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
