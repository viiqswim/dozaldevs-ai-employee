import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Tools</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shell tools available to AI employees. Auto-discovered from source files.
        </p>
        {tools && <span className="text-sm text-muted-foreground">({tools.length} tools)</span>}
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
          {tools.map((tool) => (
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
