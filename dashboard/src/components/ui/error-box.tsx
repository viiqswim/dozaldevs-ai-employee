import { Button } from '@/components/ui/button';

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
      <p className="font-semibold">Failed to load</p>
      <p className="mt-1 text-destructive/80">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
