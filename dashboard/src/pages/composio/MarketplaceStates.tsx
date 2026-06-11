import { toast } from 'sonner';
import { ErrorBox } from '@/components/ui/error-box';

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg border bg-muted h-32" />
      ))}
    </div>
  );
}

export function EmptySearchState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <p className="text-sm text-muted-foreground">No apps match &ldquo;{query}&rdquo;.</p>
      <button onClick={onClear} className="text-sm text-primary hover:underline">
        Clear search
      </button>
    </div>
  );
}

export function CatalogErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-6">
      <ErrorBox message="Couldn't load the app catalog. Please try again." onRetry={onRetry} />
    </div>
  );
}

export function showPopupBlockedToast() {
  toast.error('Allow pop-ups for this site, then try again.');
}
