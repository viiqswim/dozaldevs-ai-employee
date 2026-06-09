import { createClient } from '@supabase/supabase-js';

function getSupabaseConfig(): { url: string; anonKey: string } {
  const rc =
    typeof window !== 'undefined'
      ? (((window as unknown as Record<string, unknown>).__RUNTIME_CONFIG__ as Record<
          string,
          string
        >) ?? {})
      : {};

  const postgrestUrl =
    rc['VITE_POSTGREST_URL'] ||
    (typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_POSTGREST_URL
      : '') ||
    'http://localhost:54331/rest/v1';

  const anonKey =
    rc['VITE_SUPABASE_ANON_KEY'] ||
    (typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_SUPABASE_ANON_KEY
      : '') ||
    '';

  const url = postgrestUrl.replace(/\/rest\/v1\/?$/, '') || 'http://localhost:54331';

  return { url, anonKey };
}

export function createSupabaseClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey);
}

export const supabase = createSupabaseClient();
