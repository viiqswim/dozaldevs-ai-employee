import { createLogger } from '../../lib/logger.js';

export interface PostgRESTClient {
  get(table: string, query: string): Promise<unknown[] | null>;
  post(table: string, body: Record<string, unknown>): Promise<unknown | null>;
  patch(table: string, query: string, body: Record<string, unknown>): Promise<unknown | null>;
}

const log = createLogger('postgrest-client');

function buildConfig(): { baseUrl: string; headers: Record<string, string> } | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return {
    baseUrl: `${supabaseUrl}/rest/v1`,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  };
}

export async function query<T>(table: string, params: string): Promise<T[] | null> {
  const config = buildConfig();
  if (!config) {
    log.warn('[postgrest-client] query: Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    return null;
  }
  try {
    const url = `${config.baseUrl}/${table}?${params}`;
    const response = await fetch(url, { method: 'GET', headers: config.headers });
    if (!response.ok) {
      log.warn(`[postgrest-client] query ${table} failed with HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    return Array.isArray(data) ? (data as T[]) : null;
  } catch (error) {
    log.warn(
      `[postgrest-client] query ${table} error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function insert<T>(table: string, data: Record<string, unknown>): Promise<T | null> {
  const config = buildConfig();
  if (!config) {
    log.warn('[postgrest-client] insert: Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    return null;
  }
  try {
    const url = `${config.baseUrl}/${table}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      log.warn(`[postgrest-client] insert ${table} failed with HTTP ${response.status}`);
      return null;
    }
    const result = await response.json();
    return (Array.isArray(result) ? result[0] : result) as T | null;
  } catch (error) {
    log.warn(
      `[postgrest-client] insert ${table} error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function update<T>(
  table: string,
  data: Record<string, unknown>,
  filter: string,
): Promise<T[] | null> {
  const config = buildConfig();
  if (!config) {
    log.warn('[postgrest-client] update: Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    return null;
  }
  try {
    const url = `${config.baseUrl}/${table}?${filter}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: config.headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      log.warn(`[postgrest-client] update ${table} failed with HTTP ${response.status}`);
      return null;
    }
    const result = await response.json();
    return result as T[];
  } catch (error) {
    log.warn(
      `[postgrest-client] update ${table} error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export function createPostgRESTClient(): PostgRESTClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  // Validate environment variables
  if (!supabaseUrl || !supabaseKey) {
    log.warn('[postgrest-client] Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    return {
      get: async () => null,
      post: async () => null,
      patch: async () => null,
    };
  }

  const baseUrl = `${supabaseUrl}/rest/v1`;
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  return {
    async get(table: string, query: string): Promise<unknown[] | null> {
      try {
        const url = `${baseUrl}/${table}?${query}`;
        const response = await fetch(url, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          log.warn(`[postgrest-client] GET ${table} failed with HTTP ${response.status}`);
          return null;
        }

        const data = await response.json();
        return Array.isArray(data) ? data : null;
      } catch (error) {
        log.warn(
          `[postgrest-client] GET ${table} error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    },

    async post(table: string, body: Record<string, unknown>): Promise<unknown | null> {
      try {
        const url = `${baseUrl}/${table}`;
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          log.warn(`[postgrest-client] POST ${table} failed with HTTP ${response.status}`);
          return null;
        }

        const data = await response.json();
        // PostgREST returns an array; return the first element
        return Array.isArray(data) ? data[0] : data;
      } catch (error) {
        log.warn(
          `[postgrest-client] POST ${table} error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    },

    async patch(
      table: string,
      query: string,
      body: Record<string, unknown>,
    ): Promise<unknown | null> {
      try {
        const url = `${baseUrl}/${table}?${query}`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          log.warn(`[postgrest-client] PATCH ${table} failed with HTTP ${response.status}`);
          return null;
        }

        const data = await response.json();
        return data;
      } catch (error) {
        log.warn(
          `[postgrest-client] PATCH ${table} error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    },
  };
}
