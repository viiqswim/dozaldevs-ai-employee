import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import type { Archetype } from '@/lib/types';
import type { ProfileMode } from '@/lib/profile-constants';
import { AssignmentSection } from './sections/AssignmentSection';
import { PersonalitySection } from './sections/PersonalitySection';
import { ToolsSection } from './sections/ToolsSection';
import { CompactSettingsGrid } from './sections/CompactSettingsGrid';
import { ProfilePreviewSection } from './sections/ProfilePreviewSection';
import { CollapsibleSection } from './components/CollapsibleSection';
import { TrainingTab } from './TrainingTab';
import { ActivitySection } from './sections/ActivitySection';

interface EmployeeProfileLayoutProps {
  archetype: Archetype;
  mode: ProfileMode;
  tenantId: string;
  onSaved: () => void;
  showActivity?: boolean;
  showTraining?: boolean;
}

export function EmployeeProfileLayout({
  archetype,
  mode,
  tenantId,
  onSaved,
  showActivity = true,
  showTraining = true,
}: EmployeeProfileLayoutProps) {
  return (
    <div className="space-y-6">
      <AssignmentSection archetype={archetype} mode={mode} onSaved={onSaved} tenantId={tenantId} />

      <PersonalitySection archetype={archetype} mode={mode} onSaved={onSaved} tenantId={tenantId} />

      <ToolsSection archetype={archetype} tenantId={tenantId} />

      <CompactSettingsGrid
        archetype={archetype}
        mode={mode}
        onSaved={onSaved}
        tenantId={tenantId}
      />

      <ProfilePreviewSection archetype={archetype} tenantId={tenantId} />

      {showActivity && (
        <CollapsibleSection
          id="section-activity"
          title="Recent Activity"
          subtitle="Last tasks run by this employee"
          defaultOpen={false}
        >
          <ActivitySection archetypeId={archetype.id} />
        </CollapsibleSection>
      )}

      {showTraining && (
        <CollapsibleSection
          id="section-training"
          title="Training"
          subtitle="Rules this employee has learned from your feedback"
          defaultOpen={false}
        >
          <TrainingTab archetypeId={archetype.id} tenantId={tenantId} />
        </CollapsibleSection>
      )}

      <div className="rounded-lg border bg-card px-5 py-4">
        <Accordion type="single" collapsible>
          <AccordionItem value="advanced" className="border-none">
            <AccordionTrigger className="py-2 text-sm font-medium text-muted-foreground hover:no-underline">
              Advanced / Technical
            </AccordionTrigger>
            <AccordionContent>
              <p className="mb-3 text-xs text-muted-foreground">
                For developers only — most users can ignore this section.
              </p>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <dl>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      AI Model
                    </dt>
                    <dd className="mt-0.5">
                      <span className="font-mono text-xs">{archetype.model ?? '—'}</span>
                    </dd>
                  </dl>
                  <dl>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Runtime
                    </dt>
                    <dd className="mt-0.5 text-sm">{archetype.runtime ?? '—'}</dd>
                  </dl>
                  <dl>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Machine size
                    </dt>
                    <dd className="mt-0.5 text-sm">{archetype.vm_size ?? '—'}</dd>
                  </dl>
                  <dl>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Output type
                    </dt>
                    <dd className="mt-0.5 text-sm">{archetype.deliverable_type ?? '—'}</dd>
                  </dl>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    System prompt (legacy)
                  </dt>
                  <dd className="mt-1 rounded-md border bg-muted/10 p-4">
                    <MarkdownPreview content={archetype.system_prompt ?? ''} />
                  </dd>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
