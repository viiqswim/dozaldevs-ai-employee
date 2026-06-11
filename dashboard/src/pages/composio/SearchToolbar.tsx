import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface SearchToolbarProps {
  search: string;
  category: string;
  categories: { slug: string; name: string }[];
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
}

export function SearchToolbar({
  search,
  category,
  categories,
  onSearchChange,
  onCategoryChange,
}: SearchToolbarProps) {
  const allChips = [{ slug: '', name: 'All' }, ...categories];

  return (
    <div className="rounded-lg border bg-card px-5 py-4 flex flex-col gap-3">
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <Input
          className="pl-8 text-sm"
          placeholder="Search apps…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          spellCheck={false}
          aria-label="Search apps"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {allChips.map((chip) => {
          const isActive = chip.slug === category;
          return (
            <button
              key={chip.slug}
              type="button"
              aria-pressed={isActive}
              onClick={() => onCategoryChange(chip.slug)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {chip.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
