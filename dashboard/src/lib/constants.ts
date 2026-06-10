import type { TaskStatus } from './types';

const rc: Record<string, string> =
  typeof window !== 'undefined'
    ? (((window as unknown as Record<string, unknown>).__RUNTIME_CONFIG__ as Record<
        string,
        string
      >) ?? {})
    : {};

export const POSTGREST_URL =
  rc['VITE_POSTGREST_URL'] ||
  import.meta.env.VITE_POSTGREST_URL ||
  'http://localhost:54331/rest/v1';

export const SUPABASE_ANON_KEY =
  rc['VITE_SUPABASE_ANON_KEY'] || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const GATEWAY_URL =
  rc['VITE_GATEWAY_URL'] || import.meta.env.VITE_GATEWAY_URL || 'http://localhost:7700';

export const INNGEST_URL =
  rc['VITE_INNGEST_URL'] || import.meta.env.VITE_INNGEST_URL || 'http://localhost:8288';

export const POLL_INTERVAL_MS = 5000;

export const TERMINAL_STATUSES = ['Done', 'Failed', 'Cancelled'] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export const STATUS_COLORS: Record<TaskStatus, string> = {
  Received: 'bg-slate-100 text-slate-700',
  Triaging: 'bg-blue-100 text-blue-700',
  AwaitingInput: 'bg-purple-100 text-purple-700',
  Ready: 'bg-cyan-100 text-cyan-700',
  Executing: 'bg-blue-100 text-blue-800',
  Validating: 'bg-indigo-100 text-indigo-700',
  Submitting: 'bg-yellow-100 text-yellow-800',
  Reviewing: 'bg-amber-100 text-amber-800',
  Approved: 'bg-emerald-100 text-emerald-700',
  Delivering: 'bg-teal-100 text-teal-700',
  Done: 'bg-green-100 text-green-800',
  Failed: 'bg-red-100 text-red-800',
  Cancelled: 'bg-gray-100 text-gray-600',
};

export const HOSTFULLY_TEST = {
  agencyUid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
  threadUid: 'dc2c8f5e-b83d-4078-b709-cc03bf47dd4a',
  leadUid: 'f83d431f-0985-457b-a535-60c2991b7c83',
  propertyUid: '51ec272e-8819-4c8e-b8a3-9a2286b3ed65',
};

export const WEBHOOK_FIXTURES = {
  agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
  thread_uid: '2f18249a-9523-4acd-a512-20ff06d5c3fa',
  lead_uid: '37f5f58f-d308-42bf-8ed3-f0c2d70f16fb',
  property_uid: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
} as const;
