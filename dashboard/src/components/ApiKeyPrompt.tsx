import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isAdminKeySet, setAdminApiKey } from '@/lib/gateway';

interface ApiKeyPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApiKeyPrompt({ open, onOpenChange }: ApiKeyPromptProps) {
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdminKeySet()) {
      onOpenChange(true);
    }
  }, [onOpenChange]);

  function handleSave() {
    if (!key.trim()) {
      setError('API key cannot be empty.');
      return;
    }
    setAdminApiKey(key.trim());
    setKey('');
    setError('');
    onOpenChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Admin API Key</DialogTitle>
          <DialogDescription>
            Enter your admin API key to authenticate with the gateway.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              placeholder="Enter your ADMIN_API_KEY"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              className="pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Find this in your <code className="font-mono">.env</code> file as{' '}
            <code className="font-mono">ADMIN_API_KEY</code>.
          </p>
          <div className="flex justify-end gap-2">
            {isAdminKeySet() && (
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
