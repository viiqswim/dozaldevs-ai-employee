import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { setSecret, deleteSecret } from '@/lib/gateway';

export interface CustomCredentialField {
  key: string;
  label: string;
  type?: 'text' | 'password';
}

export interface CustomCredentialApp {
  id: string;
  name: string;
  description: string;
  fields: CustomCredentialField[];
}

export const CUSTOM_CREDENTIAL_APPS: CustomCredentialApp[] = [
  {
    id: 'hostfully',
    name: 'Hostfully',
    description: 'Property management platform for vacation rentals',
    fields: [
      { key: 'hostfully_api_key', label: 'API Key' },
      { key: 'hostfully_agency_uid', label: 'Agency UID' },
    ],
  },
  {
    id: 'sifely',
    name: 'Sifely',
    description: 'Smart lock management for short-term rentals',
    fields: [
      { key: 'sifely_username', label: 'Username' },
      { key: 'sifely_password', label: 'Password', type: 'password' },
    ],
  },
];

// Hardcoded complete Tailwind class pairs — required so the build scanner
// detects them and does not purge these color utilities.
const AVATAR_COLORS: ReadonlyArray<readonly [string, string]> = [
  ['bg-blue-100', 'text-blue-700'],
  ['bg-purple-100', 'text-purple-700'],
  ['bg-orange-100', 'text-orange-700'],
  ['bg-green-100', 'text-green-700'],
  ['bg-rose-100', 'text-rose-700'],
  ['bg-amber-100', 'text-amber-700'],
  ['bg-cyan-100', 'text-cyan-700'],
  ['bg-indigo-100', 'text-indigo-700'],
] as const;

function getAvatarClasses(name: string): readonly [string, string] {
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export interface CustomCredentialCardProps {
  app: CustomCredentialApp;
  tenantId: string;
  isConnected: boolean;
  onUpdated: () => void;
}

export function CustomCredentialCard({
  app,
  tenantId,
  isConnected,
  onUpdated,
}: CustomCredentialCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [bgColor, textColor] = getAvatarClasses(app.name);

  function handleOpenDialog() {
    setFieldValues({}); // always start with empty fields — never pre-fill secrets
    setDialogOpen(true);
  }

  function handleFieldChange(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const missing = app.fields.filter((f) => !fieldValues[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      await Promise.all(app.fields.map((f) => setSecret(tenantId, f.key, fieldValues[f.key])));
      toast.success(`${app.name} connected.`);
      setDialogOpen(false);
      onUpdated();
    } catch {
      toast.error('Could not save credentials. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await Promise.all(app.fields.map((f) => deleteSecret(tenantId, f.key)));
      toast.success(`${app.name} disconnected.`);
      onUpdated();
    } catch {
      toast.error('Could not disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      <div
        className={cn(
          'rounded-lg border bg-card px-5 py-4',
          'flex flex-col gap-3',
          'motion-safe:hover:shadow-md motion-safe:hover:border-border/80 motion-safe:transition-[box-shadow] motion-safe:duration-200',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'h-12 w-12 flex-shrink-0 rounded-lg flex items-center justify-center select-none',
              bgColor,
              textColor,
            )}
            aria-hidden="true"
          >
            <span className="font-semibold text-lg leading-none">
              {app.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground truncate">{app.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{app.description}</p>
          </div>
        </div>

        <div className="flex items-center justify-end pt-1 mt-auto">
          {isConnected ? (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Connected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={handleOpenDialog} className="text-xs">
              Connect {app.name}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {app.name}</DialogTitle>
            <DialogDescription>
              Enter your {app.name} credentials. They are stored securely and never shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {app.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label
                  htmlFor={`cred-${field.key}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {field.label}
                </label>
                <Input
                  id={`cred-${field.key}`}
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={fieldValues[field.key] ?? ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save credentials'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
