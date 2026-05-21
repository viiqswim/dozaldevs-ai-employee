import type { Archetype } from '@/lib/types';
import type { ProfileMode } from '@/lib/profile-constants';
import { AssignmentSection } from './sections/AssignmentSection';
import { PersonalitySection } from './sections/PersonalitySection';
import { ToolsSection } from './sections/ToolsSection';
import { CompactSettingsGrid } from './sections/CompactSettingsGrid';
import { ProfilePreviewSection } from './sections/ProfilePreviewSection';

interface EmployeeProfileLayoutProps {
  archetype: Archetype;
  mode: ProfileMode;
  tenantId: string;
  onSaved: () => void;
}

export function EmployeeProfileLayout({
  archetype,
  mode,
  tenantId,
  onSaved,
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
    </div>
  );
}
