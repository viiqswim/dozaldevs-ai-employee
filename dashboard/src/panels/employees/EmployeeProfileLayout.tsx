import type { Archetype } from '@/lib/types';
import type { ProfileMode } from '@/lib/profile-constants';
import { PersonalitySection } from './sections/PersonalitySection';
import { ExecutionStepsSection } from './sections/ExecutionStepsSection';
import { DeliveryStepsSection } from './sections/DeliveryStepsSection';
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
      <PersonalitySection archetype={archetype} mode={mode} onSaved={onSaved} tenantId={tenantId} />

      <ExecutionStepsSection
        archetype={archetype}
        mode={mode}
        onSaved={onSaved}
        tenantId={tenantId}
      />

      <DeliveryStepsSection
        archetype={archetype}
        mode={mode}
        onSaved={onSaved}
        tenantId={tenantId}
      />

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
