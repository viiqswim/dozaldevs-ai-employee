export interface StatCardProps {
  label: string;
  value: string;
  testId?: string;
  className?: string;
}

export function StatCard({ label, value, testId, className }: StatCardProps) {
  return (
    <div
      className={`rounded-md border bg-muted/30 p-3 text-center${className ? ` ${className}` : ''}`}
      data-testid={testId}
    >
      <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
