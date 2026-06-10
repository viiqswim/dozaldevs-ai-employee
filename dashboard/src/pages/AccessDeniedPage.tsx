import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function AccessDeniedPage() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Access restricted</h1>
          <p className="text-sm text-muted-foreground">You don&apos;t have access to this area.</p>
        </div>

        <div className="rounded-lg border bg-card px-5 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            This section is only available to platform administrators. If you believe this is a
            mistake, please contact your administrator.
          </p>

          <Button asChild className="w-full">
            <Link to="/dashboard">Go back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
