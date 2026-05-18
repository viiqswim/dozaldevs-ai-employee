import { Check, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ArchetypeOverview } from '@/lib/types';

interface EmployeeOverviewProps {
  overview: ArchetypeOverview | null;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function SectionContent({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-foreground">{children}</div>;
}

export function EmployeeOverview({ overview }: EmployeeOverviewProps) {
  if (!overview) {
    return <p className="text-sm text-muted-foreground">Overview not available</p>;
  }

  const approvalRequired = overview.approval.toLowerCase().includes('required');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <SectionLabel>Role</SectionLabel>
          <SectionContent>{overview.role}</SectionContent>
        </div>

        <div>
          <SectionLabel>Trigger</SectionLabel>
          <SectionContent>{overview.trigger}</SectionContent>
        </div>

        <div>
          <SectionLabel>Workflow</SectionLabel>
          <SectionContent>
            <ol className="list-decimal space-y-1 pl-4">
              {overview.workflow.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </SectionContent>
        </div>

        <div>
          <SectionLabel>Tools Used</SectionLabel>
          <SectionContent>{overview.tools_used}</SectionContent>
        </div>

        <div>
          <SectionLabel>Output</SectionLabel>
          <SectionContent>{overview.output}</SectionContent>
        </div>

        <div>
          <SectionLabel>Approval</SectionLabel>
          <SectionContent>
            <div className="flex items-start gap-2">
              {approvalRequired ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : (
                <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span>{overview.approval}</span>
            </div>
          </SectionContent>
        </div>
      </CardContent>
    </Card>
  );
}
