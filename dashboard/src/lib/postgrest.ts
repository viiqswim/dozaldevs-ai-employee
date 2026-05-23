import { POSTGREST_URL, SUPABASE_ANON_KEY } from './constants';

/**
 * Thin fetch wrapper for PostgREST.
 * Kong requires BOTH apikey AND Authorization: Bearer headers — missing either returns 401.
 */
export async function postgrestFetch<T>(
  table: string,
  params?: Record<string, string>,
): Promise<T[]> {
  const defaultParams: Record<string, string> = {
    order: 'created_at.desc',
    limit: '100',
  };

  const merged = { ...defaultParams, ...params };
  if (merged.limit === 'none') delete merged.limit;
  const searchParams = new URLSearchParams(merged);
  const url = `${POSTGREST_URL}/${table}?${searchParams.toString()}`;

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PostgREST error ${response.status} on ${table}: ${text}`);
  }

  return response.json() as Promise<T[]>;
}

/**
 * Returns PostgREST filter params to scope a query by tenant.
 */
export function scopeByTenant(tenantId: string): Record<string, string> {
  return { tenant_id: `eq.${tenantId}` };
}
