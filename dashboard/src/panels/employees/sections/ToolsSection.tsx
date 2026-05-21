import { useEffect, useState } from 'react';
import { fetchBrainPreview } from '@/lib/gateway';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Archetype, BrainPreviewResponse } from '@/lib/types';

interface ToolsSectionProps {
  archetype: Archetype;
  tenantId: string;
}

export function ToolsSection({ archetype, tenantId }: ToolsSectionProps) {
  const [data, setData] = useState<BrainPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchBrainPreview(tenantId, archetype.id)
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load tools.');
        setLoading(false);
      });
  }, [tenantId, archetype.id]);

  const toolsByService =
    data?.tools.reduce<Record<string, typeof data.tools>>((acc, t) => {
      if (!acc[t.service]) acc[t.service] = [];
      acc[t.service].push(t);
      return acc;
    }, {}) ?? {};

  const toolCount = data?.tools.length ?? 0;
  const skillCount = data?.skills.length ?? 0;

  const badge =
    !loading && data ? (
      <Badge variant="secondary" className="text-xs">
        {toolCount + skillCount} {toolCount + skillCount === 1 ? 'tool' : 'tools'}
      </Badge>
    ) : null;

  return (
    <CollapsibleSection
      id="section-tools"
      title="Tools"
      subtitle="What this employee can use"
      defaultOpen={true}
      badge={badge}
    >
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md border bg-muted" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : toolCount === 0 && skillCount === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No tools configured for this employee.
        </p>
      ) : (
        <div className="space-y-4">
          {Object.entries(toolsByService).map(([service, tools]) => (
            <div key={service}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground capitalize">
                {service}
              </p>
              <ul className="space-y-1.5">
                {tools.map((t) => (
                  <li
                    key={t.name}
                    className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <span className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
                      {t.name}
                    </span>
                    <span className="text-xs text-muted-foreground">—</span>
                    <span className="text-xs text-muted-foreground">{t.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {data && data.skills.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  On-demand Skills
                </p>
                <ul className="space-y-1.5">
                  {data.skills.map((skill) => (
                    <li
                      key={skill.name}
                      className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2"
                    >
                      <span className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
                        {skill.name}
                      </span>
                      <span className="text-xs text-muted-foreground">—</span>
                      <span className="text-xs text-muted-foreground">{skill.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
