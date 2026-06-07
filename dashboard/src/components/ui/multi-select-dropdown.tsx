import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export interface MultiSelectOption {
  value: string;
  label: string;
  badgeClass?: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  placeholder: string;
  width?: string;
  headerContent?: (close: () => void) => React.ReactNode;
  searchPlaceholder?: string;
  emptyMessage?: string;
  selectionCountLabel?: string;
  listMaxHeight?: string;
  dropdownMinWidth?: string;
}

export function MultiSelectDropdown({
  options,
  selected,
  onToggle,
  placeholder,
  width,
  headerContent,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options found',
  selectionCountLabel = 'selected',
  listMaxHeight = 'max-h-48',
  dropdownMinWidth = 'min-w-max',
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));

  const label =
    selected.size === 0
      ? placeholder
      : selected.size === 1
        ? (options.find((o) => selected.has(o.value))?.label ?? placeholder)
        : `${selected.size} ${selectionCountLabel}`;

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <div className={`relative ${width ?? 'w-44'}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div
          className={`absolute left-0 top-[calc(100%+4px)] z-50 w-full ${dropdownMinWidth} rounded-md border border-border bg-popover shadow-md`}
        >
          <div className="p-2">
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          {headerContent && headerContent(close)}
          <div className={`${listMaxHeight} overflow-y-auto py-1`}>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
              filtered.map((opt) => {
                const checked = selected.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onToggle(opt.value)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background'
                      }`}
                    >
                      {checked && (
                        <svg
                          viewBox="0 0 12 12"
                          className="h-3 w-3 fill-current"
                          aria-hidden="true"
                        >
                          <path
                            d="M10 3L5 8.5 2 5.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    {opt.badgeClass ? (
                      <Badge
                        variant="outline"
                        className={`${opt.badgeClass} pointer-events-none text-xs`}
                      >
                        {opt.label}
                      </Badge>
                    ) : (
                      <span>{opt.label}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
