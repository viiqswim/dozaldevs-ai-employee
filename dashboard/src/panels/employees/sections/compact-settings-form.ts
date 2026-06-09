import type { Archetype } from '@/lib/types';

export type FormState = {
  approvalRequired: boolean;
  timeoutHours: number;
  notificationChannel: string;
  concurrencyLimit: number;
  manualMinutesOverride: number | null;
  temperature: string;
  saveError: string | null;
};

export type FormAction =
  | { type: 'SET_APPROVAL_REQUIRED'; value: boolean }
  | { type: 'SET_TIMEOUT_HOURS'; value: number }
  | { type: 'SET_NOTIFICATION_CHANNEL'; value: string }
  | { type: 'SET_CONCURRENCY_LIMIT'; value: number }
  | { type: 'SET_MANUAL_MINUTES_OVERRIDE'; value: number | null }
  | { type: 'SET_TEMPERATURE'; value: string }
  | { type: 'SET_SAVE_ERROR'; value: string | null }
  | { type: 'RESET'; archetype: Archetype };

export function initForm(archetype: Archetype): FormState {
  return {
    approvalRequired: archetype.risk_model?.approval_required ?? false,
    timeoutHours: archetype.risk_model?.timeout_hours ?? 0,
    notificationChannel: archetype.notification_channel ?? '',
    concurrencyLimit: archetype.concurrency_limit,
    manualMinutesOverride: archetype.estimated_manual_minutes_override ?? null,
    temperature:
      archetype.temperature !== null && archetype.temperature !== undefined
        ? String(archetype.temperature)
        : '1.0',
    saveError: null,
  };
}

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_APPROVAL_REQUIRED':
      return { ...state, approvalRequired: action.value };
    case 'SET_TIMEOUT_HOURS':
      return { ...state, timeoutHours: action.value };
    case 'SET_NOTIFICATION_CHANNEL':
      return { ...state, notificationChannel: action.value };
    case 'SET_CONCURRENCY_LIMIT':
      return { ...state, concurrencyLimit: action.value };
    case 'SET_MANUAL_MINUTES_OVERRIDE':
      return { ...state, manualMinutesOverride: action.value };
    case 'SET_TEMPERATURE':
      return { ...state, temperature: action.value };
    case 'SET_SAVE_ERROR':
      return { ...state, saveError: action.value };
    case 'RESET':
      return initForm(action.archetype);
    default:
      return state;
  }
}
