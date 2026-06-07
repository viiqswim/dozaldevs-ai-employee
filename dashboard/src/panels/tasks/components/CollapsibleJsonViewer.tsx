import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const RAW_EVENT_TRUNCATE_CHARS = 2000;

export function CollapsibleJsonViewer({
  label,
  data,
  defaultOpen = false,
}: {
  label: string;
  data: Record<string, unknown>;
  defaultOpen?: boolean;
}) {
  const [showFull, setShowFull] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  const full = JSON.stringify(data, null, 2);
  const truncated = full.length > RAW_EVENT_TRUNCATE_CHARS;
  const displayed =
    !showFull && truncated ? full.slice(0, RAW_EVENT_TRUNCATE_CHARS) + '\n...' : full;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {label}
      </button>
      {open && (
        <div className="mt-2">
          <pre className="overflow-x-auto rounded-md border bg-muted/50 p-4 text-xs leading-relaxed">
            {displayed}
          </pre>
          {truncated && (
            <button
              type="button"
              onClick={() => setShowFull((v) => !v)}
              className="mt-1 text-xs text-primary hover:underline"
            >
              {showFull ? 'Show less' : 'Show full'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
