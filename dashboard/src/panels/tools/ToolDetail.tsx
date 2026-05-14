import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchTool } from '@/lib/gateway';
import type { ToolMetadata, ToolFlag } from '@/lib/types';

function serviceBadgeClass(service: string): string {
  switch (service) {
    case 'slack':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
    case 'hostfully':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300';
    case 'sifely':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';
    case 'knowledge_base':
      return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300';
    case 'platform':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function buildCliUsage(tool: ToolMetadata): string {
  const required = tool.flags
    .filter((f) => f.required)
    .map((f: ToolFlag) => (f.type === 'boolean' ? f.name : `${f.name} <${f.type}>`))
    .join(' ');
  const optional = tool.flags
    .filter((f) => !f.required)
    .map((f: ToolFlag) => (f.type === 'boolean' ? `[${f.name}]` : `[${f.name} <${f.type}>]`))
    .join(' ');
  const parts = [`tsx ${tool.containerPath}`, required, optional].filter(Boolean);
  return parts.join(' ');
}

const BACK_LINK_CLASS =
  'text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline';

export function ToolDetail() {
  const { service, toolName } = useParams<{ service: string; toolName: string }>();
  const [tool, setTool] = useState<ToolMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!service || !toolName) {
      setError('Missing service or tool name');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchTool(service, toolName)
      .then((data) => {
        setTool(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [service, toolName]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading tool details...</div>;
  }

  if (error || !tool) {
    return (
      <div className="p-6">
        <Link to="/dashboard/tools" className={BACK_LINK_CLASS}>
          ← Back to Tools
        </Link>
        <p className="mt-4 text-muted-foreground">Tool not found</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link to="/dashboard/tools" className={BACK_LINK_CLASS}>
          ← Back to Tools
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <h2 className="text-xl font-semibold">{tool.name}</h2>
          <Badge className={serviceBadgeClass(tool.service)}>{tool.service}</Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{tool.containerPath}</p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{tool.description}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CLI Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs font-mono">
              {buildCliUsage(tool)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flag</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tool.flags.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No flags
                    </TableCell>
                  </TableRow>
                ) : (
                  tool.flags.map((flag) => (
                    <TableRow key={flag.name}>
                      <TableCell className="font-mono text-xs">{flag.name}</TableCell>
                      <TableCell className="text-sm">{flag.type}</TableCell>
                      <TableCell className="text-sm">{flag.required ? '✓' : '—'}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {flag.default ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {flag.description ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {tool.envVars.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Environment Variables</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variable</TableHead>
                    <TableHead>Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tool.envVars.map((envVar) => (
                    <TableRow key={envVar.name}>
                      <TableCell className="font-mono text-xs">{envVar.name}</TableCell>
                      <TableCell className="text-sm">{envVar.required ? '✓' : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {tool.outputShape && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Output Shape</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs font-mono">
                {tool.outputShape}
              </pre>
            </CardContent>
          </Card>
        )}

        {tool.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes &amp; Warnings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{tool.notes}</p>
            </CardContent>
          </Card>
        )}

        {tool.example && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Example</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs font-mono">
                {tool.example}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator className="my-6" />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard/tools">← Back to Tools</Link>
        </Button>
      </div>
    </div>
  );
}
