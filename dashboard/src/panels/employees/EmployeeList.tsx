import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Checkbox } from '@/components/ui/checkbox';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import type { Archetype } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { DeleteEmployeeDialog } from './components/DeleteEmployeeDialog';
import { BulkDeleteDialog } from './components/BulkDeleteDialog';
import { EmployeeRowActions } from './components/EmployeeRowActions';
import {
  EmployeeListLoading,
  EmployeeListError,
  EmployeeListEmpty,
} from './components/EmployeeListStates';

function shortModel(model: string | null): string {
  if (!model) return '—';
  return model.split('/').pop() ?? model;
}

export function EmployeeList() {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const statusFilter = (searchParams.get('status') ?? 'all') as
    | 'all'
    | 'active'
    | 'draft'
    | 'deleted';

  const setSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('q', value);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };
  const setStatusFilter = (value: 'all' | 'active' | 'draft' | 'deleted') => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') next.set('status', value);
    else next.delete('status');
    setSearchParams(next, { replace: true });
  };
  const [deletingArchetype, setDeletingArchetype] = useState<Archetype | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchArchetypes = useCallback(() => {
    const params: Record<string, string> = {
      ...scopeByTenant(tenantId),
      order: 'created_at.desc',
      limit: '50',
    };
    if (statusFilter === 'deleted') {
      params['deleted_at'] = 'not.is.null';
    } else {
      params['deleted_at'] = 'is.null';
      params['status'] = 'neq.superseded';
      if (statusFilter === 'active') params['status'] = 'eq.active';
      if (statusFilter === 'draft') params['status'] = 'eq.draft';
    }
    return postgrestFetch<Archetype>('archetypes', params);
  }, [tenantId, statusFilter]);

  const { data: archetypes, error, loading, refresh } = usePoll(fetchArchetypes);

  useEffect(() => {
    setSelected(new Set());
  }, [statusFilter, search]);

  if (loading) return <EmployeeListLoading />;
  if (error) return <EmployeeListError error={error} refresh={refresh} />;
  if (!archetypes || archetypes.length === 0) return <EmployeeListEmpty />;

  const filteredArchetypes = archetypes.filter(
    (a) => a.role_name?.toLowerCase().includes(search.toLowerCase()) ?? true,
  );

  const allSelected = filteredArchetypes.length > 0 && selected.size === filteredArchetypes.length;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Employees</h2>
        <Button onClick={() => navigate('/dashboard/employees/new')}>+ New Employee</Button>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Input
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <SearchableSelect
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'draft', label: 'Draft' },
            { value: 'deleted', label: 'Deleted' },
          ]}
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'draft' | 'deleted')}
          placeholder="Status"
          className="w-36"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-background px-4 py-2 shadow-md mb-4">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
            Delete Selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelected(new Set(filteredArchetypes.map((a) => a.id)));
                  } else {
                    setSelected(new Set());
                  }
                }}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Runtime</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Approval</TableHead>
            <TableHead>Concurrency</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredArchetypes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                No results match your search or filter.
              </TableCell>
            </TableRow>
          ) : (
            filteredArchetypes.map((archetype) => {
              const isDraft = archetype.status === 'draft';
              const isDeleted = archetype.deleted_at !== null;
              const isSelected = selected.has(archetype.id);
              return (
                <TableRow
                  key={archetype.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    if (isDeleted) return;
                    navigate(
                      isDraft
                        ? `/dashboard/employees/${archetype.id}/edit`
                        : `/dashboard/employees/${archetype.id}`,
                    );
                  }}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {!isDeleted && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          const next = new Set(selected);
                          if (checked) {
                            next.add(archetype.id);
                          } else {
                            next.delete(archetype.id);
                          }
                          setSelected(next);
                        }}
                        aria-label={`Select ${archetype.role_name ?? archetype.id}`}
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {archetype.role_name ?? (
                      <span className="text-muted-foreground">{archetype.id}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {shortModel(archetype.model)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {archetype.runtime ?? '—'}
                  </TableCell>
                  <TableCell>
                    {archetype.deleted_at !== null ? (
                      <Badge
                        variant="outline"
                        className="border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                      >
                        Deleted
                      </Badge>
                    ) : (
                      <StatusBadge status={archetype.status ?? null} />
                    )}
                  </TableCell>
                  <TableCell>
                    {archetype.risk_model?.approval_required ? (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      >
                        Required
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                      >
                        Auto
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {archetype.concurrency_limit}
                  </TableCell>
                  <TableCell>
                    <EmployeeRowActions
                      archetype={archetype}
                      refresh={refresh}
                      onDeleteClick={() => setDeletingArchetype(archetype)}
                    />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <DeleteEmployeeDialog
        archetype={deletingArchetype}
        refresh={refresh}
        onClose={() => setDeletingArchetype(null)}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        count={selected.size}
        selected={selected}
        archetypes={archetypes}
        refresh={refresh}
        onClose={() => {
          setSelected(new Set());
          setBulkDeleteOpen(false);
        }}
      />
    </div>
  );
}
