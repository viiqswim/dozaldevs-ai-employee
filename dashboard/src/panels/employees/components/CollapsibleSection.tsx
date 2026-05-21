import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  id?: string;
}

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  children,
  actions,
  badge,
  id,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div id={id} className="border-none">
      <div className="flex w-full items-center justify-between gap-2 py-2">
        <button
          type="button"
          className="flex flex-col items-start gap-0.5 text-left transition-opacity hover:opacity-80"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            {badge}
          </div>
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            className="p-0.5 transition-opacity hover:opacity-80"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Collapse section' : 'Expand section'}
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </button>
        </div>
      </div>

      {open && <div>{children}</div>}
    </div>
  );
}
