import { Badge } from '@/components/ui/badge';
import { STATUS_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { TaskStatus } from '@/lib/types';

interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent font-medium', STATUS_COLORS[status], className)}
    >
      {status}
    </Badge>
  );
}
