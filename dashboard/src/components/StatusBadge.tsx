import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: string | null;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'active') {
    return (
      <Badge
        variant="outline"
        className="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
      >
        Active
      </Badge>
    );
  }
  if (status === 'draft') {
    return (
      <Badge
        variant="outline"
        className="border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
      >
        Draft
      </Badge>
    );
  }
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
  return (
    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
      {label}
    </Badge>
  );
}
