import { Badge } from '@/components/ui/badge';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { FeedbackEvent } from '@/lib/types';
import { EVENT_TYPE_COLORS } from './task-detail-helpers';

interface FeedbackEventsSectionProps {
  feedbackEvents: FeedbackEvent[];
  feedbackError: Error | null | undefined;
}

export function FeedbackEventsSection({
  feedbackEvents,
  feedbackError,
}: FeedbackEventsSectionProps) {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4" data-testid="feedback-events-section">
      <h2 className="text-sm font-semibold">Feedback Events</h2>
      {feedbackError ? (
        <p className="text-sm text-red-400">Unable to load feedback events</p>
      ) : feedbackEvents.length > 0 ? (
        <ul className="space-y-2">
          {feedbackEvents.map((evt) => (
            <li
              key={evt.id}
              className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"
            >
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 text-xs font-medium',
                  EVENT_TYPE_COLORS[evt.event_type] ?? '',
                )}
              >
                {evt.event_type}
              </Badge>
              {evt.actor_id && (
                <span className="font-mono text-xs text-muted-foreground">{evt.actor_id}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {formatRelativeTime(evt.created_at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground italic">No feedback events</p>
      )}
    </div>
  );
}
