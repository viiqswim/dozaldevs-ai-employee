import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Search, X } from 'lucide-react';
import { fetchTools } from '@/lib/gateway';
import type { ToolMetadata } from '@/lib/types';

const SERVICE_BADGE_CLASS: Record<string, string> = {
  slack: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  hostfully: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  sifely: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  knowledge_base: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  platform: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function serviceBadgeClass(service: string): string {
  return SERVICE_BADGE_CLASS[service] ?? 'bg-gray-100 text-gray-700';
}

function truncate(text: string, max = 100): string {
  return text.length > max ? text.slice(0, 97) + '...' : text;
}

export function ToolList() {
  const [tools, setTools] = useState<ToolMetadata[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get('q') ?? '';
  const selectedServices = new Set(searchParams.get('service')?.split(',').filter(Boolean) ?? []);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchTools()
      .then(({ tools: data }) => {
        setTools(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setServiceSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading tools...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Failed to load tools</p>
          <p className="mt-1 text-destructive/80">{error.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
            onClick={load}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!tools || tools.length === 0) {
    return (
      <div className="flex items-center justify-center p-16 text-center">
        <p className="text-muted-foreground">No tools found</p>
      </div>
    );
  }

  const allServices = Array.from(new Set(tools.map((t) => t.service))).sort();
  const filteredServices = allServices.filter((s) =>
    s.toLowerCase().includes(serviceSearch.toLowerCase()),
  );

  const q = query.toLowerCase();
  const filteredTools = tools.filter((tool) => {
    const matchesQuery =
      q === '' || tool.name.toLowerCase().includes(q) || tool.description.toLowerCase().includes(q);
    const matchesService = selectedServices.size === 0 || selectedServices.has(tool.service);
    return matchesQuery && matchesService;
  });

  const hasFilters = query !== '' || selectedServices.size > 0;

  const toggleService = (svc: string) => {
    const next = new URLSearchParams(searchParams);
    const cur = new Set(next.get('service')?.split(',').filter(Boolean) ?? []);
    if (cur.has(svc)) {
      cur.delete(svc);
    } else {
      cur.add(svc);
    }
    if (cur.size === 0) {
      next.delete('service');
    } else {
      next.set('service', [...cur].join(','));
    }
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    next.delete('service');
    setSearchParams(next, { replace: true });
    setServiceSearch('');
  };

  const serviceLabel = () => {
    if (selectedServices.size === 0) return 'Service';
    if (selectedServices.size === 1) return `Service: ${Array.from(selectedServices)[0]}`;
    return `Service (${selectedServices.size})`;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Tools</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shell tools available to AI employees. Auto-discovered from source files.
        </p>
        <span className="text-sm text-muted-foreground">
          {hasFilters
            ? `(${filteredTools.length} of ${tools.length} tools)`
            : `(${tools.length} tools)`}
        </span>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search tools..."
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              const next = new URLSearchParams(searchParams);
              if (!v) {
                next.delete('q');
              } else {
                next.set('q', v);
              }
              setSearchParams(next, { replace: true });
            }}
          />
        </div>

        <div className="relative w-52" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <span className="truncate">{serviceLabel()}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full rounded-md border border-border bg-popover shadow-md">
              <div className="p-2">
                <Input
                  placeholder="Search services..."
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {filteredServices.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No services found</p>
                ) : (
                  filteredServices.map((service) => {
                    const checked = selectedServices.has(service);
                    return (
                      <button
                        key={service}
                        type="button"
                        onClick={() => toggleService(service)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input bg-background'
                          }`}
                        >
                          {checked && (
                            <svg
                              viewBox="0 0 12 12"
                              className="h-3 w-3 fill-current"
                              aria-hidden="true"
                            >
                              <path
                                d="M10 3L5 8.5 2 5.5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                        <Badge className={`${serviceBadgeClass(service)} pointer-events-none`}>
                          {service}
                        </Badge>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Tool Name</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredTools.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                No tools match the current filters
              </TableCell>
            </TableRow>
          ) : (
            filteredTools.map((tool) => (
              <TableRow key={`${tool.service}/${tool.name}`}>
                <TableCell>
                  <Badge className={serviceBadgeClass(tool.service)}>{tool.service}</Badge>
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    to={`/dashboard/tools/${tool.service}/${tool.name}`}
                    className="hover:underline"
                  >
                    {tool.name}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {truncate(tool.description)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
