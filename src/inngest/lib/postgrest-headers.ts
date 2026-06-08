/**
 * Canonical header superset for PostgREST requests from Inngest functions.
 * Callers needing a different directive spread and override:
 *   `{ ...makePostgrestHeaders(key), Prefer: 'return=minimal' }`.
 * GET requests ignore `Content-Type` and `Prefer`, so the superset is safe everywhere.
 */
export function makePostgrestHeaders(supabaseKey: string): Record<string, string> {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}
