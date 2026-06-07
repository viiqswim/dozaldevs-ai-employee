import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollapsibleJsonViewer } from './CollapsibleJsonViewer';
import { asRecordUnknown } from './task-detail-helpers';

interface TranscriptSectionProps {
  showTranscript: boolean;
  execution: { id: string } | null;
  transcript: unknown[] | null;
  transcriptLoading: boolean;
  onShowTranscript: () => void;
  onHideTranscript: () => void;
}

export function TranscriptSection({
  showTranscript,
  execution,
  transcript,
  transcriptLoading,
  onShowTranscript,
  onHideTranscript,
}: TranscriptSectionProps) {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Session Transcript</h2>
        {!showTranscript && (
          <Button variant="outline" size="sm" onClick={onShowTranscript} disabled={!execution}>
            View Transcript
          </Button>
        )}
        {showTranscript && (
          <Button variant="ghost" size="sm" onClick={onHideTranscript}>
            Hide
          </Button>
        )}
      </div>

      {showTranscript && (
        <>
          {transcriptLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Loading transcript…
            </div>
          )}
          {!transcriptLoading && transcript === null && (
            <p className="text-sm text-muted-foreground italic">Transcript not available</p>
          )}
          {!transcriptLoading && transcript !== null && transcript.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Transcript is empty</p>
          )}
          {!transcriptLoading && transcript !== null && transcript.length > 0 && (
            <div className="space-y-2">
              {transcript.map((msg, i) => (
                <CollapsibleJsonViewer
                  key={i}
                  label={`Message ${i + 1}`}
                  data={asRecordUnknown(msg)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!showTranscript && !execution && (
        <p className="text-xs text-muted-foreground italic">
          No execution record — transcript unavailable
        </p>
      )}
    </div>
  );
}
