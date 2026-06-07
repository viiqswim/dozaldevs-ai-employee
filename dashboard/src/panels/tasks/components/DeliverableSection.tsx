import { Badge } from '@/components/ui/badge';
import type { Deliverable } from '@/lib/types';
import { CollapsibleJsonViewer } from './CollapsibleJsonViewer';

interface DeliverableSectionProps {
  deliverable: Deliverable | null;
  isAutoPass: boolean;
}

export function DeliverableSection({ deliverable, isAutoPass }: DeliverableSectionProps) {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4" data-testid="deliverable-content">
      <h2 className="text-sm font-semibold">Deliverable</h2>
      {deliverable ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {deliverable.delivery_type && (
              <Badge variant="outline" className="text-xs font-medium">
                {deliverable.delivery_type}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs font-medium text-muted-foreground">
              {deliverable.status}
            </Badge>
          </div>
          {deliverable.content ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Content</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-4 text-xs leading-relaxed">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(deliverable.content ?? ''), null, 2);
                  } catch {
                    return deliverable.content;
                  }
                })()}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No content</p>
          )}
          {deliverable.metadata && (
            <CollapsibleJsonViewer label="Metadata" data={deliverable.metadata} />
          )}
        </div>
      ) : isAutoPass ? (
        <p className="text-sm text-muted-foreground italic">
          No deliverable — task auto-completed during triage
        </p>
      ) : (
        <p className="text-sm text-muted-foreground italic">No deliverable yet</p>
      )}
    </div>
  );
}
