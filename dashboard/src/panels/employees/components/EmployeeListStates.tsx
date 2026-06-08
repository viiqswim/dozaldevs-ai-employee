import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';

function SkeletonRow() {
  return (
    <TableRow>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </TableCell>
      ))}
    </TableRow>
  );
}

export function EmployeeListLoading() {
  const navigate = useNavigate();
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Employees</h2>
        <Button onClick={() => navigate('/dashboard/employees/new')}>+ New Employee</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            {['Employee', 'Model', 'Runtime', 'Status', 'Approval', 'Concurrency', 'Actions'].map(
              (col) => (
                <TableHead key={col}>{col}</TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EmployeeListError({ error, refresh }: { error: Error; refresh: () => void }) {
  return (
    <div className="p-6">
      <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-semibold">Failed to load employees</p>
        <p className="mt-1 text-destructive/80">{error.message}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
          onClick={refresh}
        >
          Retry
        </Button>
      </div>
    </div>
  );
}

export function EmployeeListEmpty() {
  const navigate = useNavigate();
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Employees</h2>
        <Button onClick={() => navigate('/dashboard/employees/new')}>+ New Employee</Button>
      </div>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium mb-1">No employees yet</p>
        <p className="text-sm text-muted-foreground mb-4">
          Create your first AI employee to get started.
        </p>
        <Button onClick={() => navigate('/dashboard/employees/new')}>Create Employee</Button>
      </div>
    </div>
  );
}
