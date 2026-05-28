export type ProfileMode = 'view' | 'edit' | 'create';

export const SECTION_LABELS: Record<string, { label: string; subtitle: string }> = {
  instructions: {
    label: 'The Assignment',
    subtitle: "What this employee does each time they're triggered",
  },
  agents_md: {
    label: 'Personality',
    subtitle: 'How this employee approaches their work',
  },
  'tool_registry.tools': {
    label: 'Tools',
    subtitle: 'What this employee can use',
  },
  'risk_model.approval_required': {
    label: 'Requires approval',
    subtitle: '',
  },
  notification_channel: {
    label: 'Slack channel',
    subtitle: '',
  },
  'risk_model.timeout_hours': {
    label: 'Maximum duration',
    subtitle: '',
  },
  concurrency_limit: {
    label: 'Simultaneous tasks',
    subtitle: '',
  },
  model: {
    label: 'AI Model',
    subtitle: '',
  },
  runtime: {
    label: 'Runtime',
    subtitle: '',
  },
  vm_size: {
    label: 'Machine size',
    subtitle: '',
  },
  deliverable_type: {
    label: 'Output type',
    subtitle: '',
  },
};

export const SECTION_ORDER = [
  'assignment',
  'personality',
  'tools',
  'settings',
  'preview',
  'activity',
  'training',
] as const;

export type SectionId = (typeof SECTION_ORDER)[number];

export function getSectionLabel(sectionId: string): { label: string; subtitle: string } {
  return SECTION_LABELS[sectionId] ?? { label: sectionId, subtitle: '' };
}
