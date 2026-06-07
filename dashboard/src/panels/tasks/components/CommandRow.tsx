import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export function CommandRow({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
